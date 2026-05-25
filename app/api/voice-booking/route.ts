import { NextResponse } from "next/server";
import { generateObject, NoObjectGeneratedError } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { BOOKING_GUEST_TYPE_OPTIONS } from "@/lib/booking-meta";
import { normalizeGuestTypeHint } from "@/lib/voice-booking/guest-type";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  transcript: z.string().min(1),
  nowIso: z.string().min(1),
  branch: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
  }),
  areas: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
    })
  ),
  tables: z.array(
    z.object({
      id: z.string().min(1),
      name: z.string().min(1),
      seats: z.number().int().positive(),
      areaId: z.string().min(1),
    })
  ),
});

/** Flat schema for the LLM — strict enums/nested shapes often fail first-try validation. */
const LlmOutputSchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  guestCount: z.number().int().positive().optional(),
  bookingAtLocal: z
    .string()
    .optional()
    .describe("Local time in format YYYY-MM-DDTHH:mm (24h)."),
  areaNameHint: z.string().optional(),
  tableNameHint: z.string().optional(),
  note: z.string().optional(),
  guestType: z
    .string()
    .optional()
    .describe(
      `Loại khách khi được nói rõ (vd: VIP, sinh nhật). Gợi ý: ${BOOKING_GUEST_TYPE_OPTIONS.join(", ")}.`
    ),
  clarificationQuestion: z
    .string()
    .optional()
    .describe(
      "Optional short Vietnamese hint suggesting what the user could add next. Never required for analysis."
    ),
});

type VoiceBookingApiResponse = {
  draft: {
    customerName?: string;
    customerPhone?: string;
    guestCount?: number;
    bookingAtLocal?: string;
    areaNameHint?: string;
    tableNameHint?: string;
    note?: string;
    guestType?: string;
  };
  missing: Array<"customerName" | "bookingAtLocal">;
  clarificationQuestion?: string;
};

function buildVoiceBookingResponse(
  raw: z.infer<typeof LlmOutputSchema>
): VoiceBookingApiResponse {
  const { clarificationQuestion, guestType: guestTypeHint, ...draftFields } = raw;
  const guestType = normalizeGuestTypeHint(guestTypeHint) ?? undefined;
  const draft = { ...draftFields, ...(guestType ? { guestType } : {}) };

  const missing: VoiceBookingApiResponse["missing"] = [];
  if (!draft.customerName?.trim()) missing.push("customerName");
  if (!draft.bookingAtLocal?.trim()) missing.push("bookingAtLocal");

  return {
    draft,
    missing,
    ...(clarificationQuestion?.trim() ? { clarificationQuestion: clarificationQuestion.trim() } : {}),
  };
}

const PARSE_ATTEMPTS = 3;

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const input = RequestSchema.parse(json);

    const areaLines = input.areas.map((a) => `- ${a.name}`).join("\n");
    const tableLines = input.tables
      .map((t) => {
        const areaName = input.areas.find((a) => a.id === t.areaId)?.name ?? "—";
        return `- ${t.name} (khu: ${areaName}, sức chứa: ${t.seats})`;
      })
      .join("\n");

    const system = [
      "You are a manager-only voice assistant that converts Vietnamese booking speech into a structured booking draft for an internal restaurant booking system.",
      "Be direct. No politeness. No greetings. No filler.",
      "Your job: extract ONLY the booking fields explicitly present or clearly implied in the transcript. Partial drafts are expected and correct.",
      "Never invent or guess values for fields not mentioned. Omit optional fields instead of filling them.",
      "Analysis must succeed with any subset of fields (e.g. only customerName, or only bookingAtLocal, or name + time).",
      "Do NOT invent table IDs. Only return tableNameHint / areaNameHint as plain strings when mentioned.",
      `Time handling: now is ${input.nowIso}. Convert relative times (e.g. 'tối nay', 'mai', 'thứ bảy') into local time string YYYY-MM-DDTHH:mm (24h) in Vietnam time when a time is mentioned.`,
      "Phone, guestCount, area, table, guestType and note are optional.",
      "guestType: set only when the speaker clearly indicates customer type (VIP, sinh nhật, đoàn, khách quen, đặt món trước). Use a short Vietnamese label; otherwise omit.",
      `Preferred guestType labels: ${BOOKING_GUEST_TYPE_OPTIONS.join(", ")}.`,
      "clarificationQuestion: optional soft hint only (e.g. suggest adding phone or time) — never treat as blocking analysis.",
      "Phone handling: keep raw digits as spoken; accept +84 forms when present.",
      "If the transcript contains multiple bookings, only draft the first one and ignore the rest.",
    ].join("\n");

    const user = [
      `Branch: ${input.branch.name}`,
      "Areas:",
      areaLines || "- (none)",
      "Tables:",
      tableLines || "- (none)",
      "",
      `Transcript: """${input.transcript}"""`,
    ].join("\n");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      let lastError: unknown;
      for (let attempt = 0; attempt < PARSE_ATTEMPTS; attempt++) {
        try {
          const result = await generateObject({
            model: openai("gpt-4.1-mini"),
            schema: LlmOutputSchema,
            system,
            prompt: user,
            abortSignal: controller.signal,
          });
          return NextResponse.json(buildVoiceBookingResponse(result.object));
        } catch (error) {
          lastError = error;
          const retryable =
            NoObjectGeneratedError.isInstance(error) && attempt < PARSE_ATTEMPTS - 1;
          if (!retryable) break;
        }
      }

      throw lastError;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

