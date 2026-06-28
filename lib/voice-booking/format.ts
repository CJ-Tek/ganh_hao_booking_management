/** Letters (incl. Vietnamese), spaces, hyphen, comma, period. */
const CUSTOMER_NAME_DISALLOWED = /[^\p{L}\s\-,.]/gu;

const VIETNAMESE_LOCALE = "vi-VN";

/** Honorific prefixes often spoken before a guest name (Anh Huy, Chị Lan, …). */
export const CUSTOMER_NAME_HONORIFIC_PREFIXES = [
  "Anh",
  "Chị",
  "Em",
  "Cô",
  "Chú",
  "Bác",
  "Ông",
  "Bà",
  "Cậu",
  "Dì",
  "Thím",
  "Mợ",
] as const;

/**
 * Keep only allowed customer-name characters while preserving user casing.
 * Allowed: letters, spaces, `-`, `,`, `.`
 */
export function sanitizeCustomerName(input: string): string {
  return input.replace(CUSTOMER_NAME_DISALLOWED, "");
}

/** Sanitize, collapse whitespace, and trim edges. */
export function finalizeCustomerName(input: string): string {
  return sanitizeCustomerName(input).replace(/\s+/g, " ").trim();
}

/** Title-case each word for Vietnamese display names (e.g. nguyen → Nguyên, văn anh → Văn Anh). */
export function formatVietnameseCustomerName(input: string): string {
  return sanitizeCustomerName(input)
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLocaleLowerCase(VIETNAMESE_LOCALE);
      if (!lower) return "";
      return lower.charAt(0).toLocaleUpperCase(VIETNAMESE_LOCALE) + lower.slice(1);
    })
    .join(" ");
}

const FORMATTED_TRANSCRIPT_NAME_RE = /(Tên:\s*)([^.\n]+)/gi;

/** Apply Vietnamese name casing to the Tên clause in a formatted voice transcript. */
export function formatCustomerNameInTranscript(transcript: string): string {
  return transcript.replace(FORMATTED_TRANSCRIPT_NAME_RE, (_match, label: string, name: string) => {
    return `${label}${formatVietnameseCustomerName(name.trim())}`;
  });
}

const FORMATTED_TRANSCRIPT_NOTE_RE = /(Ghi chú:\s*)(.+)$/i;

/** Use commas between multiple note items inside the Ghi chú clause. */
export function formatNoteInTranscript(transcript: string): string {
  return transcript.replace(FORMATTED_TRANSCRIPT_NOTE_RE, (_match, label: string, noteBody: string) => {
    let body = noteBody.trim();
    const endsWithPeriod = body.endsWith(".");
    if (endsWithPeriod) {
      body = body.slice(0, -1).trim();
    }
    body = body.replace(/\.\s+/g, ", ");
    return `${label}${body}${endsWithPeriod ? "." : ""}`;
  });
}

export function finalizeFormattedTranscript(transcript: string): string {
  return formatNoteInTranscript(formatCustomerNameInTranscript(transcript));
}

/** Append a new voice session to existing transcript text. */
export function appendVoiceTranscriptSession(base: string, newSession: string): string {
  const trimmedBase = base.trim();
  const trimmedNew = newSession.trim();
  if (!trimmedBase) return trimmedNew;
  if (!trimmedNew) return trimmedBase;
  const separator = trimmedBase.endsWith(".") ? " " : ", ";
  return `${trimmedBase}${separator}${trimmedNew}`;
}

