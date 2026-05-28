import dayjs from "dayjs";
import { pickBookingForFloorDayMerge } from "@/lib/booking-meta";
import type { Booking, Customer } from "@/lib/types";
import { formatMergeGroupDate } from "@/lib/merge-group-utils";
import {
  mapRealtimeBookingRow,
  type RealtimeBookingPayload,
} from "@/lib/realtime-booking-row";

export type FloorMapDayBookingsSlice = {
  bookings: Booking[];
  customers: Customer[];
};

/** Inclusive days before/after the selected date kept in the in-memory day cache. */
export const FLOOR_MAP_DAY_CACHE_WINDOW_DAYS = 3;

export function floorMapDayBookingsCacheKey(
  branchIds: readonly string[],
  layoutDate: string
): string {
  const branches = branchScopeFromBranchIds(branchIds);
  return `${branches}:${layoutDate}`;
}

export function branchScopeFromBranchIds(branchIds: readonly string[]): string {
  return [...branchIds].filter((id) => id.length > 0).sort().join(",");
}

export function parseFloorMapDayBookingsCacheKey(
  cacheKey: string
): { branchScope: string; layoutDate: string } | null {
  const colon = cacheKey.lastIndexOf(":");
  if (colon <= 0) {
    return null;
  }
  return {
    branchScope: cacheKey.slice(0, colon),
    layoutDate: cacheKey.slice(colon + 1),
  };
}

export function isLayoutDateWithinFloorMapCacheWindow(
  layoutDate: string,
  centerLayoutDate: string,
  windowDays: number = FLOOR_MAP_DAY_CACHE_WINDOW_DAYS
): boolean {
  const center = dayjs(centerLayoutDate);
  const entry = dayjs(layoutDate);
  if (!center.isValid() || !entry.isValid()) {
    return false;
  }
  return Math.abs(entry.diff(center, "day")) <= windowDays;
}

export function shouldRetainFloorMapDayCacheKey(
  cacheKey: string,
  branchIds: readonly string[],
  centerLayoutDate: string,
  windowDays: number = FLOOR_MAP_DAY_CACHE_WINDOW_DAYS
): boolean {
  const parsed = parseFloorMapDayBookingsCacheKey(cacheKey);
  if (!parsed) {
    return false;
  }
  if (parsed.branchScope !== branchScopeFromBranchIds(branchIds)) {
    return false;
  }
  return isLayoutDateWithinFloorMapCacheWindow(
    parsed.layoutDate,
    centerLayoutDate,
    windowDays
  );
}

/** Drop day slices outside the navigation window or for a different branch scope. */
export function pruneFloorMapDayCacheRecord<T>(
  record: Record<string, T | undefined>,
  branchIds: readonly string[],
  centerLayoutDate: string,
  windowDays: number = FLOOR_MAP_DAY_CACHE_WINDOW_DAYS
): Record<string, T | undefined> {
  const next: Record<string, T | undefined> = {};
  for (const [key, value] of Object.entries(record)) {
    if (shouldRetainFloorMapDayCacheKey(key, branchIds, centerLayoutDate, windowDays)) {
      next[key] = value;
    }
  }
  return next;
}

export function bookingMatchesFloorLayoutDate(
  booking: Pick<Booking, "bookingAt" | "branchId">,
  layoutDate: string,
  branchIds: readonly string[]
): boolean {
  if (formatMergeGroupDate(booking.bookingAt) !== layoutDate) {
    return false;
  }
  const scope = branchIds.filter((id) => id.length > 0);
  if (scope.length === 0) {
    return true;
  }
  return scope.includes(booking.branchId);
}

export function filterBookingsForFloorLayoutDate(
  bookings: readonly Booking[],
  layoutDate: string,
  branchIds: readonly string[]
): Booking[] {
  return bookings.filter((booking) => bookingMatchesFloorLayoutDate(booking, layoutDate, branchIds));
}

function sortBookings(bookings: Booking[]): Booking[] {
  return [...bookings].sort(
    (a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()
  );
}

/**
 * Merge lazy-loaded day bookings with global app state.
 * Same-day global rows merge by lifecycle rank so optimistic floor actions are not reverted
 * while `/api/store` is in flight. Rows only in the day slice are kept.
 */
export function mergeFloorDayBookingsWithGlobal(
  dayBookings: readonly Booking[],
  globalBookings: readonly Booking[],
  layoutDate: string,
  branchIds: readonly string[]
): Booking[] {
  const onDayGlobal = filterBookingsForFloorLayoutDate(globalBookings, layoutDate, branchIds);
  const byId = new Map(dayBookings.map((booking) => [booking.id, booking]));
  for (const globalRow of onDayGlobal) {
    const dayRow = byId.get(globalRow.id);
    if (!dayRow) {
      byId.set(globalRow.id, globalRow);
      continue;
    }
    byId.set(globalRow.id, pickBookingForFloorDayMerge(dayRow, globalRow));
  }
  return sortBookings([...byId.values()]);
}

/** Apply a bookings realtime payload to the in-memory day list; null = no change. */
export function patchFloorDayBookingsFromRealtime(
  prev: readonly Booking[],
  payload: RealtimeBookingPayload,
  layoutDate: string,
  branchIds: readonly string[]
): Booking[] | null {
  if (payload.eventType === "DELETE") {
    const id = payload.old?.id;
    if (typeof id !== "string") {
      return null;
    }
    if (!prev.some((booking) => booking.id === id)) {
      return null;
    }
    return sortBookings(prev.filter((booking) => booking.id !== id));
  }

  if (!payload.new) {
    return null;
  }

  const mapped = mapRealtimeBookingRow(payload.new);
  if (!mapped) {
    return null;
  }

  const onDay = bookingMatchesFloorLayoutDate(mapped, layoutDate, branchIds);
  const existingIndex = prev.findIndex((booking) => booking.id === mapped.id);

  if (!onDay) {
    if (existingIndex === -1) {
      return null;
    }
    return sortBookings(prev.filter((booking) => booking.id !== mapped.id));
  }

  if (existingIndex === -1) {
    return sortBookings([...prev, mapped]);
  }

  const next = [...prev];
  next[existingIndex] = mapped;
  return sortBookings(next);
}

/** Apply a partial booking patch to a day slice (optimistic floor-map UI). */
export function patchFloorDayBookingInSlice(
  prev: readonly Booking[],
  bookingId: string,
  patch: Partial<Booking>
): Booking[] | null {
  const index = prev.findIndex((booking) => booking.id === bookingId);
  if (index === -1) {
    return null;
  }
  const next = [...prev];
  next[index] = { ...next[index], ...patch };
  return sortBookings(next);
}

/** Shallow compare for avoiding redundant cache writes after merge. */
export function floorDayBookingsSnapshotEqual(
  a: readonly Booking[],
  b: readonly Booking[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];
    if (
      left.id !== right.id ||
      left.status !== right.status ||
      left.tableId !== right.tableId ||
      left.mergeGroupId !== right.mergeGroupId ||
      left.bookingAt !== right.bookingAt ||
      left.checkedInAt !== right.checkedInAt
    ) {
      return false;
    }
  }
  return true;
}

export function layoutDateRangeIso(layoutDate: string): { startIso: string; endIso: string } {
  const start = dayjs(layoutDate).startOf("day");
  const end = dayjs(layoutDate).endOf("day");
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}
