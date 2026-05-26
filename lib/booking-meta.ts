import dayjs from "dayjs";

import { DEFAULT_BOOKING_RUNTIME_SETTINGS } from "@/lib/booking-runtime-defaults";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import {
  getMergeGroupEffectiveGuestCapacity,
  getTableEffectiveGuestCapacity,
} from "@/lib/table-capacity";
import {
  type Booking,
  type BookingRuntimeSettings,
  type BookingStatus,
  type DiningTable,
  type TableMergeGroup,
  type TableStatus,
} from "@/lib/types";

const UNKNOWN_GUEST_TAG = "[[guest_count_unknown]]";
const GUEST_TYPE_TAG_PATTERN = /\[\[guest_type:([^\]]+)\]\]/;
const SYNTHETIC_PHONE_PREFIX = "__no_phone__:";

/** True when arrival is now or in the past (floor-map "Vào bàn ngay") — table should be Đã ngồi. */
export function isImmediateBookingArrival(
  bookingAtIso: string,
  now: dayjs.Dayjs = dayjs()
): boolean {
  return !dayjs(bookingAtIso).isAfter(now);
}

export type BookingArrivalIntent = "hold" | "immediate";

/** Whether create-booking should auto-seat (Ngồi ngay). Giữ chỗ never seats. */
export function shouldAutoSeatOnCreate(
  bookingAtIso: string,
  arrivalIntent?: BookingArrivalIntent
): boolean {
  if (arrivalIntent === "hold") {
    return false;
  }
  if (arrivalIntent === "immediate") {
    return true;
  }
  return isImmediateBookingArrival(bookingAtIso);
}

/** Optimistic / post-create table status when a table is assigned at booking creation. */
export function tableStatusForCreateBooking(
  bookingAtIso: string,
  arrivalIntent?: BookingArrivalIntent
): Extract<TableStatus, "hold" | "occupied"> {
  return shouldAutoSeatOnCreate(bookingAtIso, arrivalIntent) ? "occupied" : "hold";
}

/** After create, refresh table availability without seating (Giữ chỗ). */
export function shouldRefreshTableHoldAfterCreate(
  bookingAtIso: string,
  arrivalIntent?: BookingArrivalIntent
): boolean {
  if (arrivalIntent === "hold") {
    return true;
  }
  if (arrivalIntent === "immediate") {
    return false;
  }
  return !isImmediateBookingArrival(bookingAtIso);
}

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
  | "groupPartyGuestThreshold"
  | "repeatCustomerMinCompleted"
  | "receptionArrivalGraceMinutes"
  | "noShowGraceMinutes"
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
    noShowGraceMinutes:
      thresholds?.noShowGraceMinutes ?? DEFAULT_BOOKING_RUNTIME_SETTINGS.noShowGraceMinutes,
  };
}

/** Slot start used for no-show rules (matches `run_booking_maintenance` in Postgres). */
export function getBookingSlotStart(booking: Pick<Booking, "startTime" | "bookingAt">): dayjs.Dayjs {
  return dayjs(booking.startTime ?? booking.bookingAt);
}

