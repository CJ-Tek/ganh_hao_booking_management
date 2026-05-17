import dayjs from "dayjs";

import { DEFAULT_BOOKING_RUNTIME_SETTINGS } from "@/lib/booking-runtime-defaults";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import {
  type Booking,
  type BookingRuntimeSettings,
  type BookingStatus,
  type DiningTable,
} from "@/lib/types";

const UNKNOWN_GUEST_TAG = "[[guest_count_unknown]]";
const GUEST_TYPE_TAG_PATTERN = /\[\[guest_type:([^\]]+)\]\]/;
const SYNTHETIC_PHONE_PREFIX = "__no_phone__:";

/** Nhãn loại khách — dùng trong form tạo booking và lọc màn hôm nay. */
export const BOOKING_GUEST_TYPE_OPTIONS = [
  "Khách thường",
  "Khách quen",
  "Đoàn",
  "Sinh nhật",
  "Khách VIP",
  "Đặt món trước",
] as const;

export type BookingGuestTypeLabel = (typeof BOOKING_GUEST_TYPE_OPTIONS)[number];

export function extractGuestTypeFromNote(note?: string | null): string | null {
  const match = String(note ?? "").match(GUEST_TYPE_TAG_PATTERN);
  const label = match?.[1]?.trim();
  return label && label.length > 0 ? label : null;
}

export function stripGuestTypeTag(note?: string | null): string | undefined {
  if (!note) {
    return undefined;
  }
  const cleaned = note
    .replace(/\[\[guest_type:[^\]]+\]\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.length > 0 ? cleaned : undefined;
}

/** Gắn loại khách vào ghi chú (metadata nội bộ, không hiện ở cột Ghi chú). */
export function appendGuestTypeTag(
  note: string | undefined | null,
  guestType?: string | null
): string | null {
  const base = stripGuestTypeTag(note ?? undefined) ?? "";
  const label = guestType?.trim();
  if (!label || label === "Khách thường") {
    return base.length > 0 ? base : null;
  }
  const tag = `[[guest_type:${label}]]`;
  return base ? `${base}\n${tag}` : tag;
}

export function buildBookingNoteForStorage(input: {
  note?: string;
  guestCountSpecified: boolean;
  guestType?: string | null;
}): string | null {
  const withGuestCount = input.guestCountSpecified
    ? stripUnknownGuestTag(input.note) ?? null
    : appendUnknownGuestTag(input.note);
  return appendGuestTypeTag(withGuestCount, input.guestType);
}

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
    .replace(/\[\[guest_type:[^\]]+\]\]/g, "")
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

export type ReceptionThresholdSettings = Pick<
  BookingRuntimeSettings,
  "groupPartyGuestThreshold" | "repeatCustomerMinCompleted" | "receptionArrivalGraceMinutes"
>;

function resolveReceptionThresholds(
  thresholds?: Partial<ReceptionThresholdSettings>
): ReceptionThresholdSettings {
  return {
    groupPartyGuestThreshold:
      thresholds?.groupPartyGuestThreshold ??
      DEFAULT_BOOKING_RUNTIME_SETTINGS.groupPartyGuestThreshold,
    repeatCustomerMinCompleted:
      thresholds?.repeatCustomerMinCompleted ??
      DEFAULT_BOOKING_RUNTIME_SETTINGS.repeatCustomerMinCompleted,
    receptionArrivalGraceMinutes:
      thresholds?.receptionArrivalGraceMinutes ??
      DEFAULT_BOOKING_RUNTIME_SETTINGS.receptionArrivalGraceMinutes,
  };
}

function bookingNoteNormalized(booking: Pick<Booking, "note">): string {
  return (stripUnknownGuestTag(booking.note) ?? "").toLowerCase();
}

export type InferGuestTypeOptions = {
  /** Số booking `completed` của khách (cùng phạm vi chi nhánh đang xem). */
  completedBookingCountForCustomer?: number;
  thresholds?: Partial<ReceptionThresholdSettings>;
};

