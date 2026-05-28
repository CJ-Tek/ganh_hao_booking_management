import dayjs from "dayjs";
import type { AppStateSnapshot, Booking, Customer } from "@/lib/types";

/** Floor-map structural sync subset of app state (bookings loaded per day on the floor map). */
export type FloorMapStateSlice = Pick<AppStateSnapshot, "areas" | "tables" | "mergeGroups"> & {
  bookings?: Booking[];
  customers?: Customer[];
};

function sortBookings(bookings: Booking[]): Booking[] {
  return [...bookings].sort(
    (a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()
  );
}

/** Replace branch-scoped floor data; upsert customers referenced in the slice. */
export function mergeFloorMapSliceIntoState(
  prev: AppStateSnapshot,
  slice: FloorMapStateSlice,
  branchIds: readonly string[]
): AppStateSnapshot {
  const scope = new Set(branchIds.filter((id) => id.length > 0));
  const inScope = (branchId: string) => scope.size === 0 || scope.has(branchId);

  const areas = [
    ...prev.areas.filter((area) => !inScope(area.branchId)),
    ...slice.areas,
  ];
  const tables = [
    ...prev.tables.filter((table) => !inScope(table.branchId)),
    ...slice.tables,
  ];
  const mergeGroups = [
    ...prev.mergeGroups.filter((group) => !inScope(group.branchId)),
    ...slice.mergeGroups,
  ];

  const customerMap = new Map(prev.customers.map((customer) => [customer.id, customer]));
  if (slice.customers) {
    for (const customer of slice.customers) {
      customerMap.set(customer.id, customer);
    }
  }

  const next: AppStateSnapshot = {
    ...prev,
    areas,
    tables,
    mergeGroups,
    customers: [...customerMap.values()],
  };

  if (slice.bookings) {
    next.bookings = sortBookings([
      ...prev.bookings.filter((booking) => !inScope(booking.branchId)),
      ...slice.bookings,
    ]);
  }

  return next;
}

/** Tables whose changes should use a floor slice reload instead of full snapshot. */
export const FLOOR_SYNC_REALTIME_TABLES = new Set([
  "bookings",
  "tables",
  "customers",
  "areas",
  "table_merge_groups",
  "table_merge_members",
  "area_floor_layout_by_date",
]);

export function reloadScopeForRealtimeTable(table: string | undefined): "floor" | "full" {
  if (!table) {
    return "full";
  }
  if (table === "bookings" || table === "customers") {
    return "full";
  }
  return FLOOR_SYNC_REALTIME_TABLES.has(table) ? "floor" : "full";
}