/** True when a confirmed/pending booking is past the no-show grace window without check-in. */
export function isPastNoShowGrace(
  booking: Pick<Booking, "status" | "checkedInAt" | "startTime" | "bookingAt">,
  noShowGraceMinutes: number
): boolean {
  if (booking.checkedInAt) {
    return false;
  }
  if (booking.status !== "confirmed" && booking.status !== "pending") {
    return false;
  }
  const minutesPast = dayjs().diff(getBookingSlotStart(booking), "minute");
  return minutesPast >= noShowGraceMinutes;
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

  if (booking.status === "no_show") {
    return { label: bookingStatusLabel.no_show, color: bookingStatusColor.no_show };
  }

  if (
    isPastNoShowGrace(booking, thresholds.noShowGraceMinutes)
  ) {
    return { label: bookingStatusLabel.no_show, color: bookingStatusColor.no_show };
  }

  if (booking.status === "confirmed") {
    if (hasDepositNote) {
      return { label: "Đã cọc", color: "yellow" };
    }
    const slotStart = getBookingSlotStart(booking);
    const minutesUntil = slotStart.diff(dayjs(), "minute");
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

export type BookingAreaTableLookup = {
  areas: readonly { id: string; name: string }[];
  tables: readonly { id: string; name: string; areaId?: string }[];
  mergeGroups: readonly { id: string; areaId: string; mergedName: string }[];
};

/** True when booking has a single table or a merge group (Bàn gộp). */
export function isBookingTableAssigned(
  booking: Pick<Booking, "areaId" | "tableId" | "mergeGroupId">
): boolean {
  if (booking.mergeGroupId) {
    return true;
  }
  return Boolean(booking.areaId && booking.tableId);
}

/** Display line for Khu vực / Bàn columns (list, detail, search). */
export function formatBookingAreaTable(
  booking: Pick<Booking, "areaId" | "tableId" | "mergeGroupId">,
  lookup: BookingAreaTableLookup,
  options?: {
    pendingLabel?: string;
    /** Prefix single table with `Bàn ` (list mobile cards). */
    tableNamePrefix?: boolean;
  }
): string {
  const pendingLabel = options?.pendingLabel ?? "Chờ xếp bàn";
  if (!isBookingTableAssigned(booking)) {
    return pendingLabel;
  }
  if (booking.mergeGroupId) {
    const group = lookup.mergeGroups.find((item) => item.id === booking.mergeGroupId);
    const areaName =
      (booking.areaId
        ? lookup.areas.find((item) => item.id === booking.areaId)?.name
        : null) ??
      (group ? lookup.areas.find((item) => item.id === group.areaId)?.name : null) ??
      "—";
    return `${areaName} · ${group?.mergedName ?? "Bàn gộp"}`;
  }
  const areaName = lookup.areas.find((item) => item.id === booking.areaId)?.name ?? "—";
  const tableName = lookup.tables.find((item) => item.id === booking.tableId)?.name ?? "—";
  const tablePart = options?.tableNamePrefix ? `Bàn ${tableName}` : tableName;
  return `${areaName} · ${tablePart}`;
}

/** Sort/search key for areaTable column — same labels as display. */
export function bookingAreaTableSortKey(
  booking: Pick<Booking, "areaId" | "tableId" | "mergeGroupId">,
  lookup: BookingAreaTableLookup
): string {
  return formatBookingAreaTable(booking, lookup, { pendingLabel: "Chờ xếp bàn" });
}

/** Nhãn khu/bàn trên màn hôm nay — rút gọn khi chưa gán. */
export function formatTodayBookingAreaTable(
  booking: Pick<Booking, "areaId" | "tableId" | "mergeGroupId">,
  lookup: BookingAreaTableLookup
): string {
  return formatBookingAreaTable(booking, lookup, { pendingLabel: "Chờ xếp" });
}

function slotStartMs(booking: Pick<Booking, "startTime" | "bookingAt">): number {
  const raw = booking.startTime ?? booking.bookingAt;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

function isActiveFloorBooking(booking: Booking): boolean {
  return (
    booking.status !== "cancelled" &&
    booking.status !== "completed" &&
    booking.status !== "no_show"
  );
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

/** Prefer seated/checked-in on the merge group, else soonest confirmed, else any active booking. */
export function pickPrimaryBookingOnMergeGroup(
  mergeGroupId: string,
  bookings: readonly Booking[]
): Booking | null {
  const onGroup = bookings.filter(
    (booking) => booking.mergeGroupId === mergeGroupId && isActiveFloorBooking(booking)
  );
  if (onGroup.length === 0) {
    return null;
  }
  const checkedIn = onGroup.filter(
    (booking) => booking.status === "checked_in" || booking.status === "seated"
  );
  const pool =
    checkedIn.length > 0
      ? checkedIn
      : onGroup.filter((booking) => booking.status === "confirmed");
  const finalPool = pool.length > 0 ? pool : onGroup;
  const sorted = [...finalPool].sort((a, b) => slotStartMs(a) - slotStartMs(b));
  if (checkedIn.length > 0) {
    return sorted[sorted.length - 1] ?? null;
  }
  return sorted[0] ?? null;
}

/** True when the merge group has at least one active booking on the selected calendar day. */
export function mergeGroupHasBookingOnDay(
  mergeGroupId: string,
  dayBookings: readonly Booking[]
): boolean {
  return dayBookings.some(
    (booking) => booking.mergeGroupId === mergeGroupId && isActiveFloorBooking(booking)
  );
}

/** True when the merge group's primary booking has checked in or is seated. */
export function mergeGroupPrimaryGuestHasArrived(
  mergeGroupId: string,
  bookings: readonly Booking[]
): boolean {
  const primary = pickPrimaryBookingOnMergeGroup(mergeGroupId, bookings);
  return (
    primary != null &&
    (primary.status === "checked_in" || primary.status === "seated")
  );
}

/** Floor-map calendar preview: derive merge-bar color from bookings on the selected day. */
export function deriveMergeGroupStatusFromDayBookings(
  mergeGroupId: string,
  dayBookings: readonly Booking[]
): TableStatus {
  const onGroup = dayBookings.filter(
    (booking) => booking.mergeGroupId === mergeGroupId && isActiveFloorBooking(booking)
  );
  if (onGroup.length === 0) {
    return "available";
  }
  const hasSeated = onGroup.some(
    (booking) => booking.status === "seated" || booking.status === "checked_in"
  );
  return hasSeated ? "occupied" : "hold";
}

/** Floor-map calendar preview: derive block color from bookings on the selected day. */
export function deriveTableStatusFromDayBookings(
  table: Pick<DiningTable, "id" | "status">,
  dayBookings: readonly Booking[]
): DiningTable["status"] {
  if (table.status === "locked") {
    return "locked";
  }
  const onTable = dayBookings.filter(
    (booking) =>
      booking.tableId === table.id &&
      booking.status !== "cancelled" &&
      booking.status !== "completed" &&
      booking.status !== "no_show"
  );
  if (onTable.length === 0) {
    return "available";
  }
  const hasSeated = onTable.some(
    (booking) => booking.status === "seated" || booking.status === "checked_in"
  );
  return hasSeated ? "occupied" : "hold";
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

export type PendingTableAssignPickResult = {
  assignable: Booking[];
  skippedSelectionOverlap: Booking[];
  skippedTableConflict: Booking[];
  skippedOverCapacity: Booking[];
};

/** Pick pending bookings that can share one table without overlapping each other or existing reservations. */
export function pickNonOverlappingBookingsForTable(
  candidates: readonly Booking[],
  tableId: string,
  allBookings: readonly Booking[],
  options?: { maxSeats?: number }
): PendingTableAssignPickResult {
  const skippedSelectionOverlap: Booking[] = [];
  const skippedTableConflict: Booking[] = [];
  const skippedOverCapacity: Booking[] = [];
  const assignable: Booking[] = [];

  const sorted = [...candidates].sort((left, right) => {
    const leftStart = normalizeBookingSlotMs(left).startMs;
    const rightStart = normalizeBookingSlotMs(right).startMs;
    return leftStart - rightStart;
  });

  for (const booking of sorted) {
    if (
      options?.maxSeats !== undefined &&
      options.maxSeats > 0 &&
      booking.guestCount > options.maxSeats
    ) {
      skippedOverCapacity.push(booking);
      continue;
    }
    if (assignable.some((picked) => bookingsTimeSlotsOverlap(picked, booking))) {
      skippedSelectionOverlap.push(booking);
      continue;
    }
    const candidateOnTable: Booking = { ...booking, tableId };
    if (hasAssignableSlotConflictAtTable(candidateOnTable, tableId, allBookings)) {
      skippedTableConflict.push(booking);
      continue;
    }
    assignable.push(booking);
  }

  return { assignable, skippedSelectionOverlap, skippedTableConflict, skippedOverCapacity };
}

/** Pick pending bookings that can share one merge group without overlapping. */
export function pickNonOverlappingBookingsForMergeGroup(
  candidates: readonly Booking[],
  group: Pick<TableMergeGroup, "id" | "tableIds" | "totalCapacity">,
  allBookings: readonly Booking[]
): PendingTableAssignPickResult {
  const skippedSelectionOverlap: Booking[] = [];
  const skippedTableConflict: Booking[] = [];
  const skippedOverCapacity: Booking[] = [];
  const assignable: Booking[] = [];
  const maxSeats = getMergeGroupEffectiveGuestCapacity(group.totalCapacity);

  const sorted = [...candidates].sort((left, right) => {
    const leftStart = normalizeBookingSlotMs(left).startMs;
    const rightStart = normalizeBookingSlotMs(right).startMs;
    return leftStart - rightStart;
  });

  for (const booking of sorted) {
    if (booking.guestCount > maxSeats) {
      skippedOverCapacity.push(booking);
      continue;
    }
    if (assignable.some((picked) => bookingsTimeSlotsOverlap(picked, booking))) {
      skippedSelectionOverlap.push(booking);
      continue;
    }
    const candidateOnGroup: Booking = { ...booking, mergeGroupId: group.id, tableId: null };
    if (hasAssignableSlotConflictAtMergeGroup(candidateOnGroup, group, allBookings)) {
      skippedTableConflict.push(booking);
      continue;
    }
    assignable.push(booking);
  }

  return { assignable, skippedSelectionOverlap, skippedTableConflict, skippedOverCapacity };
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
    if (
      seatsNeeded !== undefined &&
      getTableEffectiveGuestCapacity(table.seats) < seatsNeeded
    ) {
      return false;
    }
    return !hasAssignableSlotConflictAtTable(booking, table.id, allBookings);
  });
}

/**
 * True when the candidate booking overlaps another active reservation on the merge group
 * itself OR on any of its member tables (members are physically blocked while the group is held).
 */
export function hasAssignableSlotConflictAtMergeGroup(
  candidate: Booking,
  group: Pick<TableMergeGroup, "id" | "tableIds">,
  allBookings: readonly Booking[]
): boolean {
  const memberIds = new Set(group.tableIds);
  return allBookings.some((item) => {
    if (item.id === candidate.id) {
      return false;
    }
    if (!reservationBlocksAssignableSlot(item) && item.mergeGroupId !== group.id) {
      // Only "reservationBlocksAssignableSlot" filters items with tableId set.
      // A booking on the merge group itself has tableId === null, so include it here.
      const onGroup = item.mergeGroupId === group.id;
      const activeStatus =
        item.status === "confirmed" ||
        item.status === "seated" ||
        item.status === "checked_in" ||
        item.status === "pending";
      if (!onGroup || !activeStatus) {
        return false;
      }
    }
    const onMemberTable = item.tableId != null && memberIds.has(item.tableId);
    const onSameGroup = item.mergeGroupId === group.id;
    if (!onMemberTable && !onSameGroup) {
      return false;
    }
    return bookingsTimeSlotsOverlap(candidate, item);
  });
}

/** Active merge groups that can hold this booking (branch + capacity + slot conflicts). */
export function getAssignableMergeGroups(
  booking: Booking,
  mergeGroups: readonly TableMergeGroup[],
  allBookings: readonly Booking[],
  requiredSeats?: number
): TableMergeGroup[] {
  const seatsNeeded =
    typeof requiredSeats === "number" && Number.isFinite(requiredSeats)
      ? Math.max(1, Math.round(requiredSeats))
      : Math.max(1, booking.guestCount);

  return mergeGroups.filter((group) => {
    if (group.branchId !== booking.branchId || group.status !== "active") {
      return false;
    }
    if (getMergeGroupEffectiveGuestCapacity(group.totalCapacity) < seatsNeeded) {
      return false;
    }
    return !hasAssignableSlotConflictAtMergeGroup(booking, group, allBookings);
  });
}

export type MergeRecommendation = {
  /** Stable key — for existing groups: `group:${id}`. For new combinations: `combo:${tableId1,tableId2,...}`. */
  key: string;
  kind: "existing-group" | "new-combination";
  /** Member table ids in their suggested order (sorted by adjacency / capacity). */
  tableIds: string[];
  /** Sum of member seats. */
  totalCapacity: number;
  /** When kind === 'existing-group'. */
  existingGroup?: TableMergeGroup;
};

type GridPosition = Pick<DiningTable, "positionX" | "positionY">;

function manhattanDistance(a: GridPosition, b: GridPosition): number {
  return Math.abs(a.positionX - b.positionX) + Math.abs(a.positionY - b.positionY);
}

/**
 * Pairwise "spread" used to rank new combinations: sum of all pairwise Manhattan distances.
 * Lower is better (tables sit close to each other on the floor map).
 */
function combinationSpread(tables: readonly DiningTable[]): number {
  let total = 0;
  for (let i = 0; i < tables.length; i += 1) {
    for (let j = i + 1; j < tables.length; j += 1) {
      total += manhattanDistance(tables[i], tables[j]);
    }
  }
  return total;
}

const MAX_RECOMMENDATION_CANDIDATES = 5;
const MAX_NEW_COMBINATION_TABLES = 4;
const MAX_AREA_TABLES_FOR_FULL_SUBSET = 14;

function isMergeGroupCandidateForRecommendation(
  group: TableMergeGroup,
  options: {
    branchId: string;
    areaId?: string | null;
    candidateDayLabel: string | null;
  }
): boolean {
  if (group.branchId !== options.branchId || group.status !== "active") {
    return false;
  }
  if (options.areaId && group.areaId !== options.areaId) {
    return false;
  }
  if (
    options.candidateDayLabel &&
    (options.candidateDayLabel < group.startDate ||
      options.candidateDayLabel > group.endDate)
  ) {
    return false;
  }
  return true;
}

/**
 * Suggest ways to fit `targetSeats` guests when no single table works:
 * 1. Reuse existing active merge groups (already gộp) with enough capacity.
 * 2. Propose new combinations of 2..MAX_NEW_COMBINATION_TABLES available tables (no slot conflicts,
 *    excluding tables already in an active merge group on the booking day).
 *
 * Returns at most `MAX_RECOMMENDATION_CANDIDATES` ranked suggestions.
 * Ranking: existing groups first, then fewer tables, then least wasted seats, then tighter grid spread.
 */
export function recommendMergeGroups(
  booking: Booking,
  options: {
    areaTables: readonly DiningTable[];
    mergeGroups: readonly TableMergeGroup[];
    allBookings: readonly Booking[];
    targetSeats: number;
    /** Restrict to a specific area when set (typical for the floor-map). */
    areaId?: string | null;
  }
): MergeRecommendation[] {
  const targetSeats = Math.max(1, Math.round(options.targetSeats));
  const branchId = booking.branchId;
  const candidateDay = dayjs(booking.bookingAt);
  const candidateDayLabel = candidateDay.isValid() ? candidateDay.format("YYYY-MM-DD") : null;
  const allBookingsOnCandidateDay = candidateDayLabel
    ? options.allBookings.filter((b) => {
        const d = dayjs(b.bookingAt);
        return d.isValid() && d.format("YYYY-MM-DD") === candidateDayLabel;
      })
    : options.allBookings;

  const mergeGroupScope = { branchId, areaId: options.areaId, candidateDayLabel };

  const tableIdsInActiveMergeGroups = new Set<string>();
  for (const group of options.mergeGroups) {
    if (!isMergeGroupCandidateForRecommendation(group, mergeGroupScope)) {
      continue;
    }
    for (const tableId of group.tableIds) {
      tableIdsInActiveMergeGroups.add(tableId);
    }
  }

  const existingGroupSuggestions: MergeRecommendation[] = options.mergeGroups
    .filter((group) => {
      if (!isMergeGroupCandidateForRecommendation(group, mergeGroupScope)) {
        return false;
      }
      if (getMergeGroupEffectiveGuestCapacity(group.totalCapacity) < targetSeats) {
        return false;
      }
      return !hasAssignableSlotConflictAtMergeGroup(booking, group, allBookingsOnCandidateDay);
    })
    .map((group) => ({
      key: `group:${group.id}`,
      kind: "existing-group" as const,
      tableIds: group.tableIds,
      totalCapacity: group.totalCapacity,
      existingGroup: group,
    }));

  const availableTables = options.areaTables.filter((table) => {
    if (table.branchId !== branchId || table.status === "locked") {
      return false;
    }
    if (options.areaId && table.areaId !== options.areaId) {
      return false;
    }
    if (table.positionX < 0 || table.positionY < 0) {
      return false;
    }
    if (tableIdsInActiveMergeGroups.has(table.id)) {
      return false;
    }
    return !hasAssignableSlotConflictAtTable(booking, table.id, allBookingsOnCandidateDay);
  });

  const newCombinations = enumerateBestCombinations(availableTables, targetSeats);

  const merged = [...existingGroupSuggestions, ...newCombinations];

  merged.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "existing-group" ? -1 : 1;
    }
    if (a.tableIds.length !== b.tableIds.length) {
      return a.tableIds.length - b.tableIds.length;
    }
    const wastedA = getMergeGroupEffectiveGuestCapacity(a.totalCapacity) - targetSeats;
    const wastedB = getMergeGroupEffectiveGuestCapacity(b.totalCapacity) - targetSeats;
    if (wastedA !== wastedB) {
      return wastedA - wastedB;
    }
    return a.totalCapacity - b.totalCapacity;
  });

  return merged.slice(0, MAX_RECOMMENDATION_CANDIDATES);
}

