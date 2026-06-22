import dayjs from "dayjs";
import {
  restaurantCalendarDateKey,
  restaurantTomorrowDateKey,
} from "@/lib/restaurant-time";

export type RelativeBookingDay = "today" | "tomorrow";

/** Detect explicit relative day phrases in Vietnamese booking speech/text. */
export function inferRelativeBookingDay(transcript: string): RelativeBookingDay | null {
  const t = transcript.normalize("NFC").toLowerCase();
  if (
    /\bngày\s*mai\b/.test(t) ||
    /\bs[áa]ng\s*mai\b/.test(t) ||
    /\bchi[eề]u\s*mai\b/.test(t) ||
    /\bt[ốo]i\s*mai\b/.test(t) ||
    (/\bmai\b/.test(t) && /\d{1,2}\s*h/.test(t))
  ) {
    return "tomorrow";
  }
  if (/\b(hôm nay|tối nay|chiều nay|sáng nay)\b/.test(t)) {
    return "today";
  }
  return null;
}

/** Keep LLM time-of-day but fix calendar date when transcript clearly says today/tomorrow. */
export function correctBookingAtLocalDate(
  bookingAtLocal: string,
  nowIso: string,
  transcript: string
): string {
  const relative = inferRelativeBookingDay(transcript);
  if (!relative) {
    return bookingAtLocal;
  }

  const parsed = dayjs(bookingAtLocal);
  if (!parsed.isValid()) {
    return bookingAtLocal;
  }

  const targetDate =
    relative === "today" ? restaurantCalendarDateKey(nowIso) : restaurantTomorrowDateKey(nowIso);
  if (!targetDate) {
    return bookingAtLocal;
  }

  return `${targetDate}T${parsed.format("HH:mm")}`;
}
