import dayjs, { type Dayjs } from "dayjs";

export const FLOOR_MAP_DATE_PARAM = "date";

export function parseFloorMapDateParam(value: string | null): Dayjs | null {
  if (!value) {
    return null;
  }
  const parsed = dayjs(value, "YYYY-MM-DD", true);
  return parsed.isValid() ? parsed : null;
}

export function buildFloorMapHref(date: Dayjs): string {
  return `/floor-map?${FLOOR_MAP_DATE_PARAM}=${date.format("YYYY-MM-DD")}`;
}
