import dayjs from "dayjs";

import { DEFAULT_BOOKING_RUNTIME_SETTINGS } from "@/lib/booking-runtime-defaults";
import {
  bookingStatusColor,
  bookingStatusLabel,
  BOOKING_LATE_TABLE_REMINDER_LABEL,
  BOOKING_PENDING_TABLE_LABEL,
} from "@/lib/display";
import {
  type Booking,
  type BookingRuntimeSettings,
  type BookingStatus,
  type DiningTable,
  type TableMergeGroup,
  type TableStatus,
} from "@/lib/types";

/** Order creation time; falls back to start time for legacy rows. */
export function resolveBookingCreatedAt(booking: Booking): string {
  return booking.createdAt ?? booking.startTime;
}

/** Guest scheduled arrival / slot start — never order creation time. */
export function resolveBookingArrivalTime(
  booking: Pick<Booking, "startTime" | "bookingAt">
): string {
  const start = booking.startTime?.trim();
  if (start) {
    return start;
  }
  return booking.bookingAt;
}

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

/** Default customer name when Ngồi ngay has no guest name. */
export const WALK_IN_CUSTOMER_NAME = "Vãng lai";

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
  | "lateGraceMinutes"
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
    lateGraceMinutes:
      thresholds?.lateGraceMinutes ?? DEFAULT_BOOKING_RUNTIME_SETTINGS.lateGraceMinutes,
  };
}

/** Slot start used for no-show rules (matches `run_booking_maintenance` in Postgres). */
export function getBookingSlotStart(booking: Pick<Booking, "startTime" | "bookingAt">): dayjs.Dayjs {
  return dayjs(booking.startTime ?? booking.bookingAt);
}

/** True when a confirmed booking is past the late grace window without check-in. */
export function isPastLateGrace(
  booking: Pick<Booking, "status" | "checkedInAt" | "startTime" | "bookingAt">,
  lateGraceMinutes: number
): boolean {
  if (booking.checkedInAt) {
    return false;
  }
  if (booking.status !== "confirmed") {
    return false;
  }
  const minutesPast = dayjs().diff(getBookingSlotStart(booking), "minute");
  return minutesPast >= lateGraceMinutes;
}