/** Loại khách cho màn lễ tân — suy từ ghi chú, số khách, lịch sử. */
export function inferGuestTypeLabel(
  booking: Pick<Booking, "guestCount" | "note">,
  options?: InferGuestTypeOptions
): string {
  const explicit = extractGuestTypeFromNote(booking.note);
  if (explicit) {
    return explicit;
  }

  const thresholds = resolveReceptionThresholds(options?.thresholds);
  const note = bookingNoteNormalized(booking);

  if (/sinh\s*nhật|\bsn\b/.test(note)) {
    return "Sinh nhật";
  }
  if (/đặt\s*món|order\s*trước|đặt\s*trước/.test(note)) {
    return "Đặt món trước";
  }
  if (/đoàn|tour\b|đám\s*đông/.test(note)) {
    return "Đoàn";
  }
  if (/\bvip\b/.test(note)) {
    return "Khách VIP";
  }
  if (
    isGuestCountSpecified(booking) &&
    booking.guestCount >= thresholds.groupPartyGuestThreshold
  ) {
    return "Đoàn";
  }

  const completedCount = options?.completedBookingCountForCustomer ?? 0;
  if (completedCount >= thresholds.repeatCustomerMinCompleted) {
    return "Khách quen";
  }

  return "Khách thường";
}

export type ReceptionBookingStatus = {
  label: string;
  color: string;
};

/** Trạng thái hiển thị cho lễ tân (khác nhãn kỹ thuật nội bộ). */
export function getReceptionBookingStatus(
  booking: Booking,
  thresholdsInput?: Partial<ReceptionThresholdSettings>
): ReceptionBookingStatus {
  const thresholds = resolveReceptionThresholds(thresholdsInput);
  const note = bookingNoteNormalized(booking);
  const hasDepositNote = /đã\s*cọc|đặt\s*cọc|\bcọc\b|chuyển\s*khoản|thanh\s*toán\s*trước/.test(
    note
  );

  if (booking.status === "seated" || booking.status === "checked_in") {
    return { label: "Đã vào bàn", color: "green" };
  }

  if (booking.status === "confirmed") {
    if (hasDepositNote) {
      return { label: "Đã cọc", color: "yellow" };
    }
    const bookingAt = dayjs(booking.bookingAt);
    const minutesUntil = bookingAt.diff(dayjs(), "minute");
    if (
      !booking.checkedInAt &&
      minutesUntil > -thresholds.receptionArrivalGraceMinutes
    ) {
      return { label: "Chờ đến", color: "blue" };
    }
    return { label: "Đã xác nhận", color: bookingStatusColor.confirmed };
  }

  const status = booking.status as BookingStatus;
  return {
    label: bookingStatusLabel[status],
    color: bookingStatusColor[status],
  };
}

/** Nhãn khu/bàn trên màn hôm nay — rút gọn khi chưa gán. */
export function formatTodayBookingAreaTable(
  booking: Pick<Booking, "areaId" | "tableId">,
  areaName?: string,
  tableName?: string
): string {
  if (!booking.areaId || !booking.tableId) {
    return "Chờ xếp";
  }
  return `${areaName ?? "—"} · ${tableName ?? "—"}`;
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
  return findAssignableSlotConflictsAtTable(candidate, tableId, allBookings).length > 0;
}

/** Other reservations on the same table whose slot overlaps the candidate window. */
export function findAssignableSlotConflictsAtTable(
  candidate: Booking,
  tableId: string,
  allBookings: readonly Booking[]
): Booking[] {
  return allBookings.filter((item) => {
    if (item.id === candidate.id || item.tableId !== tableId) {
      return false;
    }
    if (!reservationBlocksAssignableSlot(item)) {
      return false;
    }
    return bookingsTimeSlotsOverlap(candidate, item);
  });
}

export function formatTableSlotConflictMessage(
  conflicts: readonly Pick<Booking, "bookingAt" | "guestCount">[],
  options?: { tableName?: string; customerName?: string }
): string | null {
  if (conflicts.length === 0) {
    return null;
  }
  const first = conflicts[0];
  const at = dayjs(first.bookingAt);
  const slotLabel = at.isSame(dayjs(), "day")
    ? `hôm nay lúc ${at.format("HH:mm")}`
    : `${at.format("DD/MM/YYYY")} lúc ${at.format("HH:mm")}`;
  const tablePart = options?.tableName ? ` trên bàn ${options.tableName}` : "";
  const guestPart = options?.customerName ? ` (${options.customerName})` : "";
  const extraCount = conflicts.length - 1;
  const suffix = extraCount > 0 ? ` (+${extraCount} booking trùng khung)` : "";
  return `Khung giờ mới trùng booking${tablePart}${guestPart}: ${slotLabel} · ${first.guestCount} khách.${suffix}`;
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
