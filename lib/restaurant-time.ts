import dayjs from "dayjs";

/** Vietnam restaurant local calendar (UTC+7, no DST). */
export const RESTAURANT_UTC_OFFSET_MINUTES = 7 * 60;

/** Vietnam local datetime `YYYY-MM-DDTHH:mm` from an ISO instant. */
export function toRestaurantLocalDatetime(iso: string): string {
  const base = dayjs(iso);
  if (!base.isValid()) {
    return dayjs().add(RESTAURANT_UTC_OFFSET_MINUTES, "minute").format("YYYY-MM-DDTHH:mm");
  }
  return base.add(RESTAURANT_UTC_OFFSET_MINUTES, "minute").format("YYYY-MM-DDTHH:mm");
}

/** Calendar date `YYYY-MM-DD` in restaurant local time. */
export function restaurantCalendarDateKey(iso?: string): string {
  const base = iso ? dayjs(iso) : dayjs();
  if (!base.isValid()) {
    return "";
  }
  return base.add(RESTAURANT_UTC_OFFSET_MINUTES, "minute").format("YYYY-MM-DD");
}

export function restaurantTomorrowDateKey(iso?: string): string {
  const today = restaurantCalendarDateKey(iso);
  if (!today) {
    return "";
  }
  return dayjs(today).add(1, "day").format("YYYY-MM-DD");
}

/** LLM prompt block: unambiguous Vietnam calendar reference for relative dates. */
export function buildRestaurantTimeContext(nowIso: string): string {
  const localNow = toRestaurantLocalDatetime(nowIso);
  const today = restaurantCalendarDateKey(nowIso);
  const tomorrow = restaurantTomorrowDateKey(nowIso);
  return [
    `Current Vietnam local datetime (UTC+7): ${localNow}.`,
    `Calendar today (hôm nay / nay / tối nay): ${today}.`,
    `Calendar tomorrow (ngày mai / mai): ${tomorrow}.`,
    "Resolve relative dates against the Vietnam calendar dates above — never UTC.",
    "Output bookingAtLocal as YYYY-MM-DDTHH:mm (24h) in Vietnam local time.",
  ].join(" ");
}