/** @deprecated Use isPastLateGrace for confirmed guests; no_show is end-of-day only. */
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

  if (booking.status === "late") {
    return { label: bookingStatusLabel.late, color: bookingStatusColor.late };
  }

  if (booking.status === "confirmed") {
    if (hasDepositNote) {
      return { label: "Đã cọc", color: "yellow" };
    }
    if (isPastLateGrace(booking, thresholds.lateGraceMinutes)) {
      return { label: bookingStatusLabel.late, color: bookingStatusColor.late };
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

type BookingAreaTableDisplay = Pick<Booking, "areaId" | "tableId" | "mergeGroupId"> &
  Partial<Pick<Booking, "status">>;

function formatBookingAreaTableBase(
  booking: BookingAreaTableDisplay,
  lookup: BookingAreaTableLookup,
  options?: {
    pendingLabel?: string;
    /** Prefix single table with `Bàn ` (list mobile cards). */
    tableNamePrefix?: boolean;
  }
): string {
  const pendingLabel = options?.pendingLabel ?? BOOKING_PENDING_TABLE_LABEL;
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

/** Display line for Khu vực / Bàn columns (list, detail, search). */
export function formatBookingAreaTable(
  booking: BookingAreaTableDisplay,
  lookup: BookingAreaTableLookup,
  options?: {
    pendingLabel?: string;
    /** Prefix single table with `Bàn ` (list mobile cards). */
    tableNamePrefix?: boolean;
  }
): string {
  const base = formatBookingAreaTableBase(booking, lookup, options);
  const pendingLabel = options?.pendingLabel ?? BOOKING_PENDING_TABLE_LABEL;
  if (
    booking.status === "late" &&
    base !== pendingLabel &&
    isBookingTableAssigned(booking)
  ) {
    return `${base} · ${BOOKING_LATE_TABLE_REMINDER_LABEL}`;
  }
  return base;
}

/** Sort/search key for areaTable column — same labels as display. */
export function bookingAreaTableSortKey(
  booking: Pick<Booking, "areaId" | "tableId" | "mergeGroupId">,
  lookup: BookingAreaTableLookup
): string {
  return formatBookingAreaTable(booking, lookup);
}

/** Nhãn khu/bàn trên màn hôm nay — rút gọn khi chưa gán. */
export function formatTodayBookingAreaTable(
  booking: Pick<Booking, "areaId" | "tableId" | "mergeGroupId">,
  lookup: BookingAreaTableLookup
): string {
  return formatBookingAreaTable(booking, lookup);
}

/** Leading column on booking compact cards: table name on top, area underneath. */
export function resolveBookingLeadingColumn(
  booking: BookingAreaTableDisplay,
  lookup: BookingAreaTableLookup,
  options?: { pendingLabel?: string }
): { primary: string; secondary?: string } {
  const pendingLabel = options?.pendingLabel ?? BOOKING_PENDING_TABLE_LABEL;
  if (!isBookingTableAssigned(booking)) {
    return { primary: pendingLabel };
  }
  if (booking.mergeGroupId) {
    const group = lookup.mergeGroups.find((item) => item.id === booking.mergeGroupId);
    const areaName =
      (booking.areaId
        ? lookup.areas.find((item) => item.id === booking.areaId)?.name
        : null) ??
      (group ? lookup.areas.find((item) => item.id === group.areaId)?.name : null) ??
      "—";
    const primary =
      booking.status === "late"
        ? `${group?.mergedName ?? "Bàn gộp"} (${BOOKING_LATE_TABLE_REMINDER_LABEL})`
        : (group?.mergedName ?? "Bàn gộp");
    return {
      primary,
      secondary: areaName,
    };
  }
  const areaName = lookup.areas.find((item) => item.id === booking.areaId)?.name ?? "—";
  const tableName = lookup.tables.find((item) => item.id === booking.tableId)?.name ?? "—";
  const primary =
    booking.status === "late" ? `${tableName} (${BOOKING_LATE_TABLE_REMINDER_LABEL})` : tableName;
  return { primary, secondary: areaName };
}

/** @deprecated Use {@link resolveBookingLeadingColumn}. */
export function resolveTodayBookingLeadingColumn(
  booking: Pick<Booking, "areaId" | "tableId" | "mergeGroupId">,
  lookup: BookingAreaTableLookup
): { primary: string; secondary?: string } {
  return resolveBookingLeadingColumn(booking, lookup);
}

function slotStartMs(booking: Pick<Booking, "startTime" | "bookingAt">): number {
  const raw = booking.startTime ?? booking.bookingAt;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

/** Terminal statuses that do not occupy a table on the floor map. */
export const INACTIVE_FLOOR_MAP_BOOKING_STATUSES: readonly BookingStatus[] = [
  "completed",
  "cancelled",
  "no_show",
];

export function isInactiveFloorMapBookingStatus(status: BookingStatus): boolean {
  return (INACTIVE_FLOOR_MAP_BOOKING_STATUSES as readonly string[]).includes(status);
}

function isActiveFloorBooking(booking: Booking): boolean {
  return !isInactiveFloorMapBookingStatus(booking.status);
}

/** Bookings that reserve a table slot on the floor map and in assign/conflict checks. */
export const TABLE_RESERVATION_BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "late",
  "seated",
  "checked_in",
];

/** Derive live / day-preview table color from active bookings on one table. */
export function resolveTableStatusFromBookings(
  bookings: readonly Pick<Booking, "status">[]
): Exclude<TableStatus, "locked"> {
  if (bookings.length === 0) {
    return "available";
  }
  if (
    bookings.some((booking) => booking.status === "seated" || booking.status === "checked_in")
  ) {
    return "occupied";
  }
  if (bookings.some((booking) => booking.status === "late")) {
    return "late";
  }
  return "hold";
}

/** Table is reserved (not walk-in available) on the floor map. */
export function isTableReservedForFloorOps(status: TableStatus): boolean {
  return status === "hold" || status === "late" || status === "occupied";
}

export function canAssignBookingFromQueue(booking: Pick<Booking, "status">): boolean {
  const { status } = booking;
  return status === "pending" || status === "late";
}

/** Manager may release table and move booking back to the assignment queue (Chờ xếp). */
export function canQueueBooking(
  booking: Pick<Booking, "status" | "tableId" | "mergeGroupId">
): boolean {
  if (!booking.tableId && !booking.mergeGroupId) {
    return false;
  }
  return (
    booking.status === "confirmed" ||
    booking.status === "seated" ||
    booking.status === "checked_in"
  );
}

/** Bookings that still hold a table slot. */
const TABLE_OCCUPYING_BOOKING_STATUSES: readonly BookingStatus[] = [
  ...TABLE_RESERVATION_BOOKING_STATUSES,
];

function resolveAssignedTableIdsForCheckIn(
  booking: Pick<Booking, "tableId" | "mergeGroupId">,
  mergeGroups?: readonly Pick<TableMergeGroup, "id" | "tableIds">[]
): string[] {
  if (booking.mergeGroupId && mergeGroups) {
    const group = mergeGroups.find((item) => item.id === booking.mergeGroupId);
    if (group) {
      return group.tableIds;
    }
  }
  return booking.tableId ? [booking.tableId] : [];
}

/** True when another guest is already seated at the late booking's assigned table(s). */
export function hasOtherSeatedBookingAtAssignedTable(
  booking: Pick<Booking, "id" | "tableId" | "mergeGroupId" | "areaId">,
  allBookings: readonly Booking[],
  options?: {
    mergeGroups?: readonly Pick<TableMergeGroup, "id" | "tableIds">[];
  }
): boolean {
  const tableIds = resolveAssignedTableIdsForCheckIn(booking, options?.mergeGroups);
  if (tableIds.length === 0) {
    return false;
  }
  const tableIdSet = new Set(tableIds);

  return allBookings.some((other) => {
    if (other.id === booking.id || !other.tableId || !tableIdSet.has(other.tableId)) {
      return false;
    }
    return other.status === "seated" || other.status === "checked_in";
  });
}

/** @deprecated Use {@link hasOtherSeatedBookingAtAssignedTable} for late check-in guards. */
export function hasOtherBookingAtAssignedTable(
  booking: Pick<Booking, "id" | "tableId" | "mergeGroupId" | "areaId">,
  allBookings: readonly Booking[],
  options?: {
    mergeGroups?: readonly Pick<TableMergeGroup, "id" | "tableIds">[];
  }
): boolean {
  const tableIds = resolveAssignedTableIdsForCheckIn(booking, options?.mergeGroups);
  if (tableIds.length === 0) {
    return false;
  }
  const tableIdSet = new Set(tableIds);

  return allBookings.some((other) => {
    if (other.id === booking.id || !other.tableId || !tableIdSet.has(other.tableId)) {
      return false;
    }
    if (booking.mergeGroupId && other.mergeGroupId === booking.mergeGroupId) {
      return false;
    }
    return (TABLE_OCCUPYING_BOOKING_STATUSES as readonly string[]).includes(other.status);
  });
}

/** Confirmed bookings always qualify; late guests check in when their reserved table is still theirs. */
export function canCheckInBooking(
  booking: Pick<Booking, "id" | "status" | "tableId" | "mergeGroupId" | "areaId">,
  allBookings: readonly Booking[],
  options?: {
    mergeGroups?: readonly Pick<TableMergeGroup, "id" | "tableIds">[];
  }
): boolean {
  if (booking.status === "confirmed") {
    return true;
  }
  if (booking.status !== "late") {
    return false;
  }
  if (!isBookingTableAssigned(booking)) {
    return false;
  }
  return !hasOtherSeatedBookingAtAssignedTable(booking, allBookings, options);
}

export function checkInBookingDisabledReason(
  booking: Pick<Booking, "id" | "status" | "tableId" | "mergeGroupId" | "areaId">,
  allBookings: readonly Booking[],
  options?: {
    mergeGroups?: readonly Pick<TableMergeGroup, "id" | "tableIds">[];
  }
): string | null {
  if (canCheckInBooking(booking, allBookings, options)) {
    return null;
  }
  if (
    booking.status === "late" &&
    isBookingTableAssigned(booking) &&
    hasOtherSeatedBookingAtAssignedTable(booking, allBookings, options)
  ) {
    return "Bàn đã có khách khác đang ngồi. Vui lòng xử lý trước khi check-in.";
  }
  if (booking.status === "late") {
    return "Booking trễ cần được gán bàn trước khi check-in.";
  }
  return "Chỉ check-in khi booking đã xác nhận.";
}

export function minutesLateForBooking(
  booking: Pick<Booking, "startTime" | "bookingAt" | "lateMarkedAt">
): number {
  const slotStart = getBookingSlotStart(booking);
  const reference = booking.lateMarkedAt ? dayjs(booking.lateMarkedAt) : dayjs();
  return Math.max(0, reference.diff(slotStart, "minute"));
}

/** True when the table has any non-terminal booking on the floor-map selected day. */
export function tableHasActiveBookingOnFloorDay(
  tableId: string,
  dayBookings: readonly Booking[],
  options?: { excludeMergeGroupId?: string | null }
): boolean {
  return dayBookings.some((booking) => {
    if (booking.tableId !== tableId || !isActiveFloorBooking(booking)) {
      return false;
    }
    if (
      options?.excludeMergeGroupId &&
      isMergeGroupBookingOnMemberTable(booking, tableId, options.excludeMergeGroupId)
    ) {
      return false;
    }
    return true;
  });
}

function pickPrimaryFromTableBookings(onTable: readonly Booking[]): Booking | null {
  if (onTable.length === 0) {
    return null;
  }
  const checkedIn = onTable.filter(
    (booking) => booking.status === "checked_in" || booking.status === "seated"
  );
  const late = onTable.filter((booking) => booking.status === "late");
  const confirmed = onTable.filter((booking) => booking.status === "confirmed");
  const pool =
    checkedIn.length > 0 ? checkedIn : late.length > 0 ? late : confirmed.length > 0 ? confirmed : onTable;
  const sorted = [...pool].sort((a, b) => slotStartMs(a) - slotStartMs(b));
  if (checkedIn.length > 0) {
    return sorted[sorted.length - 1] ?? null;
  }
  return sorted[0] ?? null;
}

/** Prefer in-table seated guest, else late hold, else soonest confirmed, else any active booking on the table. */
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
  return pickPrimaryFromTableBookings(onTable);
}

/** Prefer seated/checked-in on the merge group, else late hold, else soonest confirmed, else any active booking. */
export function pickPrimaryBookingOnMergeGroup(
  mergeGroupId: string,
  bookings: readonly Booking[]
): Booking | null {
  const onGroup = bookings.filter(
    (booking) => booking.mergeGroupId === mergeGroupId && isActiveFloorBooking(booking)
  );
  return pickPrimaryFromTableBookings(onGroup);
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

/** Cluster booking stored on a member's table_id (RPC fallback) — not an individual table hold. */
export function isMergeGroupBookingOnMemberTable(
  booking: Pick<Booking, "tableId" | "mergeGroupId">,
  tableId: string,
  mergeGroupId: string
): boolean {
  return booking.tableId === tableId && booking.mergeGroupId === mergeGroupId;
}

/**
 * Floor-map preview for a merge member: show that table's own bookings first (walk-in / non-overlapping).
 * Cluster reservations stored on a member table_id do not change the block. When the cluster has an
 * active hold or seated booking and the member has no separate booking, mirror the cluster status.
 * A future individual reserve on the member does not override cluster Đã ngồi after check-in.
 */
export function deriveMergeMemberTableStatusFromDayBookings(
  table: Pick<DiningTable, "id" | "status">,
  mergeGroupId: string,
  dayBookings: readonly Booking[]
): DiningTable["status"] {
  if (table.status === "locked") {
    return "locked";
  }
  const bookingsExcludingMergeFallback = dayBookings.filter(
    (booking) => !isMergeGroupBookingOnMemberTable(booking, table.id, mergeGroupId)
  );

  const memberOwnSeated = bookingsExcludingMergeFallback.some(
    (booking) =>
      booking.tableId === table.id &&
      (booking.status === "seated" || booking.status === "checked_in")
  );
  if (memberOwnSeated) {
    return "occupied";
  }

  const groupStatus = deriveMergeGroupStatusFromDayBookings(mergeGroupId, dayBookings);
  if (groupStatus === "occupied" || groupStatus === "late") {
    return groupStatus;
  }

  const memberOwnStatus = deriveTableStatusFromDayBookings(
    table,
    bookingsExcludingMergeFallback
  );
  if (memberOwnStatus !== "available") {
    return memberOwnStatus;
  }
  if (groupStatus !== "available") {
    return groupStatus;
  }
  return "available";
}

/** Like pickPrimaryBookingOnTable but skips merge-cluster rows stored on a member table_id. */
export function pickPrimaryBookingOnTableForFloorDisplay(
  tableId: string,
  bookings: readonly Booking[],
  options?: { excludeMergeGroupId?: string | null }
): Booking | null {
  const eligible = bookings.filter(
    (booking) =>
      booking.tableId === tableId &&
      booking.status !== "cancelled" &&
      booking.status !== "completed" &&
      booking.status !== "no_show" &&
      !(
        options?.excludeMergeGroupId &&
        isMergeGroupBookingOnMemberTable(booking, tableId, options.excludeMergeGroupId)
      )
  );
  return pickPrimaryFromTableBookings(eligible);
}

/**
 * Primary booking for a floor-map table block or its detail modal.
 * Merge members: seated walk-in on the table wins; else soonest active slot between
 * that table's own bookings and the cluster booking.
 */
export function pickPrimaryBookingForFloorTableBlock(
  tableId: string,
  bookings: readonly Booking[],
  options?: { mergeGroupId?: string | null }
): Booking | null {
  const mergeGroupId = options?.mergeGroupId;
  const memberOwn = mergeGroupId
    ? pickPrimaryBookingOnTableForFloorDisplay(tableId, bookings, {
        excludeMergeGroupId: mergeGroupId,
      })
    : pickPrimaryBookingOnTable(tableId, bookings);
  const mergeBooking = mergeGroupId
    ? pickPrimaryBookingOnMergeGroup(mergeGroupId, bookings)
    : null;

  if (!mergeGroupId) {
    return memberOwn;
  }

  if (
    memberOwn &&
    (memberOwn.status === "checked_in" ||
      memberOwn.status === "seated" ||
      memberOwn.status === "late")
  ) {
    return memberOwn;
  }
  if (
    mergeBooking &&
    (mergeBooking.status === "checked_in" ||
      mergeBooking.status === "seated" ||
      mergeBooking.status === "late")
  ) {
    return mergeBooking;
  }

  const candidates = [memberOwn, mergeBooking].filter(
    (booking): booking is Booking => booking != null
  );
  if (candidates.length === 0) {
    return null;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  return [...candidates].sort((a, b) => slotStartMs(a) - slotStartMs(b))[0] ?? null;
}

/**
 * All active bookings shown in a merge-member table block detail schedule:
 * that table's own reservations (excluding cluster fallback rows) plus cluster bookings.
 */
export function listFloorTableBlockScheduleBookings(
  bookings: readonly Booking[],
  options: { tableId?: string | null; mergeGroupId?: string | null }
): Booking[] {
  const { tableId, mergeGroupId } = options;
  const byId = new Map<string, Booking>();

  for (const booking of bookings) {
    if (!isActiveFloorBooking(booking)) {
      continue;
    }
    if (
      tableId &&
      booking.tableId === tableId &&
      !(
        mergeGroupId &&
        isMergeGroupBookingOnMemberTable(booking, tableId, mergeGroupId)
      )
    ) {
      byId.set(booking.id, booking);
    }
    if (mergeGroupId && booking.mergeGroupId === mergeGroupId) {
      byId.set(booking.id, booking);
    }
  }

  return [...byId.values()].sort((a, b) => slotStartMs(a) - slotStartMs(b));
}

/** Floor-map calendar preview: derive merge-bar color from bookings on the selected day. */
export function deriveMergeGroupStatusFromDayBookings(
  mergeGroupId: string,
  dayBookings: readonly Booking[]
): TableStatus {
  const onGroup = dayBookings.filter(
    (booking) => booking.mergeGroupId === mergeGroupId && isActiveFloorBooking(booking)
  );
  return resolveTableStatusFromBookings(onGroup);
}

/** Member tables with their own seated guests (excludes cluster booking rows on member table_id). */
export function listOccupiedMergeMemberTableNames(
  group: Pick<TableMergeGroup, "id" | "tableIds">,
  tables: readonly Pick<DiningTable, "id" | "name" | "status">[],
  dayBookings: readonly Booking[]
): string[] {
  const tableById = new Map(tables.map((table) => [table.id, table]));
  const names: string[] = [];
  for (const tableId of group.tableIds) {
    const table = tableById.get(tableId);
    if (!table) {
      continue;
    }
    const bookingsExcludingMergeFallback = dayBookings.filter(
      (booking) => !isMergeGroupBookingOnMemberTable(booking, tableId, group.id)
    );
    if (
      deriveTableStatusFromDayBookings(table, bookingsExcludingMergeFallback) === "occupied"
    ) {
      names.push(table.name);
    }
  }
  return names;
}

/** True when a merge member still has its own seated/checked-in guests. */
export function mergeGroupHasOccupiedMemberTable(
  group: Pick<TableMergeGroup, "id" | "tableIds">,
  tables: readonly Pick<DiningTable, "id" | "name" | "status">[],
  dayBookings: readonly Booking[]
): boolean {
  return listOccupiedMergeMemberTableNames(group, tables, dayBookings).length > 0;
}

export const MERGE_GROUP_CHECK_IN_BLOCKED_BY_MEMBER_OCCUPIED =
  "Không thể check-in cụm gộp khi còn bàn thành viên đang có khách.";

/**
 * Higher rank = further along the booking lifecycle (used when merging day cache + global state).
 * Prevents stale global rows from undoing optimistic check-in / complete on the floor map.
 */
export function bookingStatusAdvancementRank(status: BookingStatus): number {
  switch (status) {
    case "completed":
    case "cancelled":
    case "no_show":
      return 90;
    case "late":
      return 40;
    case "seated":
    case "checked_in":
      return 70;
    case "confirmed":
      return 50;
    case "pending":
      return 30;
    default:
      return 0;
  }
}

/** Pick the row that best reflects current ops when day slice and AppContext disagree. */
export function pickBookingForFloorDayMerge(dayRow: Booking, globalRow: Booking): Booking {
  const dayRank = bookingStatusAdvancementRank(dayRow.status);
  const globalRank = bookingStatusAdvancementRank(globalRow.status);
  if (globalRank > dayRank) {
    return globalRow;
  }
  if (dayRank > globalRank) {
    return dayRow;
  }
  const dayEdited = dayRow.lastEditedAt ? dayjs(dayRow.lastEditedAt).valueOf() : 0;
  const globalEdited = globalRow.lastEditedAt ? dayjs(globalRow.lastEditedAt).valueOf() : 0;
  if (globalEdited > dayEdited) {
    return { ...dayRow, ...globalRow };
  }
  if (dayEdited > globalEdited) {
    return { ...globalRow, ...dayRow };
  }
  return { ...dayRow, ...globalRow };
}

/** Floor-map calendar preview: derive block color from bookings on the selected day only. */
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
  return resolveTableStatusFromBookings(onTable);
}

/** Keep in sync with `DEFAULT_BOOKING_RUNTIME_SETTINGS.standardTurnaroundMinutes` in `supabase-store`. */
const FALLBACK_STANDARD_TURNAROUND_MINUTES = 90;

/** Same filter as manual/auto assign on the bookings page — reservations that occupy a table slot. */
function reservationBlocksAssignableSlot(item: Booking): boolean {
  if (item.tableId == null) {
    return false;
  }
  return (TABLE_RESERVATION_BOOKING_STATUSES as readonly string[]).includes(item.status);
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
};

/** Pick pending bookings that can share one table without overlapping each other or existing reservations. */
export function pickNonOverlappingBookingsForTable(
  candidates: readonly Booking[],
  tableId: string,
  allBookings: readonly Booking[]
): PendingTableAssignPickResult {
  const skippedSelectionOverlap: Booking[] = [];
  const skippedTableConflict: Booking[] = [];
  const assignable: Booking[] = [];

  const sorted = [...candidates].sort((left, right) => {
    const leftStart = normalizeBookingSlotMs(left).startMs;
    const rightStart = normalizeBookingSlotMs(right).startMs;
    return leftStart - rightStart;
  });

  for (const booking of sorted) {
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

  return { assignable, skippedSelectionOverlap, skippedTableConflict };
}

/** Pick pending bookings that can share one merge group without overlapping. */
export function pickNonOverlappingBookingsForMergeGroup(
  candidates: readonly Booking[],
  group: Pick<TableMergeGroup, "id" | "tableIds">,
  allBookings: readonly Booking[]
): PendingTableAssignPickResult {
  const skippedSelectionOverlap: Booking[] = [];
  const skippedTableConflict: Booking[] = [];
  const assignable: Booking[] = [];

  const sorted = [...candidates].sort((left, right) => {
    const leftStart = normalizeBookingSlotMs(left).startMs;
    const rightStart = normalizeBookingSlotMs(right).startMs;
    return leftStart - rightStart;
  });

  for (const booking of sorted) {
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

  return { assignable, skippedSelectionOverlap, skippedTableConflict };
}

function formatConflictSlotRange(
  booking: Pick<Booking, "bookingAt" | "startTime" | "endTime">,
  referenceDay?: dayjs.Dayjs
): string {
  const slot = normalizeBookingSlotMs(booking);
  const start = dayjs(slot.startMs);
  const end = dayjs(slot.endMs);
  const ref = referenceDay ?? dayjs();
  const startLabel = start.isSame(ref, "day")
    ? start.format("HH:mm")
    : `${start.format("DD/MM/YYYY")} ${start.format("HH:mm")}`;
  const endLabel = end.isSame(start, "day") ? end.format("HH:mm") : end.format("DD/MM/YYYY HH:mm");
  return `${startLabel}–${endLabel}`;
}

export function formatTableSlotConflictMessage(
  conflicts: readonly Pick<Booking, "bookingAt" | "guestCount" | "startTime" | "endTime">[],
  options?: {
    tableName?: string;
    customerName?: string;
    /** Giờ đến của booking đang tạo/sửa — giúp giải thích vì sao bị chặn. */
    candidateBookingAt?: string;
  }
): string | null {
  if (conflicts.length === 0) {
    return null;
  }
  const first = conflicts[0];
  const conflictRange = formatConflictSlotRange(first, dayjs(first.bookingAt));
  const tableLabel = options?.tableName ? `bàn ${options.tableName}` : "bàn này";
  const guestPart = options?.customerName ? ` của ${options.customerName}` : "";
  const extraCount = conflicts.length - 1;
  const suffix = extraCount > 0 ? ` (+${extraCount} booking trùng khung)` : "";

  if (options?.candidateBookingAt) {
    const candidateAt = dayjs(options.candidateBookingAt);
    const candidateLabel = candidateAt.isSame(dayjs(), "day")
      ? candidateAt.format("HH:mm")
      : `${candidateAt.format("DD/MM/YYYY")} lúc ${candidateAt.format("HH:mm")}`;
    const freeAfter = dayjs(normalizeBookingSlotMs(first).endMs).format("HH:mm");
    return `Không thể đặt lúc ${candidateLabel} trên ${tableLabel}: đã có booking${guestPart} ${conflictRange} (${first.guestCount} khách). Chọn giờ sau ${freeAfter} hoặc bàn khác.${suffix}`;
  }

  const tablePart = options?.tableName ? ` trên bàn ${options.tableName}` : "";
  return `Khung giờ mới trùng booking${tablePart}${guestPart}: ${conflictRange} · ${first.guestCount} khách.${suffix}`;
}

/** Tables that may receive this booking (branch, not locked, no slot conflicts). */
export function getAssignableCandidateTables(
  booking: Booking,
  tables: readonly DiningTable[],
  allBookings: readonly Booking[]
): DiningTable[] {
  return tables.filter((table) => {
    if (table.branchId !== booking.branchId || table.status === "locked") {
      return false;
    }
    return !hasAssignableSlotConflictAtTable(booking, table.id, allBookings);
  });
}

function mergeGroupClusterBookingBlocksAssignableSlot(item: Booking): boolean {
  return (
    item.status === "confirmed" ||
    item.status === "seated" ||
    item.status === "checked_in" ||
    item.status === "pending"
  );
}

function bookingBlocksAssignableSlotOnMergeGroup(
  item: Booking,
  group: Pick<TableMergeGroup, "id" | "tableIds">,
  memberIds: ReadonlySet<string>
): boolean {
  const onMemberTable = item.tableId != null && memberIds.has(item.tableId);
  const onSameGroup = item.mergeGroupId === group.id;
  if (!onMemberTable && !onSameGroup) {
    return false;
  }
  if (onMemberTable) {
    return reservationBlocksAssignableSlot(item);
  }
  return mergeGroupClusterBookingBlocksAssignableSlot(item);
}

/**
 * True when the candidate booking overlaps another active reservation on the merge group
 * or on a member table (member tables only block overlapping slots, not the whole day).
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
    if (!bookingBlocksAssignableSlotOnMergeGroup(item, group, memberIds)) {
      return false;
    }
    return bookingsTimeSlotsOverlap(candidate, item);
  });
}

/** Active merge groups assignable for this booking (branch + slot conflicts). */
export function getAssignableMergeGroups(
  booking: Booking,
  mergeGroups: readonly TableMergeGroup[],
  allBookings: readonly Booking[]
): TableMergeGroup[] {
  return mergeGroups.filter((group) => {
    if (group.branchId !== booking.branchId || group.status !== "active") {
      return false;
    }
    return !hasAssignableSlotConflictAtMergeGroup(booking, group, allBookings);
  });
}
