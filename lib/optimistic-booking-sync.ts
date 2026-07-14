import dayjs from "dayjs";
import {
  resolveTableStatusFromBookings,
  shouldAutoSeatOnCreate,
  TABLE_RESERVATION_BOOKING_STATUSES,
  type BookingArrivalIntent,
} from "@/lib/booking-meta";
import type {
  AppStateSnapshot,
  Booking,
  BookingRuntimeSettings,
  BookingStatus,
  Customer,
  TableStatus,
} from "@/lib/types";

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
      booking.tableId === tableId &&
      (TABLE_RESERVATION_BOOKING_STATUSES as readonly string[]).includes(booking.status)
  );
  return resolveTableStatusFromBookings(onTable);
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
  return applyBookingRowToSnapshot(prev, updated, existing.tableId);
}

/** Upsert a full booking row from Realtime and sync affected table statuses. */
export function applyBookingRowToSnapshot(
  prev: AppStateSnapshot,
  booking: Booking,
  previousTableId?: string | null
): AppStateSnapshot {
  const bookings = sortBookings([
    booking,
    ...prev.bookings.filter((item) => item.id !== booking.id),
  ]);
  const tables = syncTablesForBookingChange(prev, bookings, [
    previousTableId,
    booking.tableId,
  ]);
  return { ...prev, bookings, tables };
}

/** Remove a booking and sync table availability for its former table. */
export function removeBookingFromSnapshot(
  prev: AppStateSnapshot,
  bookingId: string
): AppStateSnapshot | null {
  const removed = prev.bookings.find((item) => item.id === bookingId);
  if (!removed) {
    return null;
  }
  const bookings = prev.bookings.filter((item) => item.id !== bookingId);
  const tables = syncTablesForBookingChange(prev, bookings, [removed.tableId]);
  return { ...prev, bookings, tables };
}

export type OptimisticCreateBookingInput = {
  customerName: string;
  customerPhone?: string;
  branchId: string;
  areaId?: string | null;
  tableId?: string | null;
  mergeGroupId?: string | null;
  guestCount?: number;
  bookingAt: string;
  note?: string;
  arrivalIntent?: BookingArrivalIntent;
};

export function resolveOptimisticCustomerForCreate(
  prev: AppStateSnapshot,
  input: OptimisticCreateBookingInput,
  bookingId: string
): { customers: Customer[]; customerId: string } {
  const phone = input.customerPhone?.trim() || null;
  if (phone) {
    const byPhone = prev.customers.find((item) => item.phone === phone);
    if (byPhone) {
      return { customers: prev.customers, customerId: byPhone.id };
    }
  }
  const optimisticId = `optimistic-customer-${bookingId}`;
  const nowIso = new Date().toISOString();
  const customer: Customer = {
    id: optimisticId,
    fullName: input.customerName.trim(),
    phone,
    note: undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return {
    customers: [customer, ...prev.customers.filter((item) => item.id !== optimisticId)],
    customerId: optimisticId,
  };
}

export function buildOptimisticBookingFromCreate(
  input: OptimisticCreateBookingInput,
  bookingId: string,
  createdByUserId: string,
  customerId: string,
  mergeFallbackTableId: string | null,
  runtimeSettings: BookingRuntimeSettings
): Booking {
  const autoSeat = shouldAutoSeatOnCreate(input.bookingAt, input.arrivalIntent);
  const guestCount =
    typeof input.guestCount === "number" && Number.isFinite(input.guestCount)
      ? Math.max(1, Math.round(input.guestCount))
      : 1;
  const startTime = input.bookingAt;
  const endTime = dayjs(startTime)
    .add(runtimeSettings.standardTurnaroundMinutes, "minute")
    .toISOString();
  const mergeGroupId = input.mergeGroupId ?? null;
  const tableId = mergeGroupId ? mergeFallbackTableId : (input.tableId ?? null);
  const hasTableAssignment = Boolean(tableId || mergeGroupId);
  const status: BookingStatus = !hasTableAssignment
    ? "pending"
    : autoSeat
      ? "seated"
      : "confirmed";
  return {
    id: bookingId,
    customerId,
    branchId: input.branchId,
    areaId: input.areaId ?? null,
    tableId,
    mergeGroupId,
    guestCount,
    bookingAt: startTime,
    startTime,
    endTime,
    checkedInAt: hasTableAssignment && autoSeat ? dayjs().toISOString() : undefined,
    status,
    note: input.note,
    createdAt: dayjs().toISOString(),
    createdByUserId,
  };
}

/** Insert booking + customer into snapshot after create API succeeds (no store reload). */
export function applyCreateBookingToSnapshot(
  prev: AppStateSnapshot,
  input: OptimisticCreateBookingInput,
  bookingId: string,
  createdByUserId: string
): AppStateSnapshot {
  const mergeFallbackTableId = input.mergeGroupId
    ? (prev.mergeGroups.find((group) => group.id === input.mergeGroupId)?.tableIds[0] ?? null)
    : null;
  const { customers, customerId } = resolveOptimisticCustomerForCreate(prev, input, bookingId);
  const booking = buildOptimisticBookingFromCreate(
    input,
    bookingId,
    createdByUserId,
    customerId,
    mergeFallbackTableId,
    prev.bookingRuntimeSettings
  );
  const withCustomer = { ...prev, customers };
  let next = applyBookingRowToSnapshot(withCustomer, booking);
  if (booking.mergeGroupId) {
    const memberTableIds =
      prev.mergeGroups.find((group) => group.id === booking.mergeGroupId)?.tableIds ?? [];
    if (memberTableIds.length > 0) {
      next = {
        ...next,
        tables: syncTablesForBookingChange(next, next.bookings, memberTableIds),
      };
    }
  }
  return next;
}
