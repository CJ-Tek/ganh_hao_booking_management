import { NextResponse } from "next/server";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

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

const DraftSchema = z.object({
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
});

const ResponseSchema = z.object({
  draft: DraftSchema,
  missing: z.array(z.enum(["customerName", "bookingAtLocal"])),
  clarificationQuestion: z.string().optional(),
});

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
      "Your job: extract booking fields from the transcript and ask for exactly ONE missing/ambiguous piece of information when needed.",
      "Minimum required fields to create a booking are ONLY customerName and bookingAtLocal.",
      "Do NOT invent table IDs. Only return tableNameHint / areaNameHint as plain strings when mentioned.",
      `Time handling: now is ${input.nowIso}. Convert relative times (e.g. 'tối nay', 'mai', 'thứ bảy') into local time string YYYY-MM-DDTHH:mm (24h) in Vietnam time.`,
      "Phone, guestCount, area and table are optional.",
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
    const timeout = setTimeout(() => controller.abort(), 12_000);

    const result = await generateObject({
      model: openai("gpt-4.1-mini"),
      schema: ResponseSchema,
      system,
      prompt: user,
      maxRetries: 0,
      abortSignal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    return NextResponse.json(result.object);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