function enumerateBestCombinations(
  available: readonly DiningTable[],
  targetSeats: number
): MergeRecommendation[] {
  if (available.length < 2) {
    return [];
  }

  const tablesByArea = new Map<string, DiningTable[]>();
  for (const table of available) {
    const bucket = tablesByArea.get(table.areaId) ?? [];
    bucket.push(table);
    tablesByArea.set(table.areaId, bucket);
  }

  const out: MergeRecommendation[] = [];
  for (const [, tables] of tablesByArea) {
    if (tables.length < 2) {
      continue;
    }
    if (tables.length <= MAX_AREA_TABLES_FOR_FULL_SUBSET) {
      pushBoundedSubsets(out, tables, targetSeats);
    } else {
      pushGreedyCombinations(out, tables, targetSeats);
    }
  }

  out.sort((a, b) => {
    if (a.tableIds.length !== b.tableIds.length) {
      return a.tableIds.length - b.tableIds.length;
    }
    const wastedA = getMergeGroupEffectiveGuestCapacity(a.totalCapacity) - targetSeats;
    const wastedB = getMergeGroupEffectiveGuestCapacity(b.totalCapacity) - targetSeats;
    return wastedA - wastedB;
  });

  return out.slice(0, MAX_RECOMMENDATION_CANDIDATES * 2);
}

