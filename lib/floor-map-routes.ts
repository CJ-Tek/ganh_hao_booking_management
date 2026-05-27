import dayjs, { type Dayjs } from "dayjs";

export const FLOOR_MAP_DATE_PARAM = "date";
export const FLOOR_MAP_FOCUS_BOOKING_PARAM = "focusBooking";

export function parseFloorMapDateParam(value: string | null): Dayjs | null {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value, "YYYY-MM-DD", true);
  return parsed.isValid() ? parsed : null;
}

export function buildFloorMapHref(
  date: Dayjs,
  options?: { focusBookingId?: string }
): string {
  const params = new URLSearchParams({
    [FLOOR_MAP_DATE_PARAM]: date.format("YYYY-MM-DD"),
  });
  if (options?.focusBookingId) {
    params.set(FLOOR_MAP_FOCUS_BOOKING_PARAM, options.focusBookingId);
  }
  return `/floor-map?${params.toString()}`;
}
