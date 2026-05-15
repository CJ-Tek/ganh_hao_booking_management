import dayjs from "dayjs";

import { type Booking, type DiningTable } from "@/lib/types";

const UNKNOWN_GUEST_TAG = "[[guest_count_unknown]]";
const SYNTHETIC_PHONE_PREFIX = "__no_phone__:";

export function appendUnknownGuestTag(note?: string): string {
  const clean = stripUnknownGuestTag(note);
  return clean ? `${clean}\n${UNKNOWN_GUEST_TAG}` : UNKNOWN_GUEST_TAG;
}

export function stripUnknownGuestTag(note?: string | null): string | undefined {
  if (!note) {
    return undefined;
  }
  const cleaned = note
    .replaceAll(UNKNOWN_GUEST_TAG, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

export function isGuestCountSpecified(booking: Pick<Booking, "guestCount" | "note">): boolean {
  if (booking.guestCount <= 0) {
    return false;
  }
  return !String(booking.note ?? "").includes(UNKNOWN_GUEST_TAG);
}

export function toSyntheticPhoneValue(): string {
  return `${SYNTHETIC_PHONE_PREFIX}${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function isSyntheticPhoneValue(phone?: string | null): boolean {
  return Boolean(phone && phone.startsWith(SYNTHETIC_PHONE_PREFIX));
}

export function displayCustomerPhone(phone?: string | null): string {
  if (!phone || isSyntheticPhoneValue(phone)) {
    return "-";
  }
  return phone;
}

function slotStartMs(booking: Pick<Booking, "startTime" | "bookingAt">): number {
  const raw = booking.startTime ?? booking.bookingAt;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/** Prefer in-table seated guest, else soonest confirmed, else any active booking on the table. */
export function pickPrimaryBookingOnTable(
  tableId: string,
  bookings: readonly Booking[]
): Booking | null {
  const onTable = bookings.filter(
    (b) =>
      b.tableId === tableId &&
      b.status !== "cancelled" &&
      b.status !== "completed" &&
      b.status !== "no_show"
  );
  if (onTable.length === 0) {
    return null;
  }
  const checkedIn = onTable.filter((b) => b.status === "checked_in" || b.status === "seated");
  const pool =
    checkedIn.length > 0
      ? checkedIn
      : onTable.filter((b) => b.status === "confirmed");
  const finalPool = pool.length > 0 ? pool : onTable;
  const sorted = [...finalPool].sort((a, b) => slotStartMs(a) - slotStartMs(b));
  if (checkedIn.length > 0) {
    return sorted[sorted.length - 1] ?? null;
  }
  return sorted[0] ?? null;
}

/** Keep in sync with `DEFAULT_BOOKING_RUNTIME_SETTINGS.standardTurnaroundMinutes` in `supabase-store`. */
const FALLBACK_STANDARD_TURNAROUND_MINUTES = 90;

/** Same filter as manual/auto assign on the bookings page — reservations that occupy a table slot. */
function reservationBlocksAssignableSlot(item: Booking): boolean {
  if (item.tableId == null) {
    return false;
  }
  return (
    item.status === "confirmed" ||
    item.status === "seated" ||
    item.status === "checked_in" ||
    item.status === "pending"
  );
}

function normalizeBookingSlotMs(booking: Pick<Booking, "startTime" | "endTime" | "bookingAt">): {
  startMs: number;
  endMs: number;
} {
  const bookingAtRaw = booking.bookingAt?.trim() || "";
  const startSrc = (booking.startTime && String(booking.startTime).trim()) || bookingAtRaw;
  let startMs = dayjs(startSrc).valueOf();
  if (!Number.isFinite(startMs)) {
    startMs = dayjs(bookingAtRaw).valueOf();
  }
  if (!Number.isFinite(startMs)) {
    return { startMs: 0, endMs: 0 };
  }
  const endSrc = booking.endTime && String(booking.endTime).trim();
  let endMs = endSrc ? dayjs(endSrc).valueOf() : NaN;
  if (!Number.isFinite(endMs)) {
    endMs = dayjs(startMs).add(FALLBACK_STANDARD_TURNAROUND_MINUTES, "minute").valueOf();
  }
  if (endMs <= startMs) {
    endMs = dayjs(startMs).add(FALLBACK_STANDARD_TURNAROUND_MINUTES, "minute").valueOf();
  }
  return { startMs, endMs };
}

/** Half-open overlap consistent with `[start,end)` checks used in `assignBookingToTableInSupabase`. */
export function bookingsTimeSlotsOverlap(
  a: Pick<Booking, "startTime" | "endTime" | "bookingAt">,
  b: Pick<Booking, "startTime" | "endTime" | "bookingAt">
): boolean {
  const aa = normalizeBookingSlotMs(a);
  const bb = normalizeBookingSlotMs(b);
  if (aa.startMs >= aa.endMs || bb.startMs >= bb.endMs) {
    return false;
  }
  return aa.startMs < bb.endMs && bb.startMs < aa.endMs;
}

export function hasAssignableSlotConflictAtTable(
  candidate: Booking,
  tableId: string,
  allBookings: readonly Booking[]
): boolean {
  return allBookings.some((item) => {
    if (item.id === candidate.id || item.tableId !== tableId) {
      return false;
    }
    if (!reservationBlocksAssignableSlot(item)) {
      return false;
    }
    return bookingsTimeSlotsOverlap(candidate, item);
  });
}

/** Tables that may receive this booking (branch + seats + slot conflicts). Mirrors bookings-page assign modal. */
export function getAssignableCandidateTables(
  booking: Booking,
  tables: readonly DiningTable[],
  allBookings: readonly Booking[],
  requiredSeats?: number
): DiningTable[] {
  const seatsNeeded =
    typeof requiredSeats === "number" && Number.isFinite(requiredSeats)
      ? Math.max(1, Math.round(requiredSeats))
      : undefined;

  return tables.filter((table) => {
    if (table.branchId !== booking.branchId || table.status === "locked") {
      return false;
    }
    if (seatsNeeded !== undefined && table.seats < seatsNeeded) {
      return false;
    }
    return !hasAssignableSlotConflictAtTable(booking, table.id, allBookings);
  });
}