function pushBoundedSubsets(
  out: MergeRecommendation[],
  tables: readonly DiningTable[],
  targetSeats: number
): void {
  const candidates: { tables: DiningTable[]; total: number; spread: number }[] = [];
  const n = tables.length;
  const seen = new Set<string>();

  const visit = (start: number, picked: DiningTable[]) => {
    if (picked.length >= 2 && picked.length <= MAX_NEW_COMBINATION_TABLES) {
      const total = picked.reduce((acc, t) => acc + t.seats, 0);
      if (getMergeGroupEffectiveGuestCapacity(total) >= targetSeats) {
        const sortedIds = picked
          .map((t) => t.id)
          .sort()
          .join(",");
        if (!seen.has(sortedIds)) {
          seen.add(sortedIds);
          candidates.push({
            tables: picked.slice(),
            total,
            spread: combinationSpread(picked),
          });
        }
        return;
      }
    }
    if (picked.length >= MAX_NEW_COMBINATION_TABLES) {
      return;
    }
    for (let i = start; i < n; i += 1) {
      picked.push(tables[i]);
      visit(i + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);

  candidates.sort((a, b) => {
    if (a.tables.length !== b.tables.length) {
      return a.tables.length - b.tables.length;
    }
    const wastedA = getMergeGroupEffectiveGuestCapacity(a.total) - targetSeats;
    const wastedB = getMergeGroupEffectiveGuestCapacity(b.total) - targetSeats;
    if (wastedA !== wastedB) {
      return wastedA - wastedB;
    }
    return a.spread - b.spread;
  });

  for (const candidate of candidates.slice(0, MAX_RECOMMENDATION_CANDIDATES)) {
    const sortedTables = [...candidate.tables].sort(
      (left, right) =>
        manhattanDistance(left, candidate.tables[0]) -
        manhattanDistance(right, candidate.tables[0])
    );
    const ids = sortedTables.map((t) => t.id);
    out.push({
      key: `combo:${[...ids].sort().join(",")}`,
      kind: "new-combination",
      tableIds: ids,
      totalCapacity: candidate.total,
    });
  }
}

function pushGreedyCombinations(
  out: MergeRecommendation[],
  tables: readonly DiningTable[],
  targetSeats: number
): void {
  const sortedBySeatsDesc = [...tables].sort((a, b) => b.seats - a.seats);
  for (const anchor of sortedBySeatsDesc.slice(0, MAX_RECOMMENDATION_CANDIDATES)) {
    const picked: DiningTable[] = [anchor];
    let total = anchor.seats;
    if (getMergeGroupEffectiveGuestCapacity(total) >= targetSeats) {
      continue;
    }
    const neighbors = [...tables]
      .filter((t) => t.id !== anchor.id)
      .sort((a, b) => manhattanDistance(a, anchor) - manhattanDistance(b, anchor));
    for (const next of neighbors) {
      picked.push(next);
      total += next.seats;
      if (
        getMergeGroupEffectiveGuestCapacity(total) >= targetSeats ||
        picked.length >= MAX_NEW_COMBINATION_TABLES
      ) {
        break;
      }
    }
    if (getMergeGroupEffectiveGuestCapacity(total) >= targetSeats) {
      const ids = picked.map((t) => t.id);
      out.push({
        key: `combo:${[...ids].sort().join(",")}`,
        kind: "new-combination",
        tableIds: ids,
        totalCapacity: total,
      });
    }
  }
}
