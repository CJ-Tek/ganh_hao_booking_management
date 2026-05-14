import { type Booking } from "@/lib/types";

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

function bookingAtMs(booking: Pick<Booking, "bookingAt">): number {
  const t = Date.parse(booking.bookingAt);
  return Number.isFinite(t) ? t : 0;
}

/** Prefer in-table checked-in guest, else confirmed, else any active booking on the table. */
export function pickPrimaryBookingOnTable(
  tableId: string,
  bookings: readonly Booking[]
): Booking | null {
  const onTable = bookings.filter(
    (b) =>
      b.tableId === tableId && b.status !== "cancelled" && b.status !== "completed"
  );
  if (onTable.length === 0) {
    return null;
  }
  const checkedIn = onTable.filter((b) => b.status === "checked_in");
  const pool =
    checkedIn.length > 0
      ? checkedIn
      : onTable.filter((b) => b.status === "confirmed");
  const finalPool = pool.length > 0 ? pool : onTable;
  return [...finalPool].sort((a, b) => bookingAtMs(b) - bookingAtMs(a))[0] ?? null;
}
