import dayjs from "dayjs";
import type { AppStateSnapshot, Booking, BookingStatus, TableStatus } from "@/lib/types";

/** Bookings that tie a table (hold or occupied). Mirrors server `TABLE_RESERVATION_BOOKING_STATUSES`. */
const TABLE_RESERVATION_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "seated",
  "checked_in",
];

/** Same rule as `refreshTableAvailabilityForBooking` / floor-map derivation. */
export function computeTableStatusFromBookings(
  tableId: string,
  bookings: readonly Booking[],
  locked = false
): TableStatus {
  if (locked) {
    return "locked";
  }
  const onTable = bookings.filter(
    (booking) =>
      booking.tableId === tableId && TABLE_RESERVATION_BOOKING_STATUSES.includes(booking.status)
  );
  if (onTable.length === 0) {
    return "available";
  }
  const hasSeated = onTable.some(
    (booking) => booking.status === "seated" || booking.status === "checked_in"
  );
  return hasSeated ? "occupied" : "hold";
}

function sortBookings(bookings: Booking[]): Booking[] {
  return [...bookings].sort(
    (a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()
  );
}

function syncTablesForBookingChange(
  prev: AppStateSnapshot,
  bookings: Booking[],
  tableIds: Iterable<string | null | undefined>
): AppStateSnapshot["tables"] {
  const ids = [...new Set([...tableIds].filter((id): id is string => typeof id === "string"))];
  if (ids.length === 0) {
    return prev.tables;
  }
  const withBookings = { ...prev, bookings };
  return prev.tables.map((table) => {
    if (!ids.includes(table.id)) {
      return table;
    }
    const nextStatus = computeTableStatusFromBookings(
      table.id,
      bookings,
      table.status === "locked"
    );
    return table.status === nextStatus ? table : { ...table, status: nextStatus };
  });
}

/** Apply a booking patch and reconcile affected table statuses in one state update. */
export function applyBookingPatchToSnapshot(
  prev: AppStateSnapshot,
  bookingId: string,
  patch: Partial<Booking>
): AppStateSnapshot | null {
  const existing = prev.bookings.find((item) => item.id === bookingId);
  if (!existing) {
    return null;
  }
  const updated: Booking = { ...existing, ...patch };
  const bookings = sortBookings([
    updated,
    ...prev.bookings.filter((item) => item.id !== bookingId),
  ]);
  const tables = syncTablesForBookingChange(prev, bookings, [
    existing.tableId,
    updated.tableId,
  ]);
  return { ...prev, bookings, tables };
}
