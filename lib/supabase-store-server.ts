import dayjs from "dayjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addAppUserServer,
  deleteAppUserServer,
  getAppUserServer,
  listAppUsersServer,
  updateAppUserServer,
} from "./app-users-server";
import { DEFAULT_BOOKING_RUNTIME_SETTINGS } from "./booking-runtime-defaults";
import { BOOKING_PENDING_TABLE_LABEL } from "./display";
import type { Database } from "./database.types";
import { initialState } from "./initial-state";
import { createSupabaseAdmin } from "./supabase-admin";
import {
  bookingSlotKey,
  type BookingDuplicateInfo,
  type BookingDuplicateMatchReason,
  DUPLICATE_BOOKING_CODE,
  formatBookingDuplicateAlertMessage,
  isPlausibleVietnamPhone,
  isLikelySameGuestName,
  normalizeVietnameseName,
  normalizeVietnamPhone,
} from "./booking-duplicate";
import {
  appendUnknownGuestTag,
  bookingsTimeSlotsOverlap,
  buildBookingNoteForStorage,
  formatTableSlotConflictMessage,
  isImmediateBookingArrival,
  shouldAutoSeatOnCreate,
  shouldRefreshTableHoldAfterCreate,
  isSyntheticPhoneValue,
  pickPrimaryBookingOnTable,
  stripUnknownGuestTag,
} from "./booking-meta";
import {
  FLOOR_DEFAULT_NODE_SPACING_PX,
  clampFloorNodeSpacing,
} from "./floor-map-layout";
import {
  type AreaFloorLayoutByDate,
  floorLayoutSnapshotToJson,
  normalizeFloorLayoutSnapshot,
  parseFloorLayoutSnapshotJson,
  parseTablePositionsJson,
  positionsRecordFromSnapshot,
  snapshotFromGlobalArea,
  snapshotFromPositionsRecord,
  tablePositionsToJson,
  type FloorLayoutSnapshot,
} from "./floor-layout-snapshot";
import { packMergeGroupTablePositions } from "./floor-map-merge-layout";
import {
  eachLayoutDateInRange,
  formatMergeGroupDate,
  isLayoutDateWithinMergeRange,
  mapTableMergeGroupFromRow,
  mergeDateRangesOverlap,
  resolveMergeGroupDateRange,
  validateMergeGroupDateRange,
  type TableMergeGroupRowLike,
} from "./merge-group-utils";
import { layoutDateRangeIso } from "./floor-map-day-bookings";
import type { FloorMapStateSlice } from "./floor-map-state-slice";
import {
  buildOccupiedGridCells,
  findAdjacentFreeGridCell,
  formatSplitCloneName,
  pickNextSplitCloneNumber,
  validateSplitCloneDateRange,
} from "./table-split-clone-utils";
import {
  AppStateSnapshot,
  AppUser,
  Area,
  Booking,
  BookingRuntimeSettings,
  BookingStatus,
  Customer,
  DiningTable,
  Role,
  TableBlockState,
  TableMergeGroup,
  TableStatus,
} from "./types";

export type ActionResult = {
  ok: boolean;
  message: string;
  code?: typeof DUPLICATE_BOOKING_CODE;
  duplicates?: BookingDuplicateInfo[];
  /** Set when a booking row was created. */
  bookingId?: string;
};

type Result = ActionResult;

type CreateBookingInput = {
  customerName: string;
  customerPhone?: string;
  branchId: string;
  areaId?: string | null;
  tableId?: string | null;
  /** When set, the booking is held by a Bàn gộp group instead of a single table (`tableId` is ignored). */
  mergeGroupId?: string | null;
  guestCount?: number;
  bookingAt: string;
  note?: string;
  guestType?: string | null;
  createdByUserId: string;
  /** Skip phone+slot duplicate guard (e.g. khách đặt bàn thứ 2). */
  allowDuplicate?: boolean;
  /** Giữ chỗ vs Ngồi ngay — overrides timestamp-only seating when set. */
  arrivalIntent?: import("@/lib/booking-meta").BookingArrivalIntent;
};

type BookingCreateOrQueueResult = {
  outcome: "confirmed";
  message?: string | null;
  booking_id: string;
  start_time: string;
  end_time: string;
};

function parseConfirmedBookingRpcOutcome(
  outcome: unknown,
  fallbackMessage: string
): { ok: true; result: BookingCreateOrQueueResult } | { ok: false; message: string } {
  const row = (Array.isArray(outcome) ? outcome[0] : outcome) as
    | (Partial<BookingCreateOrQueueResult> & { outcome?: string })
    | null;
  if (!row || typeof row !== "object") {
    return { ok: false, message: fallbackMessage };
  }
  if (row.outcome !== "confirmed" || typeof row.booking_id !== "string") {
    return {
      ok: false,
      message: row.message ?? "Khung giờ đã kín, không thể xác nhận booking.",
    };
  }
  return { ok: true, result: row as BookingCreateOrQueueResult };
}

const ACTIVE_TABLE_SLOT_STATUSES: BookingStatus[] = ["confirmed", "seated", "checked_in"];
const ORPHAN_TABLE_RECONCILE_BATCH_SIZE = 64;
let bookingMaintenanceInFlight: Promise<void> | null = null;

async function maybeRunBookingMaintenance(force = false): Promise<void> {
  if (!force) {
    return;
  }
  if (bookingMaintenanceInFlight) {
    await bookingMaintenanceInFlight;
    return;
  }
  bookingMaintenanceInFlight = runBookingMaintenanceInSupabase()
    .then((result) => {
      if (!result.ok) {
        console.warn("[booking-maintenance] failed:", result.message);
      }
    })
    .finally(() => {
      bookingMaintenanceInFlight = null;
    });
  await bookingMaintenanceInFlight;
}
/** Bookings eligible for table assignment from queue (pending / Trễ). */
const ASSIGN_QUEUE_BOOKING_STATUSES: BookingStatus[] = ["pending", "late"];

/** Bookings that tie a table (show as hold, trễ, or occupied, not trống). */
const TABLE_RESERVATION_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "late",
  "seated",
  "checked_in",
];

export function isSupabaseStoreServerConfigured() {
  return Boolean(createSupabaseAdmin());
}

type StoreClient = SupabaseClient<Database>;

function ensureClient(): StoreClient {
  const client = createSupabaseAdmin();
  if (!client) {
    throw new Error("Chưa cấu hình Supabase server (SUPABASE_SERVICE_ROLE_KEY).");
  }
  return client;
}

/** PostgREST/Supabase default max rows returned per request. */
const SUPABASE_PAGE_SIZE = 1000;

type PagedQueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Fetch every matching row by paging with `.range()`, avoiding silent truncation
 * once a table exceeds the default 1000-row response cap.
 */
async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PagedQueryResult<T>>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await fetchPage(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) {
      return { data: all, error };
    }
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < SUPABASE_PAGE_SIZE) {
      return { data: all, error: null };
    }
    from += SUPABASE_PAGE_SIZE;
  }
}

function mapDiningTableFromRow(item: {
  id: string;
  branch_id: string;
  area_id: string;
  name: string;
  status: string;
  position_x: number;
  position_y: number;
  split_source_table_id?: string | null;
  split_clone_number?: number | null;
  split_start_date?: string | null;
  split_end_date?: string | null;
}): DiningTable {
  return {
    id: item.id,
    branchId: item.branch_id,
    areaId: item.area_id,
    name: item.name,
    status: item.status as TableStatus,
    positionX: item.position_x,
    positionY: item.position_y,
    splitSourceTableId: item.split_source_table_id ?? null,
    splitCloneNumber: item.split_clone_number ?? null,
    splitStartDate: item.split_start_date ?? null,
    splitEndDate: item.split_end_date ?? null,
  };
}

function mapAreaFromRow(item: {
  id: string;
  branch_id: string;
  name: string;
  floor_grid_columns?: number | null;
  floor_grid_rows?: number | null;
  floor_node_spacing?: number | null;
}): Area {
  return {
    id: item.id,
    branchId: item.branch_id,
    name: item.name,
    floorGridColumns:
      typeof item.floor_grid_columns === "number" ? item.floor_grid_columns : 12,
    floorGridRows: typeof item.floor_grid_rows === "number" ? item.floor_grid_rows : 8,
    floorNodeSpacing:
      typeof item.floor_node_spacing === "number"
        ? item.floor_node_spacing
        : FLOOR_DEFAULT_NODE_SPACING_PX,
  };
}

function mapBookingRuntimeSettingsRow(data: Record<string, unknown>): BookingRuntimeSettings {
  return {
    standardTurnaroundMinutes:
      typeof data.standard_turnaround_minutes === "number"
        ? data.standard_turnaround_minutes
        : DEFAULT_BOOKING_RUNTIME_SETTINGS.standardTurnaroundMinutes,
    noShowGraceMinutes:
      typeof data.no_show_grace_minutes === "number"
        ? data.no_show_grace_minutes
        : DEFAULT_BOOKING_RUNTIME_SETTINGS.noShowGraceMinutes,
    groupPartyGuestThreshold:
      typeof data.group_party_guest_threshold === "number"
        ? data.group_party_guest_threshold
        : DEFAULT_BOOKING_RUNTIME_SETTINGS.groupPartyGuestThreshold,
    repeatCustomerMinCompleted:
      typeof data.repeat_customer_min_completed === "number"
        ? data.repeat_customer_min_completed
        : DEFAULT_BOOKING_RUNTIME_SETTINGS.repeatCustomerMinCompleted,
    receptionArrivalGraceMinutes:
      typeof data.reception_arrival_grace_minutes === "number"
        ? data.reception_arrival_grace_minutes
        : DEFAULT_BOOKING_RUNTIME_SETTINGS.receptionArrivalGraceMinutes,
    lateGraceMinutes:
      typeof data.late_grace_minutes === "number"
        ? data.late_grace_minutes
        : typeof data.no_show_grace_minutes === "number"
          ? data.no_show_grace_minutes
          : DEFAULT_BOOKING_RUNTIME_SETTINGS.lateGraceMinutes,
  };
}

async function getBookingRuntimeSettings(
  client: ReturnType<typeof ensureClient>
): Promise<BookingRuntimeSettings> {
  const { data, error } = await (client as any)
    .from("booking_runtime_settings")
    .select(
      "standard_turnaround_minutes, no_show_grace_minutes, late_grace_minutes, group_party_guest_threshold, repeat_customer_min_completed, reception_arrival_grace_minutes"
    )
    .eq("id", true)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_BOOKING_RUNTIME_SETTINGS;
  }

  return mapBookingRuntimeSettingsRow(data as Record<string, unknown>);
}

export async function updateBookingRuntimeSettingsInSupabase(
  input: BookingRuntimeSettings
): Promise<Result> {
  const client = ensureClient();
  const { error } = await (client as any)
    .from("booking_runtime_settings")
    .update({
      standard_turnaround_minutes: input.standardTurnaroundMinutes,
      no_show_grace_minutes: input.noShowGraceMinutes,
      late_grace_minutes: input.lateGraceMinutes,
      group_party_guest_threshold: input.groupPartyGuestThreshold,
      repeat_customer_min_completed: input.repeatCustomerMinCompleted,
      reception_arrival_grace_minutes: input.receptionArrivalGraceMinutes,
      updated_at: dayjs().toISOString(),
    })
    .eq("id", true);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã lưu cấu hình vận hành booking." };
}

async function upsertCustomerForBooking(
  client: ReturnType<typeof ensureClient>,
  input: { customerName: string; customerPhone?: string }
): Promise<{ customerId: string } | { error: string }> {
  const normalizedPhone = input.customerPhone?.trim() || "";
  const hasProvidedPhone = normalizedPhone.length > 0;
  const { data: currentCustomer } = hasProvidedPhone
    ? await client
        .from("customers")
        .select("id")
        .eq("phone", normalizedPhone)
        .maybeSingle()
    : { data: null };

  let customerId = currentCustomer?.id as string | undefined;
  if (customerId) {
    const { error } = await client
      .from("customers")
      .update({ full_name: input.customerName })
      .eq("id", customerId);
    if (error) {
      return { error: error.message };
    }
  } else {
    const { data, error } = await client
      .from("customers")
      .insert({
        full_name: input.customerName,
        phone: hasProvidedPhone ? normalizedPhone : null,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { error: error?.message ?? "Không tạo được khách hàng." };
    }
    customerId = data.id;
  }

  return { customerId };
}

async function findBookingDuplicatesByPhoneSlotInSupabase(
  client: ReturnType<typeof ensureClient>,
  input: {
    branchId: string;
    customerPhone?: string;
    customerName?: string;
    bookingAt: string;
    tableId?: string | null;
    excludeBookingId?: string;
  }
): Promise<BookingDuplicateInfo[]> {
  const targetSlot = bookingSlotKey(input.bookingAt);
  if (!targetSlot) {
    return [];
  }
  const phoneRaw = input.customerPhone?.trim() ?? "";
  const phoneNorm = phoneRaw ? normalizeVietnamPhone(phoneRaw) : "";
  const hasValidPhone = Boolean(phoneNorm && isPlausibleVietnamPhone(phoneNorm));
  const targetName = normalizeVietnameseName(input.customerName ?? "");
  if (!hasValidPhone && !targetName) {
    return [];
  }

  const { data, error } = await (client as any)
    .from("bookings")
    .select(
      "id, booking_at, guest_count, table_id, created_by_user_id, customers(full_name, phone), app_users!bookings_created_by_user_id_fkey(full_name)"
    )
    .eq("branch_id", input.branchId)
    .in("status", ["pending", "confirmed", "seated", "checked_in", "no_show", "completed"]);
  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as Array<{
    id: string;
    booking_at: string;
    guest_count: number;
    table_id: string | null;
    created_by_user_id: string | null;
    customers: { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[] | null;
    app_users: { full_name: string } | { full_name: string }[] | null;
  }>;

  return rows
    .filter((row) => row.id !== input.excludeBookingId)
    .filter((row) => {
      const slot = bookingSlotKey(row.booking_at);
      if (!slot) return false;
      if (slot.dayKey !== targetSlot.dayKey || slot.timeKey !== targetSlot.timeKey) {
        return false;
      }
      if (input.tableId && row.table_id && input.tableId !== row.table_id) {
        return false;
      }
      return true;
    })
    .map((row) => {
      const customerJoin = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      const bookingPhoneRaw = customerJoin?.phone ?? "";
      const bookingPhone =
        bookingPhoneRaw && !isSyntheticPhoneValue(bookingPhoneRaw)
          ? normalizeVietnamPhone(bookingPhoneRaw)
          : "";
      const bookingHasValidPhone = Boolean(bookingPhone && isPlausibleVietnamPhone(bookingPhone));
      // When both sides have a real phone number, the phone is authoritative:
      // same phone → duplicate, different phone → different guest (never fall
      // back to fuzzy name matching, which false-positives on common names).
      let matchedBy: BookingDuplicateMatchReason | null = null;
      if (hasValidPhone && bookingHasValidPhone) {
        matchedBy = bookingPhone === phoneNorm ? "phone" : null;
      } else {
        const bookingName = normalizeVietnameseName(customerJoin?.full_name ?? "");
        if (bookingName && targetName && isLikelySameGuestName(bookingName, targetName)) {
          matchedBy = "name";
        }
      }
      if (!matchedBy) {
        return null;
      }
      const creatorJoin = Array.isArray(row.app_users) ? row.app_users[0] : row.app_users;
      return {
        bookingId: row.id,
        bookingAt: row.booking_at,
        guestCount: row.guest_count,
        receiverFullName: creatorJoin?.full_name ?? "Không rõ",
        receiverUserId: row.created_by_user_id ?? undefined,
        customerName: customerJoin?.full_name ?? undefined,
        tableLabel: row.table_id ? `Bàn ${row.table_id.slice(0, 8)}` : BOOKING_PENDING_TABLE_LABEL,
        matchedBy,
      };
    })
    .filter((item): item is Exclude<typeof item, null> => item !== null);
}

type TableSlotConflictRow = {
  id: string;
  booking_at: string;
  start_time: string | null;
  end_time: string | null;
  guest_count: number;
  customers: { full_name: string } | { full_name: string }[] | null;
};

function messageFromTableSlotConflictRows(
  conflicts: TableSlotConflictRow[],
  options: {
    tableName?: string;
    candidateBookingAt?: string;
    fallbackMessage: string;
  }
): string {
  if (conflicts.length === 0) {
    return options.fallbackMessage;
  }
  const first = conflicts[0];
  const customerJoin = first.customers;
  const conflictCustomerName = Array.isArray(customerJoin)
    ? customerJoin[0]?.full_name
    : customerJoin?.full_name;
  return (
    formatTableSlotConflictMessage(
      conflicts.map((row) => {
        const startTime = row.start_time ?? row.booking_at;
        return {
          bookingAt: row.booking_at,
          startTime,
          endTime:
            row.end_time ??
            dayjs(startTime)
              .add(DEFAULT_BOOKING_RUNTIME_SETTINGS.standardTurnaroundMinutes, "minute")
              .toISOString(),
          guestCount: row.guest_count,
        };
      }),
      {
        tableName: options.tableName,
        customerName: conflictCustomerName,
        candidateBookingAt: options.candidateBookingAt,
      }
    ) ?? options.fallbackMessage
  );
}

async function findMergeGroupBookingsOnMemberTableInSupabase(
  client: ReturnType<typeof ensureClient>,
  tableId: string,
  excludeBookingId: string
): Promise<TableSlotConflictRow[]> {
  const { data: memberRows, error: memberErr } = await (client as any)
    .from("table_merge_members")
    .select("group_id")
    .eq("table_id", tableId);
  if (memberErr) {
    throw new Error(memberErr.message);
  }
  const groupIds = [
    ...new Set(
      ((memberRows ?? []) as Array<{ group_id: string }>).map((row) => row.group_id)
    ),
  ];
  if (groupIds.length === 0) {
    return [];
  }

  const { data: activeGroups, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .select("id")
    .in("id", groupIds)
    .eq("status", "active");
  if (groupErr) {
    throw new Error(groupErr.message);
  }
  const activeGroupIds = ((activeGroups ?? []) as Array<{ id: string }>).map((row) => row.id);
  if (activeGroupIds.length === 0) {
    return [];
  }

  const { data, error } = await (client as any)
    .from("bookings")
    .select("id, booking_at, start_time, end_time, guest_count, customers(full_name)")
    .in("merge_group_id", activeGroupIds)
    .neq("id", excludeBookingId)
    .in("status", TABLE_RESERVATION_BOOKING_STATUSES);
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as TableSlotConflictRow[];
}

async function findTableBookingSlotConflictsInSupabase(
  client: ReturnType<typeof ensureClient>,
  input: {
    bookingId: string;
    tableId: string;
    startTime: string;
    endTime: string;
  }
): Promise<TableSlotConflictRow[]> {
  const candidate = {
    bookingAt: input.startTime,
    startTime: input.startTime,
    endTime: input.endTime,
  };
  const overlapsCandidate = (row: TableSlotConflictRow) =>
    bookingsTimeSlotsOverlap(candidate, {
      bookingAt: row.booking_at,
      startTime: row.start_time ?? row.booking_at,
      endTime: row.end_time ?? input.endTime,
    });

  const { data, error } = await (client as any)
    .from("bookings")
    .select("id, booking_at, start_time, end_time, guest_count, customers(full_name)")
    .eq("table_id", input.tableId)
    .neq("id", input.bookingId)
    .in("status", TABLE_RESERVATION_BOOKING_STATUSES);
  if (error) {
    throw new Error(error.message);
  }

  const directConflicts = ((data ?? []) as TableSlotConflictRow[]).filter(overlapsCandidate);
  if (directConflicts.length > 0) {
    return directConflicts;
  }

  const mergeRows = await findMergeGroupBookingsOnMemberTableInSupabase(
    client,
    input.tableId,
    input.bookingId
  );
  return mergeRows.filter(overlapsCandidate);
}

async function findMergeGroupSlotConflictsInSupabase(
  client: ReturnType<typeof ensureClient>,
  input: {
    bookingId: string;
    mergeGroupId: string;
    memberTableIds: string[];
    startTime: string;
    endTime: string;
  }
): Promise<{ conflicts: TableSlotConflictRow[]; tableName?: string } | null> {
  const candidate = {
    bookingAt: input.startTime,
    startTime: input.startTime,
    endTime: input.endTime,
  };
  const overlapsCandidate = (row: TableSlotConflictRow) =>
    bookingsTimeSlotsOverlap(candidate, {
      bookingAt: row.booking_at,
      startTime: row.start_time ?? row.booking_at,
      endTime: row.end_time ?? input.endTime,
    });

  const { data: groupBookings, error: groupBookingsErr } = await (client as any)
    .from("bookings")
    .select("id, booking_at, start_time, end_time, guest_count, customers(full_name)")
    .eq("merge_group_id", input.mergeGroupId)
    .neq("id", input.bookingId)
    .in("status", TABLE_RESERVATION_BOOKING_STATUSES);
  if (groupBookingsErr) {
    throw new Error(groupBookingsErr.message);
  }
  const groupConflict = ((groupBookings ?? []) as TableSlotConflictRow[]).find(overlapsCandidate);
  if (groupConflict) {
    return { conflicts: [groupConflict] };
  }

  for (const memberTableId of input.memberTableIds) {
    const memberConflicts = await findTableBookingSlotConflictsInSupabase(client, {
      bookingId: input.bookingId,
      tableId: memberTableId,
      startTime: input.startTime,
      endTime: input.endTime,
    });
    if (memberConflicts.length > 0) {
      const { data: tableRow } = await client
        .from("tables")
        .select("name")
        .eq("id", memberTableId)
        .maybeSingle();
      return {
        conflicts: memberConflicts,
        tableName: tableRow?.name ?? "bàn thành viên",
      };
    }
  }

  return null;
}

function duplicateBookingResult(
  duplicates: BookingDuplicateInfo[],
  bookingAt: string
): Result {
  return {
    ok: false,
    code: DUPLICATE_BOOKING_CODE,
    duplicates,
    message:
      formatBookingDuplicateAlertMessage(duplicates, bookingAt) ??
      "Số điện thoại này đã có booking trùng khung giờ.",
  };
}

type MergeGroupAssignContext =
  | {
      ok: true;
      mergedName: string;
      areaId: string;
      branchId: string;
      memberTableIds: string[];
      /** First member table — satisfies NOT NULL on RPC p_table_id (still nullified in SQL for merge bookings). */
      fallbackTableId: string;
    }
  | { ok: false; message: string };

async function assertMergeGroupBookingAllowed(
  client: ReturnType<typeof ensureClient>,
  input: {
    mergeGroupId: string;
    branchId: string;
    areaId?: string | null;
    guestCount: number;
    bookingAt?: string;
  }
): Promise<MergeGroupAssignContext> {
  const { data: groupRow, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .select("id, branch_id, area_id, status, merged_name, start_date, end_date, created_at")
    .eq("id", input.mergeGroupId)
    .maybeSingle();
  if (groupErr) {
    return { ok: false, message: groupErr.message };
  }
  if (!groupRow) {
    return { ok: false, message: "Cụm bàn gộp không tồn tại." };
  }
  if (groupRow.status !== "active") {
    return { ok: false, message: "Cụm bàn gộp đã được giải tán." };
  }
  if (groupRow.branch_id !== input.branchId) {
    return { ok: false, message: "Cụm bàn gộp không thuộc cùng chi nhánh với booking." };
  }
  if (input.areaId && groupRow.area_id !== input.areaId) {
    return { ok: false, message: "Cụm bàn gộp không thuộc khu vực đã chọn." };
  }
  if (input.bookingAt) {
    const bookingDay = formatMergeGroupDate(input.bookingAt);
    const { startDate, endDate } = resolveMergeGroupDateRange(groupRow);
    if (!mergeDateRangesOverlap(bookingDay, bookingDay, startDate, endDate)) {
      return {
        ok: false,
        message: `Cụm bàn gộp chỉ có hiệu lực từ ${startDate} đến ${endDate}.`,
      };
    }
  }

  const { data: members, error: membersErr } = await (client as any)
    .from("table_merge_members")
    .select("table_id, tables(id)")
    .eq("group_id", input.mergeGroupId);
  if (membersErr) {
    return { ok: false, message: membersErr.message };
  }
  const memberRows = (members ?? []) as Array<{
    table_id: string;
    tables: { id: string } | { id: string }[] | null;
  }>;
  if (memberRows.length === 0) {
    return { ok: false, message: "Cụm bàn gộp không còn bàn thành viên." };
  }
  const memberTableIds = memberRows.map((row) => row.table_id);

  return {
    ok: true,
    mergedName: groupRow.merged_name,
    areaId: groupRow.area_id,
    branchId: groupRow.branch_id,
    memberTableIds,
    fallbackTableId: memberTableIds[0],
  };
}

async function refreshTableAvailabilityForBooking(
  client: ReturnType<typeof ensureClient>,
  tableId: string
): Promise<void> {
  const { data: tableRow } = await client.from("tables").select("status").eq("id", tableId).maybeSingle();
  if ((tableRow?.status as TableStatus | undefined) === "locked") {
    return;
  }
  const { data: directRows, error: directErr } = await client
    .from("bookings")
    .select("id, status")
    .eq("table_id", tableId)
    .in("status", TABLE_RESERVATION_BOOKING_STATUSES);
  if (directErr) {
    return;
  }

  let mergeRows: Array<{ id: string; status: string }> = [];
  const { data: memberRows, error: memberErr } = await (client as any)
    .from("table_merge_members")
    .select("group_id")
    .eq("table_id", tableId);
  if (!memberErr && memberRows?.length) {
    const groupIds = (memberRows as Array<{ group_id: string }>).map((row) => row.group_id);
    const { data: mergeBookings, error: mergeErr } = await client
      .from("bookings")
      .select("id, status")
      .in("merge_group_id", groupIds)
      .in("status", TABLE_RESERVATION_BOOKING_STATUSES);
    if (!mergeErr && mergeBookings) {
      mergeRows = mergeBookings as Array<{ id: string; status: string }>;
    }
  }

  const rows = [...(directRows ?? []), ...mergeRows];
  if (rows.length === 0) {
    await client.from("tables").update({ status: "available" }).eq("id", tableId);
    return;
  }
  const hasSeated = rows.some(
    (r: { status: string }) => r.status === "seated" || r.status === "checked_in"
  );
  const hasLate = rows.some((r: { status: string }) => r.status === "late");
  const nextStatus: TableStatus = hasSeated ? "occupied" : hasLate ? "late" : "hold";
  await client.from("tables").update({ status: nextStatus }).eq("id", tableId);
}

/** Vào bàn ngay / arrival due: mark booking seated so refresh sets table to occupied. */
async function seatBookingForImmediateArrival(
  client: ReturnType<typeof ensureClient>,
  input: {
    bookingId: string;
    tableId: string;
    bookingAtIso: string;
    arrivalIntent?: import("@/lib/booking-meta").BookingArrivalIntent;
  }
): Promise<void> {
  if (!shouldAutoSeatOnCreate(input.bookingAtIso, input.arrivalIntent)) {
    return;
  }
  const { error: bookingErr } = await (client as any)
    .from("bookings")
    .update({
      status: "seated",
      checked_in_at: dayjs().toISOString(),
      no_show_marked_at: null,
    })
    .eq("id", input.bookingId);
  if (bookingErr) {
    throw new Error(bookingErr.message);
  }
  const { data: tableRow } = await client
    .from("tables")
    .select("status")
    .eq("id", input.tableId)
    .maybeSingle();
  if ((tableRow?.status as TableStatus | undefined) !== "locked") {
    await refreshTableAvailabilityForBooking(client, input.tableId);
  }
}

/**
 * Automated no-show (run_booking_maintenance) updates `bookings` in SQL without touching
 * `tables.status`. This reconciles affected tables so we do not leave "Giữ chỗ" with empty peek.
 */
/** Vietnam local calendar (UTC+7, no DST) for end-of-day maintenance on Vercel (UTC). */
const RESTAURANT_UTC_OFFSET_MINUTES = 7 * 60;

function restaurantCalendarDateKey(iso?: string): string {
  const base = iso ? dayjs(iso) : dayjs();
  if (!base.isValid()) {
    return "";
  }
  return base.add(RESTAURANT_UTC_OFFSET_MINUTES, "minute").format("YYYY-MM-DD");
}

/** True when `iso` falls on a calendar day before today in restaurant local time. */
function isBeforeRestaurantToday(iso: string): boolean {
  const dateKey = restaurantCalendarDateKey(iso);
  const todayKey = restaurantCalendarDateKey();
  return dateKey.length > 0 && dateKey < todayKey;
}

/**
 * Auto-complete seated/checked-in bookings from prior business days so tables
 * do not stay "Đã ngồi" when staff forget Hoàn thành.
 */
async function autoCompleteStaleSeatedBookings(
  client: ReturnType<typeof ensureClient>
): Promise<number> {
  const { data: rows, error } = await client
    .from("bookings")
    .select("id, booking_at, checked_in_at")
    .in("status", ["seated", "checked_in"])
    .not("table_id", "is", null);
  if (error || !rows?.length) {
    return 0;
  }

  const staleIds = (rows as { id: string; booking_at: string; checked_in_at: string | null }[])
    .filter((row) => {
      if (isBeforeRestaurantToday(row.booking_at)) {
        return true;
      }
      return row.checked_in_at ? isBeforeRestaurantToday(row.checked_in_at) : false;
    })
    .map((row) => row.id);

  let completed = 0;
  for (const bookingId of staleIds) {
    try {
      await updateBookingStatusInSupabase(bookingId, "completed");
      completed += 1;
    } catch {
      // Keep processing other tables; maintenance will retry on the next run.
    }
  }
  return completed;
}

async function refreshTablesTouchedByRecentNoShows(
  client: ReturnType<typeof ensureClient>,
  sinceIso: string
): Promise<void> {
  const { data: rows, error } = await client
    .from("bookings")
    .select("table_id")
    .eq("status", "no_show")
    .gte("no_show_marked_at", sinceIso)
    .not("table_id", "is", null);
  if (error || !rows?.length) {
    return;
  }
  const ids = [...new Set((rows as { table_id: string }[]).map((r) => r.table_id).filter(Boolean))];
  await Promise.all(ids.map((id) => refreshTableAvailabilityForBooking(client, id)));
}

/** Auto-late keeps table_id; refresh so member tables show Trễ on the floor map. */
async function refreshTablesTouchedByRecentLateMarks(
  client: ReturnType<typeof ensureClient>,
  sinceIso: string
): Promise<void> {
  const { data: rows, error } = await client
    .from("bookings")
    .select("table_id, merge_group_id")
    .eq("status", "late")
    .gte("late_marked_at", sinceIso);
  if (error || !rows?.length) {
    return;
  }

  const tableIds = new Set<string>();
  for (const row of rows as { table_id: string | null; merge_group_id: string | null }[]) {
    if (row.table_id) {
      tableIds.add(row.table_id);
    }
    if (row.merge_group_id) {
      for (const memberTableId of await listMergeGroupMemberTableIds(
        client,
        row.merge_group_id
      )) {
        tableIds.add(memberTableId);
      }
    }
  }

  await Promise.all([...tableIds].map((id) => refreshTableAvailabilityForBooking(client, id)));
}

export async function updateBranchInSupabase(
  branchId: string,
  input: { name: string; address: string }
): Promise<Result> {
  const client = ensureClient();
  const { error } = await client
    .from("branches")
    .update({ name: input.name, address: input.address })
    .eq("id", branchId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã cập nhật chi nhánh." };
}

export async function fetchSnapshot(options?: {
  forceMaintenance?: boolean;
}): Promise<AppStateSnapshot> {
  if (!isSupabaseStoreServerConfigured()) {
    return initialState;
  }

  if (options?.forceMaintenance) {
    await maybeRunBookingMaintenance(true);
  }

  const client = ensureClient();
  const usersPromise = listAppUsersServer().then((users) => {
    if (!users) {
      throw new Error("Chưa cấu hình Supabase server (SUPABASE_SERVICE_ROLE_KEY).");
    }
    return users;
  });
  const [
    users,
    branchesResult,
    areasResult,
    tablesResult,
    customersResult,
    bookingsResult,
    notificationsResult,
    mergeGroupsResult,
    mergeMembersResult,
    bookingRuntimeSettings,
  ] = await Promise.all([
    usersPromise,
    fetchAllRows((from, to) => client.from("branches").select("*").range(from, to)),
    fetchAllRows((from, to) => client.from("areas").select("*").range(from, to)),
    fetchAllRows((from, to) => client.from("tables").select("*").range(from, to)),
    fetchAllRows((from, to) => client.from("customers").select("*").range(from, to)),
    fetchAllRows((from, to) => client.from("bookings").select("*").range(from, to)),
    fetchAllRows((from, to) =>
      client
        .from("internal_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      client
        .from("table_merge_groups")
        .select("*")
        .eq("status", "active")
        .order("auto_number", { ascending: true })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      client
        .from("table_merge_members")
        .select("group_id, table_id, order_index")
        .order("order_index", { ascending: true })
        .range(from, to)
    ),
    getBookingRuntimeSettings(client),
  ]);

  const errors = [
    branchesResult.error,
    areasResult.error,
    tablesResult.error,
    customersResult.error,
    bookingsResult.error,
    notificationsResult.error,
    mergeGroupsResult.error,
    mergeMembersResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]?.message ?? "Không thể tải dữ liệu Supabase.");
  }

  const bookings: AppStateSnapshot["bookings"] =
    ((bookingsResult.data ?? []) as any[]).map((item) => ({
      id: item.id,
      customerId: item.customer_id,
      branchId: item.branch_id,
      areaId: item.area_id,
      tableId: item.table_id,
      mergeGroupId: item.merge_group_id ?? null,
      guestCount: item.guest_count,
      bookingAt: item.booking_at,
      startTime: item.start_time ?? item.booking_at,
      endTime:
        item.end_time ??
        dayjs(item.start_time ?? item.booking_at)
          .add(DEFAULT_BOOKING_RUNTIME_SETTINGS.standardTurnaroundMinutes, "minute")
          .toISOString(),
      checkedInAt: item.checked_in_at ?? undefined,
      noShowMarkedAt: item.no_show_marked_at ?? undefined,
      lateMarkedAt: item.late_marked_at ?? undefined,
      note: item.note ?? undefined,
      createdAt: item.created_at ?? item.start_time ?? item.booking_at,
      createdByUserId: item.created_by_user_id,
      lastEditedAt: item.last_edited_at ?? undefined,
      lastEditedByUserId: item.last_edited_by_user_id ?? undefined,
      status: item.status as BookingStatus,
    }));

  const mergeGroupRows = (mergeGroupsResult.data ?? []) as Array<{
    id: string;
    branch_id: string;
    area_id: string;
    auto_number: number | null;
    merged_name: string;
    status: string;
    created_at: string;
    released_at: string | null;
  }>;
  const mergeMemberRows = (mergeMembersResult.data ?? []) as Array<{
    group_id: string;
    table_id: string;
    order_index: number;
  }>;
  const membersByGroup = new Map<string, string[]>();
  for (const member of mergeMemberRows) {
    const bucket = membersByGroup.get(member.group_id) ?? [];
    bucket.push(member.table_id);
    membersByGroup.set(member.group_id, bucket);
  }
  const mergeGroups: TableMergeGroup[] = mergeGroupRows.map((row) =>
    mapTableMergeGroupFromRow(row as TableMergeGroupRowLike, membersByGroup.get(row.id) ?? [])
  );

  const tablesRowList = tablesResult.data ?? [];

  return {
    users,
    branches:
      branchesResult.data?.map((item) => ({
        id: item.id,
        name: item.name,
        address: item.address,
      })) ?? [],
    areas:
      areasResult.data?.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        name: item.name,
        floorGridColumns:
          typeof item.floor_grid_columns === "number" ? item.floor_grid_columns : 12,
        floorGridRows: typeof item.floor_grid_rows === "number" ? item.floor_grid_rows : 8,
        floorNodeSpacing:
          typeof item.floor_node_spacing === "number"
            ? item.floor_node_spacing
            : FLOOR_DEFAULT_NODE_SPACING_PX,
      })) ?? [],
    tables: tablesRowList.map((item) => mapDiningTableFromRow(item)) ?? [],
    customers:
      customersResult.data?.map((item) => ({
        id: item.id,
        fullName: item.full_name,
        phone: item.phone,
        note: item.note ?? undefined,
        createdAt: item.created_at ?? undefined,
        updatedAt: item.updated_at ?? undefined,
      })) ?? [],
    bookings,
    mergeGroups,
    notifications:
      notificationsResult.data?.map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        createdAt: item.created_at,
        isRead: item.is_read,
        branchId: item.branch_id ?? undefined,
      })) ?? [],
    bookingRuntimeSettings,
    activeBranchId:
      branchesResult.data?.[0]?.id ?? initialState.activeBranchId ?? undefined,
  };
}

/**
 * Structural floor data (tables/areas/merge groups) for the given branches.
 * Day-scoped bookings are loaded via `fetchFloorMapDayBookingsInSupabase`.
 */
export async function fetchFloorMapSliceInSupabase(
  branchIds: readonly string[]
): Promise<FloorMapStateSlice> {
  if (!isSupabaseStoreServerConfigured()) {
    return {
      areas: [],
      tables: [],
      mergeGroups: [],
    };
  }

  const client = ensureClient();
  const scopedBranches = branchIds.filter((id) => id.length > 0);

  let tablesQuery = client.from("tables").select("*");
  let areasQuery = client.from("areas").select("*");
  let mergeGroupsQuery = client
    .from("table_merge_groups")
    .select("*")
    .eq("status", "active")
    .order("auto_number", { ascending: true });

  if (scopedBranches.length > 0) {
    tablesQuery = tablesQuery.in("branch_id", scopedBranches);
    areasQuery = areasQuery.in("branch_id", scopedBranches);
    mergeGroupsQuery = mergeGroupsQuery.in("branch_id", scopedBranches);
  }

  const [tablesResult, areasResult, mergeGroupsResult] = await Promise.all([
    tablesQuery,
    areasQuery,
    mergeGroupsQuery,
  ]);

  const errors = [tablesResult.error, areasResult.error, mergeGroupsResult.error].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]?.message ?? "Không thể tải dữ liệu sơ đồ.");
  }

  const mergeGroupRows = (mergeGroupsResult.data ?? []) as Array<{
    id: string;
    branch_id: string;
    area_id: string;
    auto_number: number | null;
    merged_name: string;
    status: string;
    created_at: string;
    released_at: string | null;
  }>;
  const groupIds = mergeGroupRows.map((row) => row.id);
  let mergeMemberRows: Array<{ group_id: string; table_id: string; order_index: number }> = [];
  if (groupIds.length > 0) {
    const mergeMembersResult = await client
      .from("table_merge_members")
      .select("group_id, table_id, order_index")
      .in("group_id", groupIds)
      .order("order_index", { ascending: true });
    if (mergeMembersResult.error) {
      throw new Error(mergeMembersResult.error.message);
    }
    mergeMemberRows = (mergeMembersResult.data ?? []) as typeof mergeMemberRows;
  }

  const membersByGroup = new Map<string, string[]>();
  for (const member of mergeMemberRows) {
    const bucket = membersByGroup.get(member.group_id) ?? [];
    bucket.push(member.table_id);
    membersByGroup.set(member.group_id, bucket);
  }
  const mergeGroups: TableMergeGroup[] = mergeGroupRows.map((row) =>
    mapTableMergeGroupFromRow(row as TableMergeGroupRowLike, membersByGroup.get(row.id) ?? [])
  );

  const tablesRowList = tablesResult.data ?? [];

  return {
    areas:
      areasResult.data?.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        name: item.name,
        floorGridColumns:
          typeof item.floor_grid_columns === "number" ? item.floor_grid_columns : 12,
        floorGridRows: typeof item.floor_grid_rows === "number" ? item.floor_grid_rows : 8,
        floorNodeSpacing:
          typeof item.floor_node_spacing === "number"
            ? item.floor_node_spacing
            : FLOOR_DEFAULT_NODE_SPACING_PX,
      })) ?? [],
    tables: tablesRowList.map((item) => mapDiningTableFromRow(item)) ?? [],
    mergeGroups,
  };
}

function mapBookingRowFromSupabase(item: Record<string, unknown>): Booking {
  return {
    id: item.id as string,
    customerId: item.customer_id as string,
    branchId: item.branch_id as string,
    areaId: item.area_id as string | null,
    tableId: item.table_id as string | null,
    mergeGroupId: (item.merge_group_id as string | null | undefined) ?? null,
    guestCount: item.guest_count as number,
    bookingAt: item.booking_at as string,
    startTime: (item.start_time as string | null) ?? (item.booking_at as string),
    endTime:
      (item.end_time as string | null) ??
      dayjs((item.start_time as string | null) ?? (item.booking_at as string))
        .add(DEFAULT_BOOKING_RUNTIME_SETTINGS.standardTurnaroundMinutes, "minute")
        .toISOString(),
    checkedInAt: (item.checked_in_at as string | null) ?? undefined,
    noShowMarkedAt: (item.no_show_marked_at as string | null) ?? undefined,
    lateMarkedAt: (item.late_marked_at as string | null) ?? undefined,
    note: (item.note as string | null) ?? undefined,
    createdAt:
      (item.created_at as string | null | undefined) ??
      (item.start_time as string | null) ??
      (item.booking_at as string),
    createdByUserId: item.created_by_user_id as string,
    lastEditedAt: (item.last_edited_at as string | null) ?? undefined,
    lastEditedByUserId: (item.last_edited_by_user_id as string | null) ?? undefined,
    status: item.status as BookingStatus,
  };
}

/** Bookings (+ referenced customers) for a single floor-map calendar day. */
export async function fetchFloorMapDayBookingsInSupabase(
  branchIds: readonly string[],
  layoutDate: string
): Promise<{ bookings: Booking[]; customers: Customer[] }> {
  if (!isSupabaseStoreServerConfigured()) {
    return { bookings: [], customers: [] };
  }

  const client = ensureClient();
  const scopedBranches = branchIds.filter((id) => id.length > 0);
  const { startIso, endIso } = layoutDateRangeIso(layoutDate);

  let bookingsQuery = client
    .from("bookings")
    .select("*")
    .gte("booking_at", startIso)
    .lte("booking_at", endIso);

  if (scopedBranches.length > 0) {
    bookingsQuery = bookingsQuery.in("branch_id", scopedBranches);
  }

  const bookingsResult = await bookingsQuery;
  if (bookingsResult.error) {
    throw new Error(bookingsResult.error.message ?? "Không thể tải booking theo ngày.");
  }

  const bookings = ((bookingsResult.data ?? []) as Record<string, unknown>[]).map(
    mapBookingRowFromSupabase
  );

  const customerIds = [...new Set(bookings.map((booking) => booking.customerId))];
  let customers: Customer[] = [];
  if (customerIds.length > 0) {
    const customersResult = await client.from("customers").select("*").in("id", customerIds);
    if (customersResult.error) {
      throw new Error(customersResult.error.message);
    }
    customers =
      customersResult.data?.map((item) => ({
        id: item.id,
        fullName: item.full_name,
        phone: item.phone,
        note: item.note ?? undefined,
        createdAt: item.created_at ?? undefined,
        updatedAt: item.updated_at ?? undefined,
      })) ?? [];
  }

  return { bookings, customers };
}

export async function createBookingInSupabase(input: CreateBookingInput): Promise<Result> {
  const client = ensureClient();
  const runtimeSettings = await getBookingRuntimeSettings(client);
  const normalizedAt = dayjs(input.bookingAt).toISOString();
  const slotEnd = dayjs(normalizedAt)
    .add(runtimeSettings.standardTurnaroundMinutes, "minute")
    .toISOString();
  const normalizedGuestCount =
    typeof input.guestCount === "number" && Number.isFinite(input.guestCount)
      ? Math.max(1, Math.round(input.guestCount))
      : 1;
  const guestCountSpecified =
    typeof input.guestCount === "number" && Number.isFinite(input.guestCount);
  const bookingNote = buildBookingNoteForStorage({
    note: input.note,
    guestCountSpecified,
    guestType: input.guestType,
  });
  const hasAssignedTable = Boolean(input.areaId && input.tableId);
  const hasAssignedMergeGroup = Boolean(input.mergeGroupId);

  const customerResult = await upsertCustomerForBooking(client, {
    customerName: input.customerName,
    customerPhone: input.customerPhone,
  });
  if ("error" in customerResult) {
    return { ok: false, message: customerResult.error };
  }
  const customerId = customerResult.customerId;

  if (!input.allowDuplicate) {
    const duplicates = await findBookingDuplicatesByPhoneSlotInSupabase(client, {
      branchId: input.branchId,
      customerPhone: input.customerPhone,
      customerName: input.customerName,
      bookingAt: normalizedAt,
      tableId: input.tableId ?? null,
    });
    if (duplicates.length > 0) {
      return duplicateBookingResult(duplicates, normalizedAt);
    }
  }

  if (hasAssignedMergeGroup) {
    const groupCheck = await assertMergeGroupBookingAllowed(client, {
      mergeGroupId: input.mergeGroupId!,
      branchId: input.branchId,
      areaId: input.areaId ?? null,
      guestCount: normalizedGuestCount,
      bookingAt: normalizedAt,
    });
    if (!groupCheck.ok) {
      return { ok: false, message: groupCheck.message };
    }

    const mergeSlotConflict = await findMergeGroupSlotConflictsInSupabase(client, {
      bookingId: "__new__",
      mergeGroupId: input.mergeGroupId!,
      memberTableIds: groupCheck.memberTableIds,
      startTime: normalizedAt,
      endTime: slotEnd,
    });
    if (mergeSlotConflict) {
      return {
        ok: false,
        message: messageFromTableSlotConflictRows(mergeSlotConflict.conflicts, {
          tableName: mergeSlotConflict.tableName ?? groupCheck.mergedName,
          candidateBookingAt: normalizedAt,
          fallbackMessage: "Khung giờ trùng với booking khác trên cụm bàn gộp.",
        }),
      };
    }

    const { data: createData, error: createError } = await (client as any).rpc(
      "create_or_queue_booking",
      {
        p_customer_id: customerId,
        p_branch_id: input.branchId,
        p_area_id: groupCheck.areaId,
        p_table_id: groupCheck.fallbackTableId,
        p_guest_count: normalizedGuestCount,
        p_start_time: normalizedAt,
        p_end_time: slotEnd,
        p_note: bookingNote,
        p_created_by_user_id: input.createdByUserId,
        p_merge_group_id: input.mergeGroupId,
      }
    );
    if (createError) {
      return { ok: false, message: createError.message };
    }
    const mergeParsed = parseConfirmedBookingRpcOutcome(
      createData,
      "Không nhận được phản hồi khi tạo booking cụm bàn gộp."
    );
    if (!mergeParsed.ok) {
      return { ok: false, message: mergeParsed.message };
    }
    const mergeOutcome = mergeParsed.result;

    try {
      await seatBookingForImmediateArrival(client, {
        bookingId: mergeOutcome.booking_id,
        tableId: groupCheck.fallbackTableId,
        bookingAtIso: normalizedAt,
        arrivalIntent: input.arrivalIntent,
      });
      if (shouldRefreshTableHoldAfterCreate(normalizedAt, input.arrivalIntent)) {
        const { data: tableRow } = await client
          .from("tables")
          .select("status")
          .eq("id", groupCheck.fallbackTableId)
          .maybeSingle();
        if ((tableRow?.status as TableStatus | undefined) !== "locked") {
          await refreshTableAvailabilityForBooking(client, groupCheck.fallbackTableId);
        }
      }
    } catch (seatErr) {
      return {
        ok: false,
        message: seatErr instanceof Error ? seatErr.message : "Không check-in được booking.",
      };
    }

    await client.from("internal_notifications").insert({
      title: "Đặt bàn mới",
      message: `Đã xác nhận booking cho ${input.customerName} trên cụm ${groupCheck.mergedName} lúc ${dayjs(
        normalizedAt
      ).format("HH:mm DD/MM/YYYY")}.`,
      created_at: dayjs().toISOString(),
      is_read: false,
      branch_id: input.branchId,
    });

    return {
      ok: true,
      message: `Đã tạo booking trên cụm ${groupCheck.mergedName}.`,
      bookingId: mergeOutcome.booking_id,
    };
  }

  if (hasAssignedTable) {
    const { data: tableInfo, error: tableInfoError } = await client
      .from("tables")
      .select("branch_id, name")
      .eq("id", input.tableId!)
      .maybeSingle();
    if (tableInfoError || !tableInfo) {
      return {
        ok: false,
        message: tableInfoError?.message ?? "Không tìm thấy bàn.",
      };
    }
    if (tableInfo.branch_id !== input.branchId) {
      return { ok: false, message: "Bàn không thuộc cùng chi nhánh với booking." };
    }

    const tableConflicts = await findTableBookingSlotConflictsInSupabase(client, {
      bookingId: "__new__",
      tableId: input.tableId!,
      startTime: normalizedAt,
      endTime: slotEnd,
    });
    if (tableConflicts.length > 0) {
      return {
        ok: false,
        message: messageFromTableSlotConflictRows(tableConflicts, {
          tableName: tableInfo.name,
          candidateBookingAt: normalizedAt,
          fallbackMessage: "Khung giờ trùng với booking khác trên bàn này.",
        }),
      };
    }

    const { data: createData, error: createError } = await (client as any).rpc(
      "create_or_queue_booking",
      {
        p_customer_id: customerId,
        p_branch_id: input.branchId,
        p_area_id: input.areaId!,
        p_table_id: input.tableId!,
        p_guest_count: normalizedGuestCount,
        p_start_time: normalizedAt,
        p_end_time: slotEnd,
        p_note: bookingNote,
        p_created_by_user_id: input.createdByUserId,
      }
    );
    if (createError) {
      return { ok: false, message: createError.message };
    }

    const tableParsed = parseConfirmedBookingRpcOutcome(
      createData,
      "Không nhận được phản hồi từ hệ thống đặt bàn."
    );
    if (!tableParsed.ok) {
      return { ok: false, message: tableParsed.message };
    }
    const normalizedOutcome = tableParsed.result;

    try {
      await seatBookingForImmediateArrival(client, {
        bookingId: normalizedOutcome.booking_id,
        tableId: input.tableId!,
        bookingAtIso: normalizedAt,
        arrivalIntent: input.arrivalIntent,
      });
      if (shouldRefreshTableHoldAfterCreate(normalizedAt, input.arrivalIntent)) {
        const { data: tableRow } = await client
          .from("tables")
          .select("status")
          .eq("id", input.tableId!)
          .maybeSingle();
        if ((tableRow?.status as TableStatus | undefined) !== "locked") {
          await refreshTableAvailabilityForBooking(client, input.tableId!);
        }
      }
    } catch (seatErr) {
      return {
        ok: false,
        message: seatErr instanceof Error ? seatErr.message : "Không check-in được booking.",
      };
    }

    await client.from("internal_notifications").insert({
      title: "Đặt bàn mới",
      message: `Đã xác nhận booking cho ${input.customerName} lúc ${dayjs(normalizedAt).format(
        "HH:mm DD/MM/YYYY"
      )}.`,
      created_at: dayjs().toISOString(),
      is_read: false,
      branch_id: input.branchId,
    });

    return {
      ok: true,
      message: "Đã tạo booking thành công.",
      bookingId: normalizedOutcome.booking_id,
    };
  }

  const { data: insertedBooking, error: bookingError } = await (client as any)
    .from("bookings")
    .insert({
    customer_id: customerId,
    branch_id: input.branchId,
    area_id: input.areaId ?? null,
    table_id: input.tableId ?? null,
    guest_count: normalizedGuestCount,
    booking_at: normalizedAt,
    start_time: normalizedAt,
    end_time: slotEnd,
    note: bookingNote,
    created_by_user_id: input.createdByUserId,
    status: "pending",
    checked_in_at: null,
    no_show_marked_at: null,
  })
    .select("id")
    .single();
  if (bookingError) {
    return { ok: false, message: bookingError.message };
  }

  await client.from("internal_notifications").insert({
    title: "Đặt bàn mới",
    message: `Đã tạo booking cho ${input.customerName} lúc ${dayjs(normalizedAt).format(
      "HH:mm DD/MM/YYYY"
    )}.`,
    created_at: dayjs().toISOString(),
    is_read: false,
    branch_id: input.branchId,
  });

  return {
    ok: true,
    message: "Đã tạo booking thành công.",
    bookingId: insertedBooking.id as string,
  };
}

export async function assignBookingToTableInSupabase(input: {
  bookingId: string;
  areaId: string;
  tableId?: string | null;
  /** When set, assign the booking to a merge group instead of a single table. */
  mergeGroupId?: string | null;
  guestCount?: number;
}): Promise<Result> {
  const client = ensureClient();
  const { bookingId, areaId, tableId, mergeGroupId, guestCount } = input;
  const { data: booking, error: bookingErr } = await (client as any)
    .from("bookings")
    .select("id, branch_id, guest_count, booking_at, start_time, end_time, status, note, customer_id, created_by_user_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingErr || !booking) {
    return { ok: false, message: bookingErr?.message ?? "Không tìm thấy booking." };
  }
  if (!ASSIGN_QUEUE_BOOKING_STATUSES.includes(booking.status as BookingStatus)) {
    return { ok: false, message: "Chỉ gán bàn cho booking đang chờ xếp bàn, chờ, hoặc trễ." };
  }

  const nextGuestCount =
    typeof guestCount === "number" && Number.isFinite(guestCount)
      ? Math.max(1, Math.round(guestCount))
      : booking.guest_count;
  const runtimeSettings = await getBookingRuntimeSettings(client);
  const normalizedStart = dayjs(booking.start_time ?? booking.booking_at).toISOString();
  const normalizedEnd = dayjs(
    booking.end_time ??
      dayjs(normalizedStart).add(runtimeSettings.standardTurnaroundMinutes, "minute").toISOString()
  ).toISOString();

  if (mergeGroupId) {
    const groupCheck = await assertMergeGroupBookingAllowed(client, {
      mergeGroupId,
      branchId: booking.branch_id,
      areaId,
      guestCount: nextGuestCount,
      bookingAt: booking.booking_at,
    });
    if (!groupCheck.ok) {
      return { ok: false, message: groupCheck.message };
    }

    const mergeSlotConflict = await findMergeGroupSlotConflictsInSupabase(client, {
      bookingId,
      mergeGroupId,
      memberTableIds: groupCheck.memberTableIds,
      startTime: normalizedStart,
      endTime: normalizedEnd,
    });
    if (mergeSlotConflict) {
      return {
        ok: false,
        message: messageFromTableSlotConflictRows(mergeSlotConflict.conflicts, {
          tableName: mergeSlotConflict.tableName ?? groupCheck.mergedName,
          candidateBookingAt: normalizedStart,
          fallbackMessage: "Khung giờ trùng với booking khác trên cụm bàn gộp.",
        }),
      };
    }

    const { data: assignData, error: assignErr } = await (client as any).rpc(
      "assign_or_queue_pending_booking",
      {
        p_booking_id: bookingId,
        p_table_id: groupCheck.fallbackTableId,
        p_area_id: groupCheck.areaId,
        p_guest_count: nextGuestCount,
        p_start_time: normalizedStart,
        p_end_time: normalizedEnd,
        p_merge_group_id: mergeGroupId,
      }
    );
    if (assignErr) {
      return { ok: false, message: assignErr.message };
    }
    const mergeAssignParsed = parseConfirmedBookingRpcOutcome(
      assignData,
      "Không nhận được phản hồi khi gán cụm bàn gộp."
    );
    if (!mergeAssignParsed.ok) {
      return { ok: false, message: mergeAssignParsed.message };
    }

    try {
      await seatBookingForImmediateArrival(client, {
        bookingId,
        tableId: groupCheck.fallbackTableId,
        bookingAtIso: normalizedStart,
      });
      if (!isImmediateBookingArrival(normalizedStart)) {
        const { data: tableRow } = await client
          .from("tables")
          .select("status")
          .eq("id", groupCheck.fallbackTableId)
          .maybeSingle();
        if ((tableRow?.status as TableStatus | undefined) !== "locked") {
          await refreshTableAvailabilityForBooking(client, groupCheck.fallbackTableId);
        }
      }
    } catch (seatErr) {
      return {
        ok: false,
        message: seatErr instanceof Error ? seatErr.message : "Không check-in được booking.",
      };
    }

    return { ok: true, message: `Đã gán booking vào cụm ${groupCheck.mergedName}.` };
  }

  if (!tableId) {
    return { ok: false, message: "Vui lòng chọn bàn hoặc cụm bàn gộp." };
  }

  const { data: table, error: tableErr } = await client
    .from("tables")
    .select("id, branch_id, status, name")
    .eq("id", tableId)
    .maybeSingle();
  if (tableErr || !table) {
    return { ok: false, message: tableErr?.message ?? "Không tìm thấy bàn." };
  }
  if (table.branch_id !== booking.branch_id) {
    return { ok: false, message: "Bàn không thuộc cùng chi nhánh với booking." };
  }

  const tableConflicts = await findTableBookingSlotConflictsInSupabase(client, {
    bookingId,
    tableId,
    startTime: normalizedStart,
    endTime: normalizedEnd,
  });
  if (tableConflicts.length > 0) {
    return {
      ok: false,
      message: messageFromTableSlotConflictRows(tableConflicts, {
        tableName: table.name,
        candidateBookingAt: normalizedStart,
        fallbackMessage: "Khung giờ trùng với booking khác trên bàn này.",
      }),
    };
  }

  const { data: assignData, error: assignErr } = await (client as any).rpc(
    "assign_or_queue_pending_booking",
    {
      p_booking_id: bookingId,
      p_table_id: tableId,
      p_area_id: areaId,
      p_guest_count: nextGuestCount,
      p_start_time: normalizedStart,
      p_end_time: normalizedEnd,
    }
  );
  if (assignErr) {
    return { ok: false, message: assignErr.message };
  }

  const assignParsed = parseConfirmedBookingRpcOutcome(
    assignData,
    "Không nhận được phản hồi khi gán bàn."
  );
  if (!assignParsed.ok) {
    return { ok: false, message: assignParsed.message };
  }

  const guestCountWasProvided = typeof guestCount === "number" && Number.isFinite(guestCount);
  if (guestCountWasProvided) {
    const { error: guestUpdateErr } = await (client as any)
      .from("bookings")
      .update({
        guest_count: nextGuestCount,
        note: stripUnknownGuestTag(booking.note) ?? null,
      })
      .eq("id", bookingId);
    if (guestUpdateErr) {
      return { ok: false, message: guestUpdateErr.message };
    }
  }

  try {
    await seatBookingForImmediateArrival(client, {
      bookingId,
      tableId,
      bookingAtIso: normalizedStart,
    });
    if (!isImmediateBookingArrival(normalizedStart)) {
      const { data: tableRow } = await client
        .from("tables")
        .select("status")
        .eq("id", tableId)
        .maybeSingle();
      if ((tableRow?.status as TableStatus | undefined) !== "locked") {
        await refreshTableAvailabilityForBooking(client, tableId);
      }
    }
  } catch (seatErr) {
    return {
      ok: false,
      message: seatErr instanceof Error ? seatErr.message : "Không check-in được booking.",
    };
  }
  return { ok: true, message: "Đã gán bàn cho booking." };
}

export async function updateBookingGuestCountInSupabase(
  bookingId: string,
  guestCount: number
): Promise<Result> {
  const client = ensureClient();
  const normalized = Math.max(1, Math.round(guestCount));
  const { data: booking, error: loadErr } = await (client as any)
    .from("bookings")
    .select("id, status, note")
    .eq("id", bookingId)
    .maybeSingle();
  if (loadErr || !booking) {
    return { ok: false, message: loadErr?.message ?? "Không tìm thấy booking." };
  }
  const st = booking.status as BookingStatus;
  if (st !== "pending" && st !== "confirmed") {
    return {
      ok: false,
      message: "Chỉ chỉnh số khách khi booking chờ xếp bàn hoặc đã xác nhận.",
    };
  }
  const clearedNote =
    stripUnknownGuestTag(booking.note as string | undefined) ?? null;
  const { error } = await (client as any)
    .from("bookings")
    .update({
      guest_count: normalized,
      note: clearedNote,
    })
    .eq("id", bookingId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã cập nhật số khách." };
}

export async function updateBookingOrderInSupabase(input: {
  bookingId: string;
  bookingAt: string;
  guestCount?: number;
  customerName?: string;
  customerPhone?: string;
  areaId: string | null;
  tableId: string | null;
  /** When set, retarget the booking onto a merge group (clears table_id). */
  mergeGroupId?: string | null;
  editedByUserId: string;
  allowDuplicate?: boolean;
}): Promise<Result> {
  const client = ensureClient();
  const { data: booking, error: loadErr } = await (client as any)
    .from("bookings")
    .select(
      "id, status, note, branch_id, area_id, table_id, merge_group_id, guest_count, customer_id, booking_at, start_time, end_time"
    )
    .eq("id", input.bookingId)
    .maybeSingle();
  if (loadErr || !booking) {
    return { ok: false, message: loadErr?.message ?? "Không tìm thấy booking." };
  }
  const status = booking.status as BookingStatus;
  const editorUser = await getAppUserServer(input.editedByUserId);
  if (!editorUser) {
    return { ok: false, message: "Không xác định được tài khoản chỉnh sửa." };
  }
  const editorRole = editorUser.role;
  const editorBranchIds = editorUser.branchIds;
  if (
    editorRole === "manager" &&
    !editorBranchIds.includes(booking.branch_id)
  ) {
    return { ok: false, message: "Manager chỉ được sửa booking thuộc chi nhánh của mình." };
  }
  if (status !== "pending" && status !== "confirmed") {
    return {
      ok: false,
      message:
        "Chỉ chỉnh giờ, tên khách, số khách, SĐT và khu/bàn khi booking chờ xếp bàn hoặc đã xác nhận.",
    };
  }

  const nextAreaId = input.areaId;
  const nextTableId = input.tableId;
  const nextMergeGroupId = input.mergeGroupId ?? null;
  const hasNextTarget = Boolean(nextTableId) || Boolean(nextMergeGroupId);
  if (Boolean(nextAreaId) !== hasNextTarget) {
    return {
      ok: false,
      message: "Vui lòng chọn cả khu vực và bàn (hoặc cụm bàn gộp), hoặc để trống để chờ xếp bàn.",
    };
  }
  if (nextTableId && nextMergeGroupId) {
    return {
      ok: false,
      message: "Chỉ chọn một trong hai: bàn lẻ hoặc cụm bàn gộp.",
    };
  }

  const { data: customerRow, error: customerLoadErr } = await client
    .from("customers")
    .select("phone, full_name")
    .eq("id", booking.customer_id)
    .maybeSingle();
  if (customerLoadErr || !customerRow) {
    return { ok: false, message: customerLoadErr?.message ?? "Không tìm thấy khách hàng." };
  }
  const existingPhone = customerRow.phone as string | null;
  let customerNameForDuplicate = (customerRow.full_name as string) ?? "";

  if (input.customerName !== undefined) {
    const trimmedName = input.customerName.trim();
    if (!trimmedName) {
      return { ok: false, message: "Tên khách không được để trống." };
    }
    if (trimmedName !== customerNameForDuplicate) {
      const { error: nameUpdateErr } = await client
        .from("customers")
        .update({ full_name: trimmedName })
        .eq("id", booking.customer_id);
      if (nameUpdateErr) {
        return { ok: false, message: nameUpdateErr.message };
      }
      customerNameForDuplicate = trimmedName;
    }
  }

  if (input.customerPhone !== undefined) {
    const trimmed = input.customerPhone.trim();
    if (trimmed.length > 0) {
      const normalizedPhone = normalizeVietnamPhone(trimmed);
      if (!isPlausibleVietnamPhone(normalizedPhone)) {
        return {
          ok: false,
          message:
            "Số điện thoại không đúng định dạng Việt Nam (ví dụ 0912345678, +84912345678).",
        };
      }
      if (normalizedPhone !== (existingPhone ?? "")) {
        const { data: phoneOwner, error: phoneOwnerErr } = await client
          .from("customers")
          .select("id")
          .eq("phone", normalizedPhone)
          .maybeSingle();
        if (phoneOwnerErr) {
          return { ok: false, message: phoneOwnerErr.message };
        }
        if (phoneOwner && phoneOwner.id !== booking.customer_id) {
          return {
            ok: false,
            message: "Số điện thoại đã được dùng cho khách hàng khác.",
          };
        }
        const { error: phoneUpdateErr } = await client
          .from("customers")
          .update({ phone: normalizedPhone })
          .eq("id", booking.customer_id);
        if (phoneUpdateErr) {
          return { ok: false, message: phoneUpdateErr.message };
        }
      }
    } else if (existingPhone && !isSyntheticPhoneValue(existingPhone)) {
      const { error: phoneClearErr } = await client
        .from("customers")
        .update({ phone: null })
        .eq("id", booking.customer_id);
      if (phoneClearErr) {
        return { ok: false, message: phoneClearErr.message };
      }
    }
  }

  const runtimeSettings = await getBookingRuntimeSettings(client);
  const normalizedAt = dayjs(input.bookingAt).toISOString();
  const slotEnd = dayjs(normalizedAt)
    .add(runtimeSettings.standardTurnaroundMinutes, "minute")
    .toISOString();

  const { data: customerAfterPhone, error: customerAfterErr } = await client
    .from("customers")
    .select("phone")
    .eq("id", booking.customer_id)
    .maybeSingle();
  if (customerAfterErr) {
    return { ok: false, message: customerAfterErr.message };
  }
  const phoneForDuplicate = customerAfterPhone?.phone as string | null | undefined;

  if (!input.allowDuplicate) {
    const duplicates = await findBookingDuplicatesByPhoneSlotInSupabase(client, {
      branchId: booking.branch_id,
      customerPhone:
        phoneForDuplicate && !isSyntheticPhoneValue(phoneForDuplicate)
          ? phoneForDuplicate
          : undefined,
      customerName: customerNameForDuplicate,
      bookingAt: normalizedAt,
      tableId: input.tableId,
      excludeBookingId: input.bookingId,
    });
    if (duplicates.length > 0) {
      return duplicateBookingResult(duplicates, normalizedAt);
    }
  }

  const previousStartIso = dayjs(booking.start_time ?? booking.booking_at).toISOString();
  const timeChanged = previousStartIso !== normalizedAt;
  const assignmentChanged =
    (booking.area_id ?? null) !== nextAreaId ||
    (booking.table_id ?? null) !== nextTableId ||
    (booking.merge_group_id ?? null) !== nextMergeGroupId;

  const guestCountSpecified =
    typeof input.guestCount === "number" && Number.isFinite(input.guestCount);
  const effectiveGuestCount = guestCountSpecified
    ? Math.max(1, Math.round(input.guestCount!))
    : Math.max(1, Math.round(booking.guest_count));

  let mergeGroupContext: MergeGroupAssignContext | null = null;
  if (nextMergeGroupId) {
    mergeGroupContext = await assertMergeGroupBookingAllowed(client, {
      mergeGroupId: nextMergeGroupId,
      branchId: booking.branch_id,
      areaId: nextAreaId,
      guestCount: effectiveGuestCount,
      bookingAt: input.bookingAt ?? booking.booking_at,
    });
    if (!mergeGroupContext.ok) {
      return { ok: false, message: mergeGroupContext.message };
    }
  }

  if (nextTableId) {
    const { data: table, error: tableErr } = await client
      .from("tables")
      .select("id, branch_id, area_id, status, name")
      .eq("id", nextTableId)
      .maybeSingle();
    if (tableErr || !table) {
      return { ok: false, message: tableErr?.message ?? "Không tìm thấy bàn." };
    }
    if (table.branch_id !== booking.branch_id) {
      return { ok: false, message: "Bàn không thuộc cùng chi nhánh với booking." };
    }
    if (table.area_id !== nextAreaId) {
      return { ok: false, message: "Bàn không thuộc khu vực đã chọn." };
    }
    if ((table.status as TableStatus) === "locked") {
      return { ok: false, message: "Bàn đang khóa, không thể gán booking." };
    }

    if (timeChanged || assignmentChanged) {
      const tableConflicts = await findTableBookingSlotConflictsInSupabase(client, {
        bookingId: input.bookingId,
        tableId: nextTableId,
        startTime: normalizedAt,
        endTime: slotEnd,
      });
      if (tableConflicts.length > 0) {
        return {
          ok: false,
          message: messageFromTableSlotConflictRows(tableConflicts, {
            tableName: table.name,
            candidateBookingAt: normalizedAt,
            fallbackMessage: "Khung giờ mới trùng với booking khác trên cùng bàn.",
          }),
        };
      }
    }
  }

  const lastEditedPatch = {
    last_edited_at: dayjs().toISOString(),
    last_edited_by_user_id: input.editedByUserId,
  };

  const refreshTableIds = new Set<string>();
  if (booking.table_id) {
    refreshTableIds.add(booking.table_id);
  }
  if (nextTableId) {
    refreshTableIds.add(nextTableId);
  }

  if (status === "pending" && mergeGroupContext && mergeGroupContext.ok && nextAreaId) {
    const { data: assignData, error: assignErr } = await (client as any).rpc(
      "assign_or_queue_pending_booking",
      {
        p_booking_id: input.bookingId,
        p_table_id: mergeGroupContext.fallbackTableId,
        p_area_id: mergeGroupContext.areaId,
        p_guest_count: effectiveGuestCount,
        p_start_time: normalizedAt,
        p_end_time: slotEnd,
        p_merge_group_id: nextMergeGroupId,
      }
    );
    if (assignErr) {
      return { ok: false, message: assignErr.message };
    }
    const mergeOrderAssignParsed = parseConfirmedBookingRpcOutcome(
      assignData,
      "Không nhận được phản hồi khi gán cụm bàn gộp."
    );
    if (!mergeOrderAssignParsed.ok) {
      return { ok: false, message: mergeOrderAssignParsed.message };
    }

    const clearedNote = guestCountSpecified
      ? stripUnknownGuestTag(booking.note as string | undefined) ?? null
      : undefined;
    const { error: metaErr } = await (client as any)
      .from("bookings")
      .update({
        ...lastEditedPatch,
        ...(clearedNote !== undefined ? { note: clearedNote } : {}),
      })
      .eq("id", input.bookingId);
    if (metaErr) {
      return { ok: false, message: metaErr.message };
    }

    return {
      ok: true,
      message: `Đã cập nhật booking và gán vào cụm ${mergeGroupContext.mergedName}.`,
    };
  }

  if (status === "pending" && nextTableId && nextAreaId) {
    const { data: assignData, error: assignErr } = await (client as any).rpc(
      "assign_or_queue_pending_booking",
      {
        p_booking_id: input.bookingId,
        p_table_id: nextTableId,
        p_area_id: nextAreaId,
        p_guest_count: effectiveGuestCount,
        p_start_time: normalizedAt,
        p_end_time: slotEnd,
      }
    );
    if (assignErr) {
      return { ok: false, message: assignErr.message };
    }

    const outcome = Array.isArray(assignData) ? assignData[0] : assignData;
    if (!outcome || typeof outcome !== "object") {
      return { ok: false, message: "Không nhận được phản hồi khi gán bàn." };
    }

    const clearedNote =
      guestCountSpecified
        ? stripUnknownGuestTag(booking.note as string | undefined) ?? null
        : undefined;
    const { error: metaErr } = await (client as any)
      .from("bookings")
      .update({
        ...lastEditedPatch,
        ...(clearedNote !== undefined ? { note: clearedNote } : {}),
      })
      .eq("id", input.bookingId);
    if (metaErr) {
      return { ok: false, message: metaErr.message };
    }

    for (const tableId of refreshTableIds) {
      const { data: tableRow } = await client
        .from("tables")
        .select("status")
        .eq("id", tableId)
        .maybeSingle();
      if ((tableRow?.status as TableStatus | undefined) !== "locked") {
        await refreshTableAvailabilityForBooking(client, tableId);
      }
    }

    const orderAssignParsed = parseConfirmedBookingRpcOutcome(
      outcome,
      "Không nhận được phản hồi khi gán bàn."
    );
    if (!orderAssignParsed.ok) {
      return { ok: false, message: orderAssignParsed.message };
    }
    return { ok: true, message: "Đã cập nhật booking và gán bàn." };
  }

  const updatePayload: Record<string, unknown> = {
    booking_at: normalizedAt,
    start_time: normalizedAt,
    end_time: slotEnd,
    area_id: nextAreaId,
    table_id: nextMergeGroupId ? null : nextTableId,
    merge_group_id: nextMergeGroupId,
    ...lastEditedPatch,
  };

  if (!hasNextTarget) {
    updatePayload.status = "pending";
    updatePayload.checked_in_at = null;
  } else if (status === "pending") {
    updatePayload.status = "confirmed";
    updatePayload.checked_in_at = null;
    updatePayload.no_show_marked_at = null;
  }

  if (guestCountSpecified) {
    updatePayload.guest_count = effectiveGuestCount;
    updatePayload.note = stripUnknownGuestTag(booking.note as string | undefined) ?? null;
  }

  const { error } = await (client as any)
    .from("bookings")
    .update(updatePayload)
    .eq("id", input.bookingId);
  if (error) {
    return { ok: false, message: error.message };
  }

  for (const tableId of refreshTableIds) {
    const { data: tableRow } = await client
      .from("tables")
      .select("status")
      .eq("id", tableId)
      .maybeSingle();
    if ((tableRow?.status as TableStatus | undefined) !== "locked") {
      await refreshTableAvailabilityForBooking(client, tableId);
    }
  }

  return { ok: true, message: "Đã cập nhật booking." };
}

const CHANGE_TABLE_ALLOWED_STATUSES: BookingStatus[] = ["confirmed", "seated", "checked_in"];

async function listMergeGroupMemberTableIds(
  client: ReturnType<typeof ensureClient>,
  mergeGroupId: string
): Promise<string[]> {
  const { data, error } = await (client as any)
    .from("table_merge_members")
    .select("table_id")
    .eq("group_id", mergeGroupId);
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<{ table_id: string }>).map((row) => row.table_id);
}

export async function changeBookingTableInSupabase(input: {
  bookingId: string;
  areaId: string;
  tableId?: string | null;
  mergeGroupId?: string | null;
  editedByUserId: string;
}): Promise<Result> {
  const client = ensureClient();
  const nextTableId = input.tableId ?? null;
  const nextMergeGroupId = input.mergeGroupId ?? null;
  if (nextMergeGroupId) {
    return { ok: false, message: "Không hỗ trợ đổi sang cụm bàn gộp." };
  }
  if (!nextTableId) {
    return { ok: false, message: "Vui lòng chọn bàn đích." };
  }

  const { data: booking, error: loadErr } = await (client as any)
    .from("bookings")
    .select(
      "id, status, branch_id, area_id, table_id, merge_group_id, guest_count, booking_at, start_time, end_time"
    )
    .eq("id", input.bookingId)
    .maybeSingle();
  if (loadErr || !booking) {
    return { ok: false, message: loadErr?.message ?? "Không tìm thấy booking." };
  }

  const status = booking.status as BookingStatus;
  if (!CHANGE_TABLE_ALLOWED_STATUSES.includes(status)) {
    return {
      ok: false,
      message:
        "Chỉ đổi bàn khi booking đã xác nhận, đã check-in hoặc đang ngồi tại bàn.",
    };
  }

  const previousTableId = (booking.table_id as string | null) ?? null;
  const previousMergeGroupId = (booking.merge_group_id as string | null) ?? null;
  if (previousMergeGroupId) {
    return { ok: false, message: "Không hỗ trợ đổi bàn cho booking trên cụm bàn gộp." };
  }
  if (!previousTableId) {
    return { ok: false, message: "Booking chưa được gán bàn — dùng Gán bàn thay vì Đổi bàn." };
  }

  const assignmentUnchanged =
    (booking.area_id ?? null) === input.areaId &&
    previousTableId === nextTableId &&
    previousMergeGroupId === nextMergeGroupId;
  if (assignmentUnchanged) {
    return { ok: false, message: "Bàn đích trùng với bàn hiện tại." };
  }

  const editorUser = await getAppUserServer(input.editedByUserId);
  if (!editorUser) {
    return { ok: false, message: "Không xác định được tài khoản chỉnh sửa." };
  }
  if (
    editorUser.role === "manager" &&
    !editorUser.branchIds.includes(booking.branch_id)
  ) {
    return { ok: false, message: "Manager chỉ được sửa booking thuộc chi nhánh của mình." };
  }

  const effectiveGuestCount = Math.max(1, Math.round(booking.guest_count));
  const normalizedStart = dayjs(booking.start_time ?? booking.booking_at).toISOString();
  const normalizedEnd = dayjs(
    booking.end_time ??
      dayjs(normalizedStart)
        .add((await getBookingRuntimeSettings(client)).standardTurnaroundMinutes, "minute")
        .toISOString()
  ).toISOString();

  let mergeGroupContext: MergeGroupAssignContext | null = null;
  if (nextMergeGroupId) {
    mergeGroupContext = await assertMergeGroupBookingAllowed(client, {
      mergeGroupId: nextMergeGroupId,
      branchId: booking.branch_id,
      areaId: input.areaId,
      guestCount: effectiveGuestCount,
      bookingAt: booking.booking_at,
    });
    if (!mergeGroupContext.ok) {
      return { ok: false, message: mergeGroupContext.message };
    }

    const { data: groupBookings, error: groupBookingsErr } = await (client as any)
      .from("bookings")
      .select("id, booking_at, start_time, end_time, guest_count, customers(full_name)")
      .eq("merge_group_id", nextMergeGroupId)
      .neq("id", input.bookingId)
      .in("status", TABLE_RESERVATION_BOOKING_STATUSES);
    if (groupBookingsErr) {
      return { ok: false, message: groupBookingsErr.message };
    }
    const candidate = {
      bookingAt: normalizedStart,
      startTime: normalizedStart,
      endTime: normalizedEnd,
    };
    const groupConflict = ((groupBookings ?? []) as TableSlotConflictRow[]).find((row) =>
      bookingsTimeSlotsOverlap(candidate, {
        bookingAt: row.booking_at,
        startTime: row.start_time ?? row.booking_at,
        endTime: row.end_time ?? normalizedEnd,
      })
    );
    if (groupConflict) {
      return {
        ok: false,
        message: messageFromTableSlotConflictRows([groupConflict], {
          tableName: mergeGroupContext.mergedName,
          candidateBookingAt: normalizedStart,
          fallbackMessage: "Khung giờ trùng với booking khác trên cụm bàn gộp.",
        }),
      };
    }

    for (const memberTableId of mergeGroupContext.memberTableIds) {
      const memberConflicts = await findTableBookingSlotConflictsInSupabase(client, {
        bookingId: input.bookingId,
        tableId: memberTableId,
        startTime: normalizedStart,
        endTime: normalizedEnd,
      });
      if (memberConflicts.length > 0) {
        const { data: tableRow } = await client
          .from("tables")
          .select("name")
          .eq("id", memberTableId)
          .maybeSingle();
        return {
          ok: false,
          message: messageFromTableSlotConflictRows(memberConflicts, {
            tableName: tableRow?.name ?? "bàn thành viên",
            candidateBookingAt: normalizedStart,
            fallbackMessage: "Khung giờ trùng với booking khác trên bàn trong cụm gộp.",
          }),
        };
      }
    }
  }

  if (nextTableId) {
    const { data: table, error: tableErr } = await client
      .from("tables")
      .select("id, branch_id, area_id, status, name")
      .eq("id", nextTableId)
      .maybeSingle();
    if (tableErr || !table) {
      return { ok: false, message: tableErr?.message ?? "Không tìm thấy bàn." };
    }
    if (table.branch_id !== booking.branch_id) {
      return { ok: false, message: "Bàn không thuộc cùng chi nhánh với booking." };
    }
    if (table.area_id !== input.areaId) {
      return { ok: false, message: "Bàn không thuộc khu vực đã chọn." };
    }
    if ((table.status as TableStatus) === "locked") {
      return { ok: false, message: "Bàn đang khóa, không thể đổi sang bàn này." };
    }

    const tableConflicts = await findTableBookingSlotConflictsInSupabase(client, {
      bookingId: input.bookingId,
      tableId: nextTableId,
      startTime: normalizedStart,
      endTime: normalizedEnd,
    });
    if (tableConflicts.length > 0) {
      return {
        ok: false,
        message: messageFromTableSlotConflictRows(tableConflicts, {
          tableName: table.name,
          candidateBookingAt: normalizedStart,
          fallbackMessage: "Khung giờ trùng với booking khác trên bàn đích.",
        }),
      };
    }
  }

  const refreshTableIds = new Set<string>();
  if (previousTableId) {
    refreshTableIds.add(previousTableId);
  }
  if (nextTableId) {
    refreshTableIds.add(nextTableId);
  }
  if (previousMergeGroupId) {
    for (const tableId of await listMergeGroupMemberTableIds(client, previousMergeGroupId)) {
      refreshTableIds.add(tableId);
    }
  }
  if (mergeGroupContext?.ok) {
    for (const tableId of mergeGroupContext.memberTableIds) {
      refreshTableIds.add(tableId);
    }
  }

  const updatePayload: Record<string, unknown> = {
    area_id: input.areaId,
    table_id: nextMergeGroupId ? mergeGroupContext!.fallbackTableId : nextTableId,
    merge_group_id: nextMergeGroupId,
    last_edited_at: dayjs().toISOString(),
    last_edited_by_user_id: input.editedByUserId,
  };

  const { error } = await (client as any)
    .from("bookings")
    .update(updatePayload)
    .eq("id", input.bookingId);
  if (error) {
    return { ok: false, message: error.message };
  }

  const isSeated = status === "seated" || status === "checked_in";
  await Promise.all(
    [...refreshTableIds].map(async (tableId) => {
      const { data: tableRow } = await client
        .from("tables")
        .select("status")
        .eq("id", tableId)
        .maybeSingle();
      if ((tableRow?.status as TableStatus | undefined) === "locked") {
        return;
      }
      if (isSeated && tableId === nextTableId) {
        await client.from("tables").update({ status: "occupied" }).eq("id", tableId);
        return;
      }
      await refreshTableAvailabilityForBooking(client, tableId);
    })
  );

  const targetLabel = mergeGroupContext?.ok
    ? `cụm ${mergeGroupContext.mergedName}`
    : "bàn mới";
  return { ok: true, message: `Đã chuyển khách sang ${targetLabel}.` };
}

async function setTablesOccupiedUnlessLocked(
  client: ReturnType<typeof ensureClient>,
  tableIds: Iterable<string>
): Promise<void> {
  await Promise.all(
    [...new Set(tableIds)].map((tableId) =>
      client.from("tables").update({ status: "occupied" }).eq("id", tableId).neq("status", "locked")
    )
  );
}

export async function updateBookingStatusInSupabase(
  bookingId: string,
  status: BookingStatus
): Promise<void> {
  const client = ensureClient();
  const { data: booking } = await (client as any)
    .from("bookings")
    .select("id, table_id, merge_group_id, branch_id, start_time, end_time")
    .eq("id", bookingId)
    .maybeSingle();
  const normalizedStatus: BookingStatus = status === "checked_in" ? "seated" : status;
  const shouldClearCheckedInAt =
    normalizedStatus === "cancelled" ||
    normalizedStatus === "pending" ||
    normalizedStatus === "confirmed" ||
    normalizedStatus === "no_show" ||
    normalizedStatus === "late";
  const clearsTableAssignment =
    normalizedStatus === "cancelled" || normalizedStatus === "no_show";
  const { error } = await (client as any)
    .from("bookings")
    .update(
      shouldClearCheckedInAt
        ? {
            status: normalizedStatus,
            checked_in_at: null,
            no_show_marked_at:
              normalizedStatus === "no_show" ? dayjs().toISOString() : null,
            late_marked_at:
              normalizedStatus === "late" ? dayjs().toISOString() : null,
            ...(clearsTableAssignment
              ? { table_id: null, merge_group_id: null, area_id: null }
              : {}),
          }
        : { status: normalizedStatus }
    )
    .eq("id", bookingId);
  if (error) {
    throw new Error(error.message);
  }
  if (!booking) {
    return;
  }

  const tableIdsToRefresh = new Set<string>();
  if (booking.table_id) {
    tableIdsToRefresh.add(booking.table_id as string);
  }
  const mergeGroupId = (booking.merge_group_id as string | null) ?? null;
  if (mergeGroupId) {
    for (const memberTableId of await listMergeGroupMemberTableIds(client, mergeGroupId)) {
      tableIdsToRefresh.add(memberTableId);
    }
  }

  const afterTable =
    normalizedStatus === "cancelled" ||
    normalizedStatus === "completed" ||
    normalizedStatus === "no_show" ||
    normalizedStatus === "late"
      ? Promise.all(
          [...tableIdsToRefresh].map((id) => refreshTableAvailabilityForBooking(client, id))
        )
      : Promise.resolve();

  await afterTable;
}

export async function queueBookingInSupabase(bookingId: string): Promise<Result> {
  const client = ensureClient();
  const { data: booking, error: loadErr } = await (client as any)
    .from("bookings")
    .select("id, status, table_id, merge_group_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (loadErr) {
    return { ok: false, message: loadErr.message };
  }
  if (!booking) {
    return { ok: false, message: "Không tìm thấy booking." };
  }

  const status = booking.status as BookingStatus;
  const hasTable = Boolean(booking.table_id || booking.merge_group_id);
  if (
    !hasTable ||
    (status !== "confirmed" &&
      status !== "late" &&
      status !== "seated" &&
      status !== "checked_in")
  ) {
    return {
      ok: false,
      message:
        "Chỉ chuyển về chờ xếp bàn khi booking đã có bàn và đang xác nhận, trễ hoặc đã vào bàn.",
    };
  }

  const tableIdsToRefresh = new Set<string>();
  if (booking.table_id) {
    tableIdsToRefresh.add(booking.table_id as string);
  }
  const mergeGroupId = (booking.merge_group_id as string | null) ?? null;
  if (mergeGroupId) {
    for (const memberTableId of await listMergeGroupMemberTableIds(client, mergeGroupId)) {
      tableIdsToRefresh.add(memberTableId);
    }
  }

  const { error } = await (client as any)
    .from("bookings")
    .update({
      status: "pending",
      table_id: null,
      merge_group_id: null,
      area_id: null,
      checked_in_at: null,
      late_marked_at: null,
    })
    .eq("id", bookingId);
  if (error) {
    return { ok: false, message: error.message };
  }

  await Promise.all(
    [...tableIdsToRefresh].map((tableId) => refreshTableAvailabilityForBooking(client, tableId))
  );

  return { ok: true, message: "Đã chuyển booking về chờ xếp bàn." };
}

export async function deleteCustomersInSupabase(customerIds: string[]): Promise<Result> {
  const client = ensureClient();
  const ids = customerIds.filter((id) => id.trim().length > 0);
  if (ids.length === 0) {
    return { ok: true, message: "Không có khách hàng để xóa." };
  }

  const { data: bookingRefs, error: bookingRefsError } = await client
    .from("bookings")
    .select("id, customer_id")
    .in("customer_id", ids)
    .limit(1);
  if (bookingRefsError) {
    return { ok: false, message: bookingRefsError.message };
  }
  if (bookingRefs && bookingRefs.length > 0) {
    return { ok: false, message: "Không thể xóa: khách hàng đã có booking." };
  }

  const { error } = await client.from("customers").delete().in("id", ids);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã xóa khách hàng." };
}

export type MergeCustomersInput = {
  survivorId: string;
  sourceIds: string[];
  fullName: string;
  phone: string | null;
  note: string | null;
};

export type MergeCustomersResult = Result & {
  survivorId?: string;
  mergedBookingCount?: number;
  deletedCustomerIds?: string[];
};

function mergeCustomersErrorMessage(raw: string): string {
  if (raw.includes("MERGE_CUSTOMERS:need_at_least_two")) {
    return "Cần chọn ít nhất 2 khách hàng để gộp.";
  }
  if (raw.includes("MERGE_CUSTOMERS:survivor_not_in_sources")) {
    return "Hồ sơ giữ lại phải nằm trong danh sách gộp.";
  }
  if (raw.includes("MERGE_CUSTOMERS:name_required")) {
    return "Tên khách không được để trống.";
  }
  if (raw.includes("MERGE_CUSTOMERS:missing_customer")) {
    return "Một hoặc nhiều khách hàng không còn tồn tại. Vui lòng tải lại trang.";
  }
  if (raw.includes("MERGE_CUSTOMERS:phone_taken")) {
    return "Số điện thoại đã được dùng cho khách hàng khác.";
  }
  return raw;
}

export async function mergeCustomersInSupabase(
  input: MergeCustomersInput
): Promise<MergeCustomersResult> {
  const client = ensureClient();
  const sourceIds = [...new Set(input.sourceIds.map((id) => id.trim()).filter(Boolean))];
  const survivorId = input.survivorId.trim();
  const fullName = input.fullName.trim();
  if (sourceIds.length < 2) {
    return { ok: false, message: "Cần chọn ít nhất 2 khách hàng để gộp." };
  }
  if (!survivorId || !sourceIds.includes(survivorId)) {
    return { ok: false, message: "Hồ sơ giữ lại phải nằm trong danh sách gộp." };
  }
  if (!fullName) {
    return { ok: false, message: "Tên khách không được để trống." };
  }

  let phone: string | null = null;
  if (input.phone != null && input.phone.trim().length > 0) {
    const normalized = normalizeVietnamPhone(input.phone.trim());
    if (isSyntheticPhoneValue(normalized) || !isPlausibleVietnamPhone(normalized)) {
      return {
        ok: false,
        message:
          "Số điện thoại không đúng định dạng Việt Nam (ví dụ 0912345678, +84912345678).",
      };
    }
    phone = normalized;
  }

  const note =
    input.note != null && input.note.trim().length > 0 ? input.note.trim() : null;

  const { data, error } = await client.rpc("merge_customers", {
    p_survivor_id: survivorId,
    p_source_ids: sourceIds,
    p_full_name: fullName,
    p_phone: phone,
    p_note: note,
  });

  if (error) {
    return { ok: false, message: mergeCustomersErrorMessage(error.message) };
  }

  const payload = (data ?? {}) as {
    survivor_id?: string;
    deleted_customer_ids?: string[];
    merged_booking_count?: number;
    deleted_customer_count?: number;
  };
  const deletedCustomerIds = Array.isArray(payload.deleted_customer_ids)
    ? payload.deleted_customer_ids.filter((id): id is string => typeof id === "string")
    : sourceIds.filter((id) => id !== survivorId);
  const mergedBookingCount =
    typeof payload.merged_booking_count === "number" ? payload.merged_booking_count : 0;
  const deletedCount =
    typeof payload.deleted_customer_count === "number"
      ? payload.deleted_customer_count
      : deletedCustomerIds.length;

  return {
    ok: true,
    message: `Đã gộp ${deletedCount + 1} khách → 1 hồ sơ (${mergedBookingCount} booking).`,
    survivorId: typeof payload.survivor_id === "string" ? payload.survivor_id : survivorId,
    mergedBookingCount,
    deletedCustomerIds,
  };
}

export type PurgeDataResult = Result & {
  deletedCustomerCount?: number;
  deletedBookingCount?: number;
  deletedBookingIds?: string[];
  deletedCustomerIds?: string[];
};

const PURGE_ID_CHUNK_SIZE = 200;

type BookingPurgeRow = {
  id: string;
  customer_id: string;
  table_id: string | null;
  merge_group_id: string | null;
};

async function collectTableIdsTouchedByBookings(
  client: ReturnType<typeof ensureClient>,
  bookings: BookingPurgeRow[]
): Promise<string[]> {
  const tableIds = new Set<string>();
  const mergeGroupIds = new Set<string>();
  for (const booking of bookings) {
    if (booking.table_id) {
      tableIds.add(booking.table_id);
    }
    if (booking.merge_group_id) {
      mergeGroupIds.add(booking.merge_group_id);
    }
  }
  for (const mergeGroupId of mergeGroupIds) {
    for (const memberTableId of await listMergeGroupMemberTableIds(client, mergeGroupId)) {
      tableIds.add(memberTableId);
    }
  }
  return [...tableIds];
}

async function deleteRowsByIdInChunks(
  client: ReturnType<typeof ensureClient>,
  table: "bookings" | "customers",
  ids: string[]
): Promise<Result> {
  for (let offset = 0; offset < ids.length; offset += PURGE_ID_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + PURGE_ID_CHUNK_SIZE);
    const { error } = await client.from(table).delete().in("id", chunk);
    if (error) {
      return { ok: false, message: error.message };
    }
  }
  return { ok: true, message: "OK" };
}

async function refreshTablesAfterPurge(
  client: ReturnType<typeof ensureClient>,
  tableIds: string[]
): Promise<void> {
  if (tableIds.length === 0) {
    return;
  }
  await Promise.all(tableIds.map((tableId) => refreshTableAvailabilityForBooking(client, tableId)));
}

/** Hard-delete customers and cascaded bookings (GM/admin data purge). */
export async function purgeCustomersWithRelatedDataInSupabase(
  customerIds: string[]
): Promise<PurgeDataResult> {
  const client = ensureClient();
  const ids = [...new Set(customerIds.map((id) => id.trim()).filter((id) => id.length > 0))];
  if (ids.length === 0) {
    return { ok: true, message: "Không có khách hàng để xóa.", deletedCustomerCount: 0, deletedBookingCount: 0 };
  }

  const bookings: BookingPurgeRow[] = [];
  for (let offset = 0; offset < ids.length; offset += PURGE_ID_CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + PURGE_ID_CHUNK_SIZE);
    const { data, error } = await client
      .from("bookings")
      .select("id, customer_id, table_id, merge_group_id")
      .in("customer_id", chunk);
    if (error) {
      return { ok: false, message: error.message };
    }
    bookings.push(...((data ?? []) as BookingPurgeRow[]));
  }

  const tableIds = await collectTableIdsTouchedByBookings(client, bookings);
  const deleteResult = await deleteRowsByIdInChunks(client, "customers", ids);
  if (!deleteResult.ok) {
    return deleteResult;
  }

  await refreshTablesAfterPurge(client, tableIds);

  const deletedBookingIds = bookings.map((row) => row.id);
  return {
    ok: true,
    message: `Đã xóa ${ids.length} khách hàng và ${deletedBookingIds.length} booking liên quan.`,
    deletedCustomerCount: ids.length,
    deletedBookingCount: deletedBookingIds.length,
    deletedCustomerIds: ids,
    deletedBookingIds,
  };
}

/**
 * Delete bookings whose booking_at falls in [fromIso, toIso] (inclusive),
 * then remove customers left with no remaining bookings.
 */
export async function purgeDataInDateRangeInSupabase(input: {
  fromIso: string;
  toIso: string;
}): Promise<PurgeDataResult> {
  const client = ensureClient();
  const fromIso = input.fromIso.trim();
  const toIso = input.toIso.trim();
  if (!fromIso || !toIso) {
    return { ok: false, message: "Khoảng thời gian không hợp lệ." };
  }
  if (dayjs(fromIso).isAfter(dayjs(toIso))) {
    return { ok: false, message: "Ngày bắt đầu phải trước hoặc bằng ngày kết thúc." };
  }

  const { data, error } = await client
    .from("bookings")
    .select("id, customer_id, table_id, merge_group_id")
    .gte("booking_at", fromIso)
    .lte("booking_at", toIso);
  if (error) {
    return { ok: false, message: error.message };
  }

  const bookings = (data ?? []) as BookingPurgeRow[];
  if (bookings.length === 0) {
    return {
      ok: true,
      message: "Không có booking nào trong khoảng thời gian đã chọn.",
      deletedCustomerCount: 0,
      deletedBookingCount: 0,
      deletedBookingIds: [],
      deletedCustomerIds: [],
    };
  }

  const bookingIds = bookings.map((row) => row.id);
  const customerIdsTouched = [...new Set(bookings.map((row) => row.customer_id))];
  const tableIds = await collectTableIdsTouchedByBookings(client, bookings);

  const deleteBookingsResult = await deleteRowsByIdInChunks(client, "bookings", bookingIds);
  if (!deleteBookingsResult.ok) {
    return deleteBookingsResult;
  }

  const orphanCustomerIds: string[] = [];
  for (let offset = 0; offset < customerIdsTouched.length; offset += PURGE_ID_CHUNK_SIZE) {
    const chunk = customerIdsTouched.slice(offset, offset + PURGE_ID_CHUNK_SIZE);
    const { data: remaining, error: remainingError } = await client
      .from("bookings")
      .select("customer_id")
      .in("customer_id", chunk);
    if (remainingError) {
      return { ok: false, message: remainingError.message };
    }
    const stillReferenced = new Set(
      ((remaining ?? []) as Array<{ customer_id: string }>).map((row) => row.customer_id)
    );
    for (const customerId of chunk) {
      if (!stillReferenced.has(customerId)) {
        orphanCustomerIds.push(customerId);
      }
    }
  }

  if (orphanCustomerIds.length > 0) {
    const deleteCustomersResult = await deleteRowsByIdInChunks(
      client,
      "customers",
      orphanCustomerIds
    );
    if (!deleteCustomersResult.ok) {
      return deleteCustomersResult;
    }
  }

  await refreshTablesAfterPurge(client, tableIds);

  return {
    ok: true,
    message: `Đã xóa ${bookingIds.length} booking và ${orphanCustomerIds.length} khách hàng không còn dữ liệu.`,
    deletedBookingCount: bookingIds.length,
    deletedCustomerCount: orphanCustomerIds.length,
    deletedBookingIds: bookingIds,
    deletedCustomerIds: orphanCustomerIds,
  };
}

export async function checkInBookingInSupabase(bookingId: string): Promise<void> {
  const client = ensureClient();
  const { data: target, error: loadErr } = await client
    .from("bookings")
    .select("id, branch_id, table_id, merge_group_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (loadErr) {
    throw new Error(loadErr.message);
  }
  if (!target) {
    throw new Error("Không tìm thấy booking.");
  }
  const tableId = (target.table_id as string | null) ?? null;
  const mergeGroupId = (target.merge_group_id as string | null) ?? null;
  if (!tableId && !mergeGroupId) {
    throw new Error("Booking chưa được gán bàn. Vui lòng gán trong mục Sơ đồ trước.");
  }

  if (mergeGroupId) {
    const memberTableIds = await listMergeGroupMemberTableIds(client, mergeGroupId);
    if (memberTableIds.length > 0) {
      const { data: memberBookings, error: memberBookingsErr } = await client
        .from("bookings")
        .select("id, table_id, merge_group_id")
        .in("table_id", memberTableIds)
        .in("status", ["seated", "checked_in"]);
      if (memberBookingsErr) {
        throw new Error(memberBookingsErr.message);
      }
      const blocking = (memberBookings ?? []).some((row) => {
        const rowMergeGroupId = (row.merge_group_id as string | null) ?? null;
        const rowTableId = (row.table_id as string | null) ?? null;
        return !(
          rowTableId &&
          rowMergeGroupId === mergeGroupId
        );
      });
      if (blocking) {
        throw new Error(
          "Không thể check-in cụm gộp khi còn bàn thành viên đang có khách."
        );
      }
    }
  }

  const { error: bookingErr } = await (client as any)
    .from("bookings")
    .update({ status: "seated", checked_in_at: dayjs().toISOString(), no_show_marked_at: null })
    .eq("id", bookingId);
  if (bookingErr) {
    throw new Error(bookingErr.message);
  }

  const occupiedTableIds = new Set<string>();
  if (tableId) {
    occupiedTableIds.add(tableId);
  }
  if (mergeGroupId) {
    for (const memberTableId of await listMergeGroupMemberTableIds(client, mergeGroupId)) {
      occupiedTableIds.add(memberTableId);
    }
  }

  await Promise.all([
    setTablesOccupiedUnlessLocked(client, occupiedTableIds),
    client
      .from("internal_notifications")
      .insert({
        title: "Check-in hoàn tất",
        message: "Đã check-in thành công. Bàn chuyển sang trạng thái có khách.",
        created_at: dayjs().toISOString(),
        is_read: false,
        branch_id: target.branch_id,
      })
      .then(({ error: notifErr }) => {
        if (notifErr) {
          console.warn("[checkInBooking] notification insert failed:", notifErr.message);
        }
      }),
  ]);
}

export async function getTableBlockStateInSupabase(input: {
  tableId?: string | null;
  mergeGroupId?: string | null;
  slotStartTime: string;
  slotEndTime?: string;
}): Promise<TableBlockState> {
  const hasTable = Boolean(input.tableId);
  const hasMergeGroup = Boolean(input.mergeGroupId);
  if (hasTable === hasMergeGroup) {
    throw new Error("Cần chỉ định tableId hoặc mergeGroupId.");
  }

  const client = ensureClient();
  const runtimeSettings = await getBookingRuntimeSettings(client);
  const slotStartTime = dayjs(input.slotStartTime).toISOString();
  const slotEndTime = dayjs(
    input.slotEndTime ??
      dayjs(slotStartTime).add(runtimeSettings.standardTurnaroundMinutes, "minute").toISOString()
  ).toISOString();

  const scheduleFrom = dayjs().startOf("day").toISOString();

  const mapBookingRow = (item: Record<string, unknown>): Booking => ({
    id: item.id as string,
    customerId: item.customer_id as string,
    branchId: item.branch_id as string,
    areaId: item.area_id as string,
    tableId: (item.table_id as string | null) ?? null,
    mergeGroupId: (item.merge_group_id as string | null) ?? null,
    guestCount: item.guest_count as number,
    bookingAt: item.booking_at as string,
    startTime: (item.start_time as string | null) ?? (item.booking_at as string),
    endTime:
      (item.end_time as string | null) ??
      dayjs((item.start_time as string | null) ?? (item.booking_at as string))
        .add(runtimeSettings.standardTurnaroundMinutes, "minute")
        .toISOString(),
    checkedInAt: (item.checked_in_at as string | null) ?? undefined,
    noShowMarkedAt: (item.no_show_marked_at as string | null) ?? undefined,
    lateMarkedAt: (item.late_marked_at as string | null) ?? undefined,
    note: (item.note as string | null) ?? undefined,
    createdAt:
      (item.created_at as string | null | undefined) ??
      (item.start_time as string | null) ??
      (item.booking_at as string),
    createdByUserId: item.created_by_user_id as string,
    lastEditedAt: (item.last_edited_at as string | null) ?? undefined,
    lastEditedByUserId: (item.last_edited_by_user_id as string | null) ?? undefined,
    status: item.status as BookingStatus,
  });

  let confirmedQuery = (client as any)
    .from("bookings")
    .select("*")
    .gte("start_time", scheduleFrom)
    .in("status", ["confirmed", "seated", "checked_in"])
    .order("start_time", { ascending: true });

  if (hasMergeGroup) {
    confirmedQuery = confirmedQuery.eq("merge_group_id", input.mergeGroupId);
  } else {
    confirmedQuery = confirmedQuery.eq("table_id", input.tableId);
  }

  const confirmedResult = await confirmedQuery;
  if (confirmedResult.error) {
    throw new Error(confirmedResult.error.message);
  }

  return {
    tableId: hasTable ? (input.tableId ?? null) : null,
    mergeGroupId: hasMergeGroup ? (input.mergeGroupId ?? null) : null,
    slotStartTime,
    slotEndTime,
    confirmedSchedule:
      (confirmedResult.data as any[] | null | undefined)?.map((item) =>
        mapBookingRow(item as Record<string, unknown>)
      ) ?? [],
  };
}

type MergeGroupCreateInput = {
  branchId: string;
  areaId: string;
  tableIds: string[];
  startDate: string;
  endDate: string;
  createdByUserId?: string;
  /** Calendar day whose floor layout receives merge repack (defaults to startDate). */
  layoutDate?: string;
};

type MergeGroupCreateResult = Result & {
  groupId?: string;
  mergedName?: string;
  group?: TableMergeGroup;
  dayLayout?: AreaFloorLayoutByDate | null;
};

/**
 * Pick the lowest unused positive integer among active merge groups of an area
 * (so released numbers can be reused — per user spec).
 */
async function pickNextMergeGroupNumberForArea(
  client: ReturnType<typeof ensureClient>,
  areaId: string
): Promise<number> {
  const { data, error } = await (client as any)
    .from("table_merge_groups")
    .select("auto_number")
    .eq("area_id", areaId)
    .eq("status", "active");
  if (error) {
    throw new Error(error.message);
  }
  const used = new Set<number>(
    ((data ?? []) as Array<{ auto_number: number | null }>)
      .map((row) => row.auto_number)
      .filter((n): n is number => typeof n === "number" && n > 0)
  );
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

async function ensureTablesAreFreeToMerge(
  client: ReturnType<typeof ensureClient>,
  tableIds: string[],
  dateRange: { startDate: string; endDate: string },
  options?: { excludeGroupId?: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (tableIds.length === 0) {
    return { ok: true };
  }
  const { data, error } = await (client as any)
    .from("table_merge_members")
    .select(
      "table_id, group_id, table_merge_groups!inner(status, start_date, end_date, created_at)"
    )
    .in("table_id", tableIds)
    .eq("table_merge_groups.status", "active");
  if (error) {
    return { ok: false, message: error.message };
  }
  const busyIds = new Set<string>();
  for (const row of (data ?? []) as Array<{
    table_id: string;
    group_id: string;
    table_merge_groups:
      | { status: string; start_date?: string | null; end_date?: string | null; created_at: string }
      | Array<{
          status: string;
          start_date?: string | null;
          end_date?: string | null;
          created_at: string;
        }>;
  }>) {
    if (options?.excludeGroupId && row.group_id === options.excludeGroupId) {
      continue;
    }
    const groupJoin = Array.isArray(row.table_merge_groups)
      ? row.table_merge_groups[0]
      : row.table_merge_groups;
    if (!groupJoin) {
      continue;
    }
    const { startDate, endDate } = resolveMergeGroupDateRange({
      created_at: groupJoin.created_at,
      start_date: groupJoin.start_date,
      end_date: groupJoin.end_date,
    });
    if (mergeDateRangesOverlap(dateRange.startDate, dateRange.endDate, startDate, endDate)) {
      busyIds.add(row.table_id);
    }
  }
  if (busyIds.size === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    message: `Có bàn đã thuộc cụm gộp khác trong cùng khoảng ngày (${busyIds.size} bàn). Vui lòng bỏ gộp hoặc đổi ngày trước khi gộp mới.`,
  };
}

function mapAreaFloorLayoutByDateFromRow(row: {
  id: string;
  area_id: string;
  layout_date: string;
  floor_grid_columns: number;
  floor_grid_rows: number;
  floor_node_spacing: number;
  table_positions: unknown;
  source_template_id: string | null;
  merge_group_id?: string | null;
  updated_at: string;
  updated_by_user_id: string | null;
}): AreaFloorLayoutByDate {
  return {
    id: row.id,
    areaId: row.area_id,
    layoutDate: row.layout_date,
    floorGridColumns: row.floor_grid_columns,
    floorGridRows: row.floor_grid_rows,
    floorNodeSpacing: row.floor_node_spacing,
    tablePositions: parseTablePositionsJson(row.table_positions as Parameters<typeof parseTablePositionsJson>[0]),
    sourceTemplateId: row.source_template_id,
    mergeGroupId: row.merge_group_id ?? null,
    updatedAt: row.updated_at,
    updatedByUserId: row.updated_by_user_id,
  };
}

async function isMergeManagedDayLayoutStillValid(
  client: ReturnType<typeof ensureClient>,
  layoutDate: string,
  mergeGroupId: string
): Promise<boolean> {
  const { data: group, error } = await (client as any)
    .from("table_merge_groups")
    .select("status, start_date, end_date, created_at")
    .eq("id", mergeGroupId)
    .maybeSingle();
  if (error || !group) {
    return false;
  }
  if (group.status !== "active") {
    return false;
  }
  const range = resolveMergeGroupDateRange({
    created_at: group.created_at,
    start_date: group.start_date,
    end_date: group.end_date,
  });
  return isLayoutDateWithinMergeRange(layoutDate, range);
}

export async function deleteMergeManagedFloorLayoutsForGroupInSupabase(
  mergeGroupId: string
): Promise<void> {
  const client = ensureClient();
  const { error } = await client
    .from("area_floor_layout_by_date")
    .delete()
    .eq("merge_group_id", mergeGroupId);
  if (error) {
    throw new Error(error.message);
  }
}

async function loadAreaFloorLayoutRowForDate(
  client: ReturnType<typeof ensureClient>,
  areaId: string,
  layoutDate: string
) {
  const { data, error } = await client
    .from("area_floor_layout_by_date")
    .select(
      "id, area_id, layout_date, floor_grid_columns, floor_grid_rows, floor_node_spacing, table_positions, source_template_id, merge_group_id, updated_at, updated_by_user_id"
    )
    .eq("area_id", areaId)
    .eq("layout_date", layoutDate)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }
  if (data.merge_group_id) {
    const stillValid = await isMergeManagedDayLayoutStillValid(
      client,
      layoutDate,
      data.merge_group_id
    );
    if (!stillValid) {
      await client.from("area_floor_layout_by_date").delete().eq("id", data.id);
      return null;
    }
  }
  return mapAreaFloorLayoutByDateFromRow(data);
}

/** When merges are active on `layoutDate`, build a merge-managed day layout if missing. */
async function ensureMergeDayLayoutForAreaDateIfNeeded(
  client: ReturnType<typeof ensureClient>,
  areaId: string,
  layoutDate: string
): Promise<boolean> {
  const { data: groups, error } = await (client as any)
    .from("table_merge_groups")
    .select("id, status, start_date, end_date, created_at")
    .eq("area_id", areaId)
    .eq("status", "active");
  if (error) {
    return false;
  }
  const effective = ((groups ?? []) as TableMergeGroupRowLike[]).filter((group) => {
    const range = resolveMergeGroupDateRange(group);
    return isLayoutDateWithinMergeRange(layoutDate, range);
  });
  if (effective.length === 0) {
    return false;
  }
  const targetGroup = effective[0]!;
  const { data: members, error: membersErr } = await (client as any)
    .from("table_merge_members")
    .select("table_id")
    .eq("group_id", targetGroup.id);
  if (membersErr) {
    return false;
  }
  const memberIds = ((members ?? []) as Array<{ table_id: string }>).map((row) => row.table_id);
  if (memberIds.length < 2) {
    return false;
  }
  const packResult = await packMergeGroupTablesOnFloor(client, areaId, memberIds, {
    layoutDate,
    mergeGroupId: targetGroup.id,
  });
  return packResult.packed;
}

export async function fetchAreaFloorLayoutForDateInSupabase(
  areaId: string,
  layoutDate: string
): Promise<AreaFloorLayoutByDate | null> {
  const client = ensureClient();
  let row = await loadAreaFloorLayoutRowForDate(client, areaId, layoutDate);
  if (row) {
    return row;
  }
  const ensured = await ensureMergeDayLayoutForAreaDateIfNeeded(client, areaId, layoutDate);
  if (!ensured) {
    return null;
  }
  row = await loadAreaFloorLayoutRowForDate(client, areaId, layoutDate);
  return row;
}

export async function upsertAreaFloorLayoutForDateInSupabase(
  areaId: string,
  layoutDate: string,
  snapshot: FloorLayoutSnapshot,
  options?: {
    sourceTemplateId?: string | null;
    updatedByUserId?: string | null;
    mergeGroupId?: string | null;
  }
): Promise<AreaFloorLayoutByDate> {
  const client = ensureClient();
  const normalized = normalizeFloorLayoutSnapshot(snapshot);
  const positionsJson = tablePositionsToJson(positionsRecordFromSnapshot(normalized));
  const mergeGroupId =
    options?.mergeGroupId !== undefined ? options.mergeGroupId : undefined;
  const { data, error } = await client
    .from("area_floor_layout_by_date")
    .upsert(
      {
        area_id: areaId,
        layout_date: layoutDate,
        floor_grid_columns: normalized.floorGridColumns,
        floor_grid_rows: normalized.floorGridRows,
        floor_node_spacing: normalized.floorNodeSpacing,
        table_positions: positionsJson,
        source_template_id: options?.sourceTemplateId ?? null,
        ...(mergeGroupId !== undefined ? { merge_group_id: mergeGroupId } : {}),
        updated_at: new Date().toISOString(),
        updated_by_user_id: options?.updatedByUserId ?? null,
      },
      { onConflict: "area_id,layout_date" }
    )
    .select(
      "id, area_id, layout_date, floor_grid_columns, floor_grid_rows, floor_node_spacing, table_positions, source_template_id, merge_group_id, updated_at, updated_by_user_id"
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Không lưu được sơ đồ theo ngày.");
  }
  return mapAreaFloorLayoutByDateFromRow(data);
}

export async function deleteAreaFloorLayoutForDateInSupabase(
  areaId: string,
  layoutDate: string
): Promise<void> {
  const client = ensureClient();
  const { error } = await client
    .from("area_floor_layout_by_date")
    .delete()
    .eq("area_id", areaId)
    .eq("layout_date", layoutDate);
  if (error) {
    throw new Error(error.message);
  }
}

export type FloorLayoutTemplate = {
  id: string;
  areaId: string;
  name: string;
  snapshot: FloorLayoutSnapshot;
  backgroundImageDataUrl: string | null;
  backgroundScale: number;
  createdByUserId: string;
  updatedAt: string;
};

export async function listFloorLayoutTemplatesInSupabase(
  areaId: string
): Promise<FloorLayoutTemplate[]> {
  const client = ensureClient();
  const { data, error } = await client
    .from("floor_layout_templates")
    .select(
      "id, area_id, name, table_layout_json, background_image_data_url, background_scale, created_by_user_id, updated_at"
    )
    .eq("area_id", areaId)
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).flatMap((row) => {
    const snapshot = parseFloorLayoutSnapshotJson(row.table_layout_json);
    if (!snapshot) {
      return [];
    }
    return [
      {
        id: row.id,
        areaId: row.area_id,
        name: row.name,
        snapshot,
        backgroundImageDataUrl: row.background_image_data_url,
        backgroundScale: row.background_scale,
        createdByUserId: row.created_by_user_id,
        updatedAt: row.updated_at,
      },
    ];
  });
}

export async function createFloorLayoutTemplateInSupabase(
  areaId: string,
  name: string,
  snapshot: FloorLayoutSnapshot,
  createdByUserId: string
): Promise<FloorLayoutTemplate> {
  const client = ensureClient();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("Vui lòng nhập tên mẫu sơ đồ.");
  }
  const normalized = normalizeFloorLayoutSnapshot(snapshot);
  const { data, error } = await client
    .from("floor_layout_templates")
    .insert({
      area_id: areaId,
      name: trimmed,
      table_layout_json: floorLayoutSnapshotToJson(normalized),
      created_by_user_id: createdByUserId,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, area_id, name, table_layout_json, background_image_data_url, background_scale, created_by_user_id, updated_at"
    )
    .single();
  if (error || !data) {
    throw new Error(error?.message ?? "Không tạo được mẫu sơ đồ.");
  }
  const parsed = parseFloorLayoutSnapshotJson(data.table_layout_json);
  if (!parsed) {
    throw new Error("Mẫu sơ đồ không hợp lệ sau khi lưu.");
  }
  return {
    id: data.id,
    areaId: data.area_id,
    name: data.name,
    snapshot: parsed,
    backgroundImageDataUrl: data.background_image_data_url,
    backgroundScale: data.background_scale,
    createdByUserId: data.created_by_user_id,
    updatedAt: data.updated_at,
  };
}

export async function deleteFloorLayoutTemplateInSupabase(templateId: string): Promise<void> {
  const client = ensureClient();
  const { error } = await client.from("floor_layout_templates").delete().eq("id", templateId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function applyFloorLayoutTemplateToDateInSupabase(
  templateId: string,
  areaId: string,
  layoutDate: string,
  updatedByUserId?: string | null
): Promise<AreaFloorLayoutByDate> {
  const client = ensureClient();
  const { data: template, error } = await client
    .from("floor_layout_templates")
    .select("id, area_id, table_layout_json")
    .eq("id", templateId)
    .maybeSingle();
  if (error || !template) {
    throw new Error(error?.message ?? "Không tìm thấy mẫu sơ đồ.");
  }
  if (template.area_id !== areaId) {
    throw new Error("Mẫu sơ đồ không thuộc khu vực này.");
  }
  const snapshot = parseFloorLayoutSnapshotJson(template.table_layout_json);
  if (!snapshot) {
    throw new Error("Dữ liệu mẫu sơ đồ không hợp lệ.");
  }
  return upsertAreaFloorLayoutForDateInSupabase(areaId, layoutDate, snapshot, {
    sourceTemplateId: templateId,
    updatedByUserId: updatedByUserId ?? null,
    mergeGroupId: null,
  });
}

async function loadResolvedLayoutForPack(
  client: ReturnType<typeof ensureClient>,
  areaId: string,
  layoutDate: string
): Promise<{
  gridColumns: number;
  gridRows: number;
  nodeSpacing: number;
  areaTables: Array<{ id: string; positionX: number; positionY: number }>;
}> {
  const { data: area, error: areaErr } = await client
    .from("areas")
    .select("id, floor_grid_columns, floor_grid_rows, floor_node_spacing")
    .eq("id", areaId)
    .maybeSingle();
  if (areaErr || !area) {
    throw new Error(areaErr?.message ?? "Không tìm thấy khu vực.");
  }

  const { data: areaTables, error: tablesErr } = await client
    .from("tables")
    .select("id, position_x, position_y")
    .eq("area_id", areaId);
  if (tablesErr) {
    throw new Error(tablesErr.message);
  }

  const tablesMapped = (areaTables ?? []).map((row) => ({
    id: row.id,
    positionX: row.position_x,
    positionY: row.position_y,
  }));

  const dayRow = await loadAreaFloorLayoutRowForDate(client, areaId, layoutDate);
  if (!dayRow) {
    const globalSnapshot = snapshotFromGlobalArea(
      {
        floorGridColumns:
          typeof area.floor_grid_columns === "number" ? area.floor_grid_columns : 12,
        floorGridRows: typeof area.floor_grid_rows === "number" ? area.floor_grid_rows : 8,
        floorNodeSpacing:
          typeof area.floor_node_spacing === "number"
            ? area.floor_node_spacing
            : FLOOR_DEFAULT_NODE_SPACING_PX,
      },
      tablesMapped.map((t) => ({
        id: t.id,
        positionX: t.positionX,
        positionY: t.positionY,
      })) as Parameters<typeof snapshotFromGlobalArea>[1]
    );
    return {
      gridColumns: globalSnapshot.floorGridColumns,
      gridRows: globalSnapshot.floorGridRows,
      nodeSpacing: globalSnapshot.floorNodeSpacing,
      areaTables: tablesMapped.map((t) => {
        const pos = positionsRecordFromSnapshot(globalSnapshot)[t.id];
        return {
          id: t.id,
          positionX: pos?.x ?? t.positionX,
          positionY: pos?.y ?? t.positionY,
        };
      }),
    };
  }

  const positions = { ...dayRow.tablePositions };
  for (const table of tablesMapped) {
    if (!(table.id in positions)) {
      positions[table.id] = { x: table.positionX, y: table.positionY };
    }
  }

  return {
    gridColumns: dayRow.floorGridColumns,
    gridRows: dayRow.floorGridRows,
    nodeSpacing: dayRow.floorNodeSpacing,
    areaTables: tablesMapped.map((t) => ({
      id: t.id,
      positionX: positions[t.id]?.x ?? t.positionX,
      positionY: positions[t.id]?.y ?? t.positionY,
    })),
  };
}

/** Snap active merge members into one adjacent row on the area floor grid (+ one empty plug cell). */
async function packMergeGroupTablesOnFloor(
  client: ReturnType<typeof ensureClient>,
  areaId: string,
  memberTableIds: string[],
  options?: {
    preferredAnchor?: { row: number; col: number };
    /** When set, repack writes to per-day layout instead of global table positions. */
    layoutDate?: string;
    mergeGroupId?: string;
  }
): Promise<{ packed: boolean; dayLayout?: AreaFloorLayoutByDate }> {
  if (memberTableIds.length === 0) {
    return { packed: false };
  }

  const layoutDate = options?.layoutDate?.trim() || null;
  let gridColumns: number;
  let gridRows: number;
  let nodeSpacing: number;
  let areaTables: Array<{ id: string; positionX: number; positionY: number }>;

  if (layoutDate) {
    const resolved = await loadResolvedLayoutForPack(client, areaId, layoutDate);
    gridColumns = resolved.gridColumns;
    gridRows = resolved.gridRows;
    nodeSpacing = resolved.nodeSpacing;
    areaTables = resolved.areaTables;
  } else {
    const { data: area, error: areaErr } = await client
      .from("areas")
      .select("floor_grid_columns, floor_grid_rows, floor_node_spacing")
      .eq("id", areaId)
      .maybeSingle();
    if (areaErr || !area) {
      return { packed: false };
    }
    gridColumns =
      typeof area.floor_grid_columns === "number" ? area.floor_grid_columns : 12;
    gridRows = typeof area.floor_grid_rows === "number" ? area.floor_grid_rows : 8;
    nodeSpacing =
      typeof area.floor_node_spacing === "number" ? area.floor_node_spacing : 168;

    const { data: rawTables, error: tablesErr } = await client
      .from("tables")
      .select("id, position_x, position_y")
      .eq("area_id", areaId);
    if (tablesErr) {
      return { packed: false };
    }
    areaTables = (rawTables ?? []).map((row) => ({
      id: row.id,
      positionX: row.position_x,
      positionY: row.position_y,
    }));
  }

  const packResult = packMergeGroupTablePositions({
    memberTableIds,
    areaTables,
    gridColumns,
    gridRows,
    preferredAnchor: options?.preferredAnchor,
  });
  if (!packResult) {
    return { packed: false };
  }

  const nextGridRows = Math.max(gridRows, packResult.gridRows);
  const positionsRecord: Record<string, { x: number; y: number }> = {};
  for (const table of areaTables) {
    positionsRecord[table.id] = { x: table.positionX, y: table.positionY };
  }
  for (const [tableId, pos] of packResult.positionUpdates.entries()) {
    positionsRecord[tableId] = { x: pos.col, y: pos.row };
  }

  if (layoutDate) {
    const snapshot = snapshotFromPositionsRecord(
      {
        floorGridColumns: gridColumns,
        floorGridRows: nextGridRows,
        floorNodeSpacing: clampFloorNodeSpacing(nodeSpacing),
      },
      positionsRecord
    );
    const dayLayout = await upsertAreaFloorLayoutForDateInSupabase(areaId, layoutDate, snapshot, {
      mergeGroupId: options?.mergeGroupId ?? null,
    });
    return { packed: true, dayLayout };
  }

  if (nextGridRows > gridRows) {
    await updateAreaFloorLayoutInSupabase(areaId, {
      floorGridColumns: gridColumns,
      floorGridRows: nextGridRows,
      floorNodeSpacing: nodeSpacing,
    });
  }

  await Promise.all(
    [...packResult.positionUpdates.entries()].map(([tableId, pos]) =>
      updateTablePositionInSupabase(tableId, pos.col, pos.row)
    )
  );
  return { packed: true };
}

export async function createTableMergeGroupInSupabase(
  input: MergeGroupCreateInput
): Promise<MergeGroupCreateResult> {
  const client = ensureClient();
  const tableIds = [...new Set(input.tableIds)].filter(Boolean);
  if (tableIds.length < 2) {
    return { ok: false, message: "Cần chọn ít nhất 2 bàn để gộp." };
  }

  const { data: tables, error: loadErr } = await client
    .from("tables")
    .select("id, name, status, branch_id, area_id, split_source_table_id")
    .in("id", tableIds);
  if (loadErr) {
    return { ok: false, message: loadErr.message };
  }
  if (!tables || tables.length !== tableIds.length) {
    return { ok: false, message: "Có bàn không tồn tại, vui lòng chọn lại." };
  }
  if (tables.some((table) => table.branch_id !== input.branchId || table.area_id !== input.areaId)) {
    return { ok: false, message: "Các bàn phải cùng chi nhánh và cùng khu vực." };
  }
  if (tables.some((table) => table.split_source_table_id)) {
    return { ok: false, message: "Không gộp được bàn tách — chỉ gộp bàn gốc." };
  }
  if (tables.some((table) => (table.status as TableStatus) === "locked")) {
    return { ok: false, message: "Không gộp được bàn đang khóa." };
  }
  const dateCheck = validateMergeGroupDateRange({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (!dateCheck.ok) {
    return { ok: false, message: dateCheck.message };
  }
  const lockCheck = await ensureTablesAreFreeToMerge(client, tableIds, {
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (!lockCheck.ok) {
    return { ok: false, message: lockCheck.message };
  }

  const nextNumber = await pickNextMergeGroupNumberForArea(client, input.areaId);
  const groupName = `Bàn gộp ${nextNumber}`;

  const { data: groupRow, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .insert({
      branch_id: input.branchId,
      area_id: input.areaId,
      merged_name: groupName,
      auto_number: nextNumber,
      created_by_user_id: input.createdByUserId ?? null,
      status: "active",
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .select("id")
    .single();
  if (groupErr || !groupRow) {
    return { ok: false, message: groupErr?.message ?? "Không tạo được cụm bàn gộp." };
  }

  const membersPayload = tableIds.map((tableId, index) => ({
    group_id: groupRow.id,
    table_id: tableId,
    order_index: index,
  }));
  const { error: membersErr } = await (client as any)
    .from("table_merge_members")
    .insert(membersPayload);
  if (membersErr) {
    // Rollback: drop the group so we don't leave a phantom record.
    await (client as any).from("table_merge_groups").delete().eq("id", groupRow.id);
    return { ok: false, message: membersErr.message };
  }

  const mergeRange = { startDate: input.startDate, endDate: input.endDate };
  const layoutDateCandidate = input.layoutDate?.trim() || input.startDate;
  const primaryLayoutDate = isLayoutDateWithinMergeRange(layoutDateCandidate, mergeRange)
    ? layoutDateCandidate
    : input.startDate;
  const packResult = await packMergeGroupTablesOnFloor(client, input.areaId, tableIds, {
    layoutDate: primaryLayoutDate,
    mergeGroupId: groupRow.id,
  });
  const packedAny = packResult.packed;
  const spanDays = eachLayoutDateInRange(input.startDate, input.endDate).length;
  let message = `Đã gộp ${tableIds.length} bàn thành "${groupName}" (${input.startDate} → ${input.endDate}).`;
  if (!packedAny) {
    message +=
      " Chưa xếp được cụm trên sơ đồ tự động — vào Sơ đồ (chỉnh sửa) để kéo các bàn sát nhau.";
  } else if (spanDays > 1) {
    message +=
      " Sơ đồ đã xếp cho ngày đang xem; các ngày khác trong khoảng sẽ tự xếp khi mở sơ đồ.";
  }

  const group = mapTableMergeGroupFromRow(
    {
      id: groupRow.id,
      branch_id: input.branchId,
      area_id: input.areaId,
      auto_number: nextNumber,
      merged_name: groupName,
      status: "active",
      created_at: new Date().toISOString(),
      released_at: null,
      start_date: input.startDate,
      end_date: input.endDate,
    },
    tableIds
  );

  return {
    ok: true,
    groupId: groupRow.id,
    mergedName: groupName,
    group,
    dayLayout: packResult.dayLayout ?? null,
    message,
  };
}

type TableSplitCloneCreateResult = Result & {
  table?: DiningTable;
  dayLayout?: AreaFloorLayoutByDate | null;
};

export async function createTableSplitCloneInSupabase(input: {
  sourceTableId: string;
  startDate: string;
  endDate: string;
  layoutDate?: string;
  createdByUserId?: string;
}): Promise<TableSplitCloneCreateResult> {
  const client = ensureClient();
  const { data: source, error: sourceErr } = await client
    .from("tables")
    .select(
      "id, name, status, branch_id, area_id, position_x, position_y, split_source_table_id"
    )
    .eq("id", input.sourceTableId)
    .maybeSingle();
  if (sourceErr || !source) {
    return { ok: false, message: sourceErr?.message ?? "Không tìm thấy bàn nguồn." };
  }
  if (source.split_source_table_id) {
    return { ok: false, message: "Chỉ tách được bàn gốc, không tách bàn đã tách." };
  }
  if ((source.status as TableStatus) === "locked") {
    return { ok: false, message: "Không tách được bàn đang khóa." };
  }

  const dateCheck = validateSplitCloneDateRange({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (!dateCheck.ok) {
    return { ok: false, message: dateCheck.message };
  }

  const { data: existingClones, error: clonesErr } = await client
    .from("tables")
    .select("split_clone_number")
    .eq("split_source_table_id", input.sourceTableId);
  if (clonesErr) {
    return { ok: false, message: clonesErr.message };
  }
  const cloneNumber = pickNextSplitCloneNumber(
    ((existingClones ?? []) as Array<{ split_clone_number: number | null }>).map(
      (row) => row.split_clone_number ?? 0
    )
  );
  const cloneName = formatSplitCloneName(source.name, cloneNumber);

  const layoutDateCandidate = input.layoutDate?.trim() || input.startDate;
  const primaryLayoutDate = isLayoutDateWithinMergeRange(layoutDateCandidate, {
    startDate: input.startDate,
    endDate: input.endDate,
  })
    ? layoutDateCandidate
    : input.startDate;

  const resolved = await loadResolvedLayoutForPack(client, source.area_id, primaryLayoutDate);
  const sourcePos = resolved.areaTables.find((table) => table.id === source.id) ?? {
    id: source.id,
    positionX: source.position_x,
    positionY: source.position_y,
  };
  const occupied = buildOccupiedGridCells(
    resolved.areaTables,
    resolved.gridColumns,
    resolved.gridRows
  );
  const adjacent = findAdjacentFreeGridCell({
    sourceCol: sourcePos.positionX,
    sourceRow: sourcePos.positionY,
    occupiedCells: occupied,
    gridColumns: resolved.gridColumns,
    gridRows: resolved.gridRows,
  });
  const clonePosition = adjacent ?? {
    col: sourcePos.positionX,
    row: sourcePos.positionY,
  };

  const { data: inserted, error: insertErr } = await client
    .from("tables")
    .insert({
      branch_id: source.branch_id,
      area_id: source.area_id,
      name: cloneName,
      status: "available",
      position_x: clonePosition.col,
      position_y: clonePosition.row,
      split_source_table_id: source.id,
      split_clone_number: cloneNumber,
      split_start_date: input.startDate,
      split_end_date: input.endDate,
    })
    .select(
      "id, branch_id, area_id, name, status, position_x, position_y, split_source_table_id, split_clone_number, split_start_date, split_end_date"
    )
    .single();
  if (insertErr || !inserted) {
    return { ok: false, message: insertErr?.message ?? "Không tạo được bàn tách." };
  }

  const table = mapDiningTableFromRow(inserted);
  let dayLayout: AreaFloorLayoutByDate | null | undefined;

  if (isLayoutDateWithinMergeRange(primaryLayoutDate, {
    startDate: input.startDate,
    endDate: input.endDate,
  })) {
    const dayRow = await loadAreaFloorLayoutRowForDate(client, source.area_id, primaryLayoutDate);
    const positions = dayRow
      ? { ...dayRow.tablePositions }
      : positionsRecordFromSnapshot(
          snapshotFromGlobalArea(
            {
              floorGridColumns: resolved.gridColumns,
              floorGridRows: resolved.gridRows,
              floorNodeSpacing: resolved.nodeSpacing,
            },
            resolved.areaTables.map((t) => ({
              id: t.id,
              branchId: source.branch_id,
              areaId: source.area_id,
              name: t.id === source.id ? source.name : "",
              status: "available" as TableStatus,
              positionX: t.positionX,
              positionY: t.positionY,
            }))
          )
        );
    positions[table.id] = { x: clonePosition.col, y: clonePosition.row };
    const snapshot = snapshotFromPositionsRecord(
      {
        floorGridColumns: resolved.gridColumns,
        floorGridRows: resolved.gridRows,
        floorNodeSpacing: resolved.nodeSpacing,
      },
      positions
    );
    dayLayout = await upsertAreaFloorLayoutForDateInSupabase(
      source.area_id,
      primaryLayoutDate,
      snapshot,
      {
        updatedByUserId: input.createdByUserId ?? null,
      }
    );
  }

  let message = `Đã tách bàn "${source.name}" thành "${cloneName}" (${input.startDate} → ${input.endDate}).`;
  if (!adjacent) {
    message +=
      " Chưa tìm được ô trống kề bàn gốc — vào Sơ đồ (chỉnh sửa) để kéo bàn tách sang vị trí phù hợp.";
  }

  return {
    ok: true,
    table,
    dayLayout: dayLayout ?? null,
    message,
  };
}

export async function addTableToMergeGroupInSupabase(input: {
  groupId: string;
  tableId: string;
  /** When false, membership is updated but floor positions are left unchanged (caller saved layout). */
  repackFloor?: boolean;
  /** Calendar day whose layout receives repack (defaults to group startDate). */
  layoutDate?: string;
}): Promise<Result> {
  const client = ensureClient();
  const { data: group, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .select("id, branch_id, area_id, status, merged_name, start_date, end_date, created_at")
    .eq("id", input.groupId)
    .maybeSingle();
  if (groupErr || !group) {
    return { ok: false, message: groupErr?.message ?? "Không tìm thấy cụm bàn gộp." };
  }
  if (group.status !== "active") {
    return { ok: false, message: "Cụm bàn gộp đã được giải tán, không thể thêm bàn." };
  }

  const { data: table, error: tableErr } = await client
    .from("tables")
    .select("id, name, status, branch_id, area_id, split_source_table_id")
    .eq("id", input.tableId)
    .maybeSingle();
  if (tableErr || !table) {
    return { ok: false, message: tableErr?.message ?? "Không tìm thấy bàn." };
  }
  if (table.branch_id !== group.branch_id || table.area_id !== group.area_id) {
    return { ok: false, message: "Bàn không cùng chi nhánh hoặc khu vực với cụm bàn gộp." };
  }
  if (table.split_source_table_id) {
    return { ok: false, message: "Không gộp được bàn tách — chỉ gộp bàn gốc." };
  }
  if ((table.status as TableStatus) === "locked") {
    return { ok: false, message: "Không gộp được bàn đang khóa." };
  }
  const groupDates = resolveMergeGroupDateRange(group);
  const lockCheck = await ensureTablesAreFreeToMerge(client, [input.tableId], groupDates);
  if (!lockCheck.ok) {
    return { ok: false, message: lockCheck.message };
  }

  const { data: existingMembers, error: membersErr } = await (client as any)
    .from("table_merge_members")
    .select("table_id, order_index")
    .eq("group_id", group.id)
    .order("order_index", { ascending: true });
  if (membersErr) {
    return { ok: false, message: membersErr.message };
  }
  if ((existingMembers ?? []).some((m: { table_id: string }) => m.table_id === input.tableId)) {
    return { ok: true, message: "Bàn đã thuộc cụm bàn gộp này." };
  }
  const nextOrder =
    ((existingMembers ?? []) as Array<{ order_index: number }>).reduce(
      (max, row) => (row.order_index > max ? row.order_index : max),
      -1
    ) + 1;

  const { error: insertErr } = await (client as any).from("table_merge_members").insert({
    group_id: group.id,
    table_id: input.tableId,
    order_index: nextOrder,
  });
  if (insertErr) {
    return { ok: false, message: insertErr.message };
  }

  const repackFloor = input.repackFloor !== false;
  if (repackFloor) {
    const allMemberIds = [
      ...((existingMembers ?? []) as Array<{ table_id: string }>).map((row) => row.table_id),
      input.tableId,
    ];
    const groupDates = resolveMergeGroupDateRange(group);
    const packLayoutDate = input.layoutDate ?? groupDates.startDate;
    const packResult = await packMergeGroupTablesOnFloor(client, group.area_id, allMemberIds, {
      layoutDate: packLayoutDate,
      mergeGroupId: group.id,
    });
    let message = `Đã thêm bàn ${table.name} vào ${group.merged_name}.`;
    if (!packResult.packed) {
      message +=
        " Chưa xếp được cụm trên sơ đồ — kéo bàn vào ô \"+\" trong chế độ chỉnh sửa.";
    }
    return { ok: true, message };
  }

  return { ok: true, message: `Đã thêm bàn ${table.name} vào ${group.merged_name}.` };
}

export async function removeTableFromMergeGroupInSupabase(input: {
  groupId: string;
  tableId: string;
  repackFloor?: boolean;
  layoutDate?: string;
}): Promise<Result> {
  const client = ensureClient();
  const { data: group, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .select("id, status, merged_name, area_id, start_date, end_date, created_at")
    .eq("id", input.groupId)
    .maybeSingle();
  if (groupErr || !group) {
    return { ok: false, message: groupErr?.message ?? "Không tìm thấy cụm bàn gộp." };
  }
  if (group.status !== "active") {
    return { ok: false, message: "Cụm bàn gộp đã được giải tán." };
  }

  const { data: members, error: membersErr } = await (client as any)
    .from("table_merge_members")
    .select("table_id, tables(id, name)")
    .eq("group_id", group.id);
  if (membersErr) {
    return { ok: false, message: membersErr.message };
  }
  const memberRows = (members ?? []) as Array<{
    table_id: string;
    tables: { id: string; name: string } | { id: string; name: string }[] | null;
  }>;
  const target = memberRows.find((row) => row.table_id === input.tableId);
  if (!target) {
    return { ok: false, message: "Bàn không thuộc cụm bàn gộp này." };
  }
  if (memberRows.length <= 2) {
    // Removing one of the last two members effectively dissolves the group.
    return await releaseTableMergeGroupInSupabase({ groupId: group.id });
  }

  const { error: delErr } = await (client as any)
    .from("table_merge_members")
    .delete()
    .eq("group_id", group.id)
    .eq("table_id", input.tableId);
  if (delErr) {
    return { ok: false, message: delErr.message };
  }

  const remainingIds = memberRows
    .filter((row) => row.table_id !== input.tableId)
    .map((row) => row.table_id);
  const repackFloor = input.repackFloor !== false;
  const targetJoin = Array.isArray(target.tables) ? target.tables[0] : target.tables;
  let message = `Đã tách bàn ${targetJoin?.name ?? "bàn"} khỏi ${group.merged_name}.`;
  if (repackFloor && remainingIds.length >= 2) {
    const groupDates = resolveMergeGroupDateRange(group);
    const packResult = await packMergeGroupTablesOnFloor(client, group.area_id, remainingIds, {
      layoutDate: input.layoutDate ?? groupDates.startDate,
      mergeGroupId: group.id,
    });
    if (!packResult.packed) {
      message += " Cụm còn lại chưa được xếp lại trên sơ đồ tự động.";
    }
  }

  return { ok: true, message };
}

const RELEASE_BLOCKING_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "seated",
  "checked_in",
];

export async function updateTableMergeGroupDatesInSupabase(input: {
  groupId: string;
  startDate: string;
  endDate: string;
}): Promise<Result> {
  const client = ensureClient();
  const dateCheck = validateMergeGroupDateRange({
    startDate: input.startDate,
    endDate: input.endDate,
  });
  if (!dateCheck.ok) {
    return { ok: false, message: dateCheck.message };
  }

  const { data: group, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .select("id, status, merged_name")
    .eq("id", input.groupId)
    .maybeSingle();
  if (groupErr || !group) {
    return { ok: false, message: groupErr?.message ?? "Không tìm thấy cụm bàn gộp." };
  }
  if (group.status !== "active") {
    return { ok: false, message: "Cụm bàn gộp đã được giải tán, không thể đổi ngày." };
  }

  const { data: members, error: membersErr } = await (client as any)
    .from("table_merge_members")
    .select("table_id")
    .eq("group_id", input.groupId);
  if (membersErr) {
    return { ok: false, message: membersErr.message };
  }
  const tableIds = ((members ?? []) as Array<{ table_id: string }>).map((row) => row.table_id);
  const lockCheck = await ensureTablesAreFreeToMerge(client, tableIds, {
    startDate: input.startDate,
    endDate: input.endDate,
  }, { excludeGroupId: input.groupId });
  if (!lockCheck.ok) {
    return { ok: false, message: lockCheck.message };
  }

  const { data: activeBookings, error: bookingsErr } = await (client as any)
    .from("bookings")
    .select("id, booking_at")
    .eq("merge_group_id", input.groupId)
    .in("status", RELEASE_BLOCKING_BOOKING_STATUSES);
  if (bookingsErr) {
    return { ok: false, message: bookingsErr.message };
  }
  const outOfRange = ((activeBookings ?? []) as Array<{ id: string; booking_at: string }>).filter(
    (row) => {
      const bookingDay = formatMergeGroupDate(row.booking_at);
      return !mergeDateRangesOverlap(
        bookingDay,
        bookingDay,
        input.startDate,
        input.endDate
      );
    }
  );
  if (outOfRange.length > 0) {
    return {
      ok: false,
      message: `Không thể thu hẹp khoảng ngày: còn ${outOfRange.length} booking đang giữ cụm ngoài khoảng mới. Hãy đổi ngày booking hoặc mở rộng khoảng hiệu lực.`,
    };
  }

  const { error: updateErr } = await (client as any)
    .from("table_merge_groups")
    .update({
      start_date: input.startDate,
      end_date: input.endDate,
      updated_at: dayjs().toISOString(),
    })
    .eq("id", input.groupId);
  if (updateErr) {
    return { ok: false, message: updateErr.message };
  }

  return {
    ok: true,
    message: `Đã cập nhật hiệu lực ${group.merged_name}: ${input.startDate} → ${input.endDate}.`,
  };
}

/** Dissolve active merge groups whose end date is before today (calendar day). */
export async function releaseExpiredTableMergeGroupsInSupabase(): Promise<Result & {
  releasedCount?: number;
}> {
  const client = ensureClient();
  const today = dayjs().format("YYYY-MM-DD");
  const { data: expiredRows, error } = await (client as any)
    .from("table_merge_groups")
    .select("id, merged_name")
    .eq("status", "active")
    .lt("end_date", today);
  if (error) {
    return { ok: false, message: error.message };
  }
  const rows = (expiredRows ?? []) as Array<{ id: string; merged_name: string }>;
  if (rows.length === 0) {
    return { ok: true, message: "Không có cụm bàn gộp hết hạn.", releasedCount: 0 };
  }

  let releasedCount = 0;
  const failures: string[] = [];
  for (const row of rows) {
    const result = await releaseTableMergeGroupInSupabase({ groupId: row.id });
    if (result.ok) {
      releasedCount += 1;
    } else {
      failures.push(`${row.merged_name}: ${result.message}`);
    }
  }

  if (failures.length > 0) {
    return {
      ok: releasedCount > 0,
      releasedCount,
      message:
        releasedCount > 0
          ? `Đã giải tán ${releasedCount} cụm hết hạn. Một số cụm chưa giải tán được: ${failures.join("; ")}`
          : failures.join("; "),
    };
  }

  return {
    ok: true,
    releasedCount,
    message: `Đã tự giải tán ${releasedCount} cụm bàn gộp hết hạn.`,
  };
}

const SPLIT_CLONE_MAINTENANCE_ACTIVE_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "seated",
  "checked_in",
];

/** Delete split-clone rows whose end date is before today (calendar day). */
export async function deleteExpiredTableSplitClonesInSupabase(): Promise<Result & {
  deletedCount?: number;
  skippedCount?: number;
}> {
  const client = ensureClient();
  const today = dayjs().format("YYYY-MM-DD");
  const { data: expiredRows, error } = await client
    .from("tables")
    .select("id, name")
    .not("split_source_table_id", "is", null)
    .lt("split_end_date", today);
  if (error) {
    return { ok: false, message: error.message };
  }
  const rows = (expiredRows ?? []) as Array<{ id: string; name: string }>;
  if (rows.length === 0) {
    return { ok: true, message: "Không có bàn tách hết hạn.", deletedCount: 0, skippedCount: 0 };
  }

  let deletedCount = 0;
  let skippedCount = 0;
  const failures: string[] = [];

  for (const row of rows) {
    const { count: activeBookingCount, error: bookingErr } = await client
      .from("bookings")
      .select("*", { count: "exact", head: true })
      .eq("table_id", row.id)
      .in("status", SPLIT_CLONE_MAINTENANCE_ACTIVE_BOOKING_STATUSES);
    if (bookingErr) {
      failures.push(`${row.name}: ${bookingErr.message}`);
      continue;
    }
    if ((activeBookingCount ?? 0) > 0) {
      skippedCount += 1;
      failures.push(
        `${row.name}: còn ${activeBookingCount} booking đang giữ — chuyển hoặc kết thúc trước khi gỡ tách.`
      );
      continue;
    }
    try {
      await deleteTableInSupabase(row.id);
      deletedCount += 1;
    } catch (deleteErr) {
      const message =
        deleteErr instanceof Error ? deleteErr.message : "Không xóa được bàn tách.";
      failures.push(`${row.name}: ${message}`);
    }
  }

  if (failures.length > 0) {
    return {
      ok: deletedCount > 0,
      deletedCount,
      skippedCount,
      message:
        deletedCount > 0
          ? `Đã gỡ ${deletedCount} bàn tách hết hạn. Chưa gỡ được: ${failures.join("; ")}`
          : failures.join("; "),
    };
  }

  return {
    ok: true,
    deletedCount,
    skippedCount,
    message: `Đã tự gỡ ${deletedCount} bàn tách hết hạn.`,
  };
}

export async function releaseTableMergeGroupInSupabase(input: {
  groupId: string;
}): Promise<Result> {
  const client = ensureClient();
  const { data: group, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .select("id, branch_id, area_id, status, merged_name")
    .eq("id", input.groupId)
    .maybeSingle();
  if (groupErr || !group) {
    return { ok: false, message: groupErr?.message ?? "Không tìm thấy cụm bàn gộp." };
  }
  if (group.status !== "active") {
    return { ok: true, message: "Cụm bàn gộp đã được giải tán trước đó." };
  }

  const { data: memberRows, error: membersErr } = await (client as any)
    .from("table_merge_members")
    .select("table_id")
    .eq("group_id", group.id);
  if (membersErr) {
    return { ok: false, message: membersErr.message };
  }
  const memberTableIds = ((memberRows ?? []) as Array<{ table_id: string }>).map(
    (row) => row.table_id
  );

  const { data: activeBookings, error: bookingsErr } = await (client as any)
    .from("bookings")
    .select("id, guest_count, status, start_time, end_time")
    .eq("merge_group_id", group.id)
    .in("status", RELEASE_BLOCKING_BOOKING_STATUSES);
  if (bookingsErr) {
    return { ok: false, message: bookingsErr.message };
  }
  const activeRows = (activeBookings ?? []) as Array<{
    id: string;
    guest_count: number;
    status: BookingStatus;
    start_time: string;
    end_time: string;
  }>;
  for (const booking of activeRows) {
    let assignedTableId: string | null = null;
    for (const candidateId of memberTableIds) {
      const conflicts = await findTableBookingSlotConflictsInSupabase(client, {
        bookingId: booking.id,
        tableId: candidateId,
        startTime: booking.start_time,
        endTime: booking.end_time,
      });
      if (conflicts.length === 0) {
        assignedTableId = candidateId;
        break;
      }
    }
    const patch: Record<string, unknown> = {
      merge_group_id: null,
    };
    if (assignedTableId) {
      patch.table_id = assignedTableId;
    } else {
      patch.table_id = null;
      patch.area_id = null;
      patch.status = "pending";
      patch.checked_in_at = null;
    }
    const { error: bookingUpdateErr } = await (client as any)
      .from("bookings")
      .update(patch)
      .eq("id", booking.id);
    if (bookingUpdateErr) {
      return { ok: false, message: bookingUpdateErr.message };
    }
    if (assignedTableId) {
      await refreshTableAvailabilityForBooking(client, assignedTableId);
    }
  }

  const { error: releaseErr } = await (client as any)
    .from("table_merge_groups")
    .update({
      status: "released",
      released_at: dayjs().toISOString(),
      updated_at: dayjs().toISOString(),
    })
    .eq("id", group.id);
  if (releaseErr) {
    return { ok: false, message: releaseErr.message };
  }

  await deleteMergeManagedFloorLayoutsForGroupInSupabase(group.id);

  return { ok: true, message: `Đã giải tán ${group.merged_name}.` };
}

export async function listTableMergeGroupsInSupabase(branchId: string): Promise<TableMergeGroup[]> {
  const client = ensureClient();
  const { data: groups, error: groupsErr } = await (client as any)
    .from("table_merge_groups")
    .select(
      "id, branch_id, area_id, auto_number, merged_name, status, created_at, released_at, start_date, end_date"
    )
    .eq("branch_id", branchId)
    .eq("status", "active")
    .order("auto_number", { ascending: true });
  if (groupsErr || !groups) {
    return [];
  }

  const typedGroups = (groups ?? []) as TableMergeGroupRowLike[];
  const groupIds = typedGroups.map((group) => group.id);
  if (groupIds.length === 0) {
    return [];
  }
  const { data: members } = await (client as any)
    .from("table_merge_members")
    .select("group_id, table_id, order_index")
    .in("group_id", groupIds)
    .order("order_index", { ascending: true });
  const typedMembers = (members ?? []) as Array<{
    group_id: string;
    table_id: string;
    order_index: number;
  }>;
  return typedGroups.map((group) =>
    mapTableMergeGroupFromRow(
      group,
      typedMembers
        .filter((member) => member.group_id === group.id)
        .map((member) => member.table_id)
    )
  );
}

export async function runBookingMaintenanceInSupabase(): Promise<Result & {
  reconciledTableCount?: number;
}> {
  const client = ensureClient();
  const { data, error } = await (client as any).rpc("run_booking_maintenance");
  if (error) {
    return { ok: false, message: error.message };
  }
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    const reconcile = await reconcileOrphanTableStatusesInSupabase();
    return {
      ok: reconcile.ok,
      reconciledTableCount: reconcile.reconciledCount,
      message: reconcile.ok
        ? `Đã chạy tác vụ bảo trì booking. ${reconcile.message}`
        : reconcile.message,
    };
  }
  const noShowCount = Number((payload as { no_show_count?: number }).no_show_count ?? 0);
  const lateCount = Number((payload as { late_count?: number }).late_count ?? 0);
  const expiredOfferCount = Number((payload as { expired_offer_count?: number }).expired_offer_count ?? 0);
  const promotedCount = Number((payload as { promoted_count?: number }).promoted_count ?? 0);

  if (noShowCount > 0 || lateCount > 0) {
    const maintenanceWindowStart = dayjs().subtract(5, "minute").toISOString();
    await Promise.all([
      refreshTablesTouchedByRecentNoShows(client, maintenanceWindowStart),
      lateCount > 0
        ? refreshTablesTouchedByRecentLateMarks(client, maintenanceWindowStart)
        : Promise.resolve(),
    ]);
  }

  const [staleSeatedCompleted, reconcile] = await Promise.all([
    autoCompleteStaleSeatedBookings(client),
    reconcileOrphanTableStatusesInSupabase(),
  ]);

  const reconcileNote = reconcile.reconciledCount
    ? `, ${reconcile.reconciledCount} bàn trạng thái đã đồng bộ`
    : "";

  return {
    ok: reconcile.ok,
    reconciledTableCount: reconcile.reconciledCount,
    message: reconcile.ok
      ? `Bảo trì xong: ${lateCount} trễ, ${noShowCount} không đến (cuối ngày), ${expiredOfferCount} offer hết hạn, ${promotedCount} lượt promotion, ${staleSeatedCompleted} bàn Đã ngồi tự hoàn thành${reconcileNote}.`
      : reconcile.message,
  };
}

/** Fix tables stuck on hold/occupied with no active booking (cron-driven). */
export async function reconcileOrphanTableStatusesInSupabase(): Promise<Result & {
  reconciledCount?: number;
}> {
  const client = ensureClient();
  const [{ data: tableRows, error: tablesError }, { data: bookingRows, error: bookingsError }] =
    await Promise.all([
      client.from("tables").select("id, status"),
      client.from("bookings").select("id, table_id, status"),
    ]);
  if (tablesError) {
    return { ok: false, message: tablesError.message };
  }
  if (bookingsError) {
    return { ok: false, message: bookingsError.message };
  }

  const bookingsForPicker = ((bookingRows ?? []) as Array<{
    id: string;
    table_id: string | null;
    status: BookingStatus;
  }>).map(
    (row): Booking => ({
      id: row.id,
      customerId: "",
      branchId: "",
      areaId: null,
      tableId: row.table_id,
      guestCount: 0,
      bookingAt: "",
      startTime: "",
      endTime: "",
      createdByUserId: "",
      status: row.status,
    })
  );

  const orphanTableIds = (tableRows ?? [])
    .filter((item) => {
      const status = item.status as TableStatus;
      if (status === "locked") {
        return false;
      }
      if (status !== "hold" && status !== "late" && status !== "occupied") {
        return false;
      }
      return pickPrimaryBookingOnTable(item.id, bookingsForPicker) === null;
    })
    .map((item) => item.id)
    .slice(0, ORPHAN_TABLE_RECONCILE_BATCH_SIZE);

  if (orphanTableIds.length === 0) {
    return { ok: true, message: "Không có bàn trạng thái lệch.", reconciledCount: 0 };
  }

  await Promise.all(orphanTableIds.map((id) => refreshTableAvailabilityForBooking(client, id)));
  return {
    ok: true,
    reconciledCount: orphanTableIds.length,
    message: `Đã đồng bộ ${orphanTableIds.length} bàn trạng thái lệch.`,
  };
}

export type TableLayoutMaintenanceResult = {
  ok: boolean;
  message: string;
  merge: Result & { releasedCount?: number };
  split: Result & { deletedCount?: number; skippedCount?: number };
  locks: Result & { deletedCount?: number };
  layouts: Result & { deletedCount?: number };
};

/** Dissolves expired merge groups, deletes expired split clones, and cleans layout debris. */
export async function runTableLayoutExpiryMaintenance(): Promise<TableLayoutMaintenanceResult> {
  const [merge, split, locks, layouts] = await Promise.all([
    releaseExpiredTableMergeGroupsInSupabase(),
    deleteExpiredTableSplitClonesInSupabase(),
    deleteExpiredFloorLayoutLocksInSupabase(),
    cleanupOrphanMergeManagedFloorLayoutsInSupabase(),
  ]);
  const ok = merge.ok && split.ok && locks.ok && layouts.ok;
  const parts = [merge.message, split.message, locks.message, layouts.message].filter(Boolean);
  return {
    ok,
    message: parts.join(" | "),
    merge,
    split,
    locks,
    layouts,
  };
}

/** Remove edit locks past their TTL. */
export async function deleteExpiredFloorLayoutLocksInSupabase(): Promise<Result & {
  deletedCount?: number;
}> {
  const client = ensureClient();
  const { data, error } = await client
    .from("floor_layout_edit_locks")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("area_id");
  if (error) {
    return { ok: false, message: error.message };
  }
  const deletedCount = data?.length ?? 0;
  return {
    ok: true,
    deletedCount,
    message:
      deletedCount > 0
        ? `Đã xóa ${deletedCount} khóa chỉnh sơ đồ hết hạn.`
        : "Không có khóa chỉnh sơ đồ hết hạn.",
  };
}

/** Delete per-day floor layouts tied to merge groups that are no longer valid. */
export async function cleanupOrphanMergeManagedFloorLayoutsInSupabase(): Promise<Result & {
  deletedCount?: number;
}> {
  const client = ensureClient();
  const { data: rows, error } = await client
    .from("area_floor_layout_by_date")
    .select("id, layout_date, merge_group_id")
    .not("merge_group_id", "is", null);
  if (error) {
    return { ok: false, message: error.message };
  }
  if (!rows?.length) {
    return { ok: true, message: "Không có sơ đồ ngày gộp bàn cần dọn.", deletedCount: 0 };
  }

  const orphanIds: string[] = [];
  for (const row of rows as Array<{ id: string; layout_date: string; merge_group_id: string }>) {
    const stillValid = await isMergeManagedDayLayoutStillValid(
      client,
      row.layout_date,
      row.merge_group_id
    );
    if (!stillValid) {
      orphanIds.push(row.id);
    }
  }

  if (orphanIds.length === 0) {
    return { ok: true, message: "Không có sơ đồ ngày gộp bàn cần dọn.", deletedCount: 0 };
  }

  const { error: deleteError } = await client
    .from("area_floor_layout_by_date")
    .delete()
    .in("id", orphanIds);
  if (deleteError) {
    return { ok: false, message: deleteError.message };
  }

  return {
    ok: true,
    deletedCount: orphanIds.length,
    message: `Đã xóa ${orphanIds.length} sơ đồ ngày gộp bàn không còn hiệu lực.`,
  };
}

export async function upsertTableInSupabase(input: {
  id?: string;
  branchId: string;
  areaId: string;
  name: string;
  status: TableStatus;
  positionX: number;
  positionY: number;
}): Promise<DiningTable> {
  const client = ensureClient();
  const row = {
    branch_id: input.branchId,
    area_id: input.areaId,
    name: input.name,
    status: input.status,
    position_x: input.positionX,
    position_y: input.positionY,
  };

  if (input.id) {
    const { data, error } = await client
      .from("tables")
      .update(row)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      throw new Error("Không tìm thấy bàn sau khi cập nhật.");
    }
    return mapDiningTableFromRow(data);
  }

  const { data, error } = await client.from("tables").insert(row).select("*").single();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Không tạo được bàn.");
  }
  return mapDiningTableFromRow(data);
}

export async function upsertTablesBatchInSupabase(
  inputs: Array<{
    id?: string;
    branchId: string;
    areaId: string;
    name: string;
    status: TableStatus;
    positionX: number;
    positionY: number;
  }>
): Promise<DiningTable[]> {
  const client = ensureClient();
  if (inputs.length === 0) {
    return [];
  }

  const updates = inputs.filter((item) => item.id);
  const inserts = inputs.filter((item) => !item.id);
  const results: DiningTable[] = [];

  for (const item of updates) {
    const { data, error } = await client
      .from("tables")
      .update({
        branch_id: item.branchId,
        area_id: item.areaId,
        name: item.name,
        status: item.status,
        position_x: item.positionX,
        position_y: item.positionY,
      })
      .eq("id", item.id as string)
      .select("*")
      .single();
    if (error) {
      throw new Error(error.message);
    }
    if (data) {
      results.push(mapDiningTableFromRow(data));
    }
  }

  if (inserts.length > 0) {
    const { data, error } = await client.from("tables").insert(
      inserts.map((item) => ({
        branch_id: item.branchId,
        area_id: item.areaId,
        name: item.name,
        status: item.status,
        position_x: item.positionX,
        position_y: item.positionY,
      }))
    ).select("*");
    if (error) {
      throw new Error(error.message);
    }
    for (const row of data ?? []) {
      results.push(mapDiningTableFromRow(row));
    }
  }

  return results;
}

export async function updateTableStatusInSupabase(
  tableId: string,
  status: TableStatus
): Promise<void> {
  const client = ensureClient();
  await client.from("tables").update({ status }).eq("id", tableId);
}

export async function deleteTableInSupabase(tableId: string): Promise<void> {
  const client = ensureClient();
  await client.from("tables").delete().eq("id", tableId);
}

export async function deleteTablesInSupabase(tableIds: string[]): Promise<void> {
  const client = ensureClient();
  if (tableIds.length === 0) {
    return;
  }
  await client.from("tables").delete().in("id", tableIds);
}

export async function updateTablePositionInSupabase(
  tableId: string,
  x: number,
  y: number
): Promise<void> {
  const client = ensureClient();
  await client
    .from("tables")
    .update({ position_x: Math.round(x), position_y: Math.round(y) })
    .eq("id", tableId);
}

export async function addAreaInSupabase(branchId: string, name: string): Promise<Area> {
  const client = ensureClient();
  const { data, error } = await client
    .from("areas")
    .insert({
      branch_id: branchId,
      name,
      floor_grid_columns: 12,
      floor_grid_rows: 8,
      floor_node_spacing: FLOOR_DEFAULT_NODE_SPACING_PX,
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Không tạo được khu vực.");
  }
  return mapAreaFromRow(data);
}

export async function updateAreaInSupabase(
  areaId: string,
  input: { branchId?: string; name?: string }
): Promise<Result> {
  const client = ensureClient();
  const patch: {
    name?: string;
    branch_id?: string;
  } = {};
  if (input.name !== undefined) {
    patch.name = input.name;
  }
  if (input.branchId !== undefined) {
    patch.branch_id = input.branchId;
  }
  if (Object.keys(patch).length === 0) {
    return { ok: true, message: "Không có thay đổi." };
  }
  const { error } = await client.from("areas").update(patch).eq("id", areaId);
  if (error) {
    return { ok: false, message: error.message };
  }
  if (input.branchId !== undefined) {
    await client.from("tables").update({ branch_id: input.branchId }).eq("area_id", areaId);
    await client.from("bookings").update({ branch_id: input.branchId }).eq("area_id", areaId);
  }
  return { ok: true, message: "Đã cập nhật khu vực." };
}

export async function deleteAreaInSupabase(areaId: string): Promise<Result> {
  const client = ensureClient();

  const { count: tableCount } = await client
    .from("tables")
    .select("*", { count: "exact", head: true })
    .eq("area_id", areaId);

  const { count: bookingCount } = await client
    .from("bookings")
    .select("*", { count: "exact", head: true })
    .eq("area_id", areaId);

  if ((tableCount ?? 0) > 0 || (bookingCount ?? 0) > 0) {
    return {
      ok: false,
      message: `Không thể xóa: còn ${tableCount ?? 0} bàn và ${bookingCount ?? 0} đặt bàn gắn khu vực này.`,
    };
  }

  await client.from("floor_layout_edit_locks").delete().eq("area_id", areaId);
  await client.from("floor_backgrounds").delete().eq("area_id", areaId);
  await client.from("area_floor_layout_by_date").delete().eq("area_id", areaId);
  await client.from("floor_layout_template_selections").delete().eq("area_id", areaId);
  await client.from("floor_layout_templates").delete().eq("area_id", areaId);

  const { error } = await client.from("areas").delete().eq("id", areaId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã xóa khu vực." };
}

export type FloorLayoutSaveOptions = {
  /** When set, persists to per-day override only (does not mutate global areas/tables). */
  layoutDate?: string;
  updatedByUserId?: string | null;
  sourceTemplateId?: string | null;
  /** null clears merge auto-management when saving a manual layout. */
  mergeGroupId?: string | null;
};

export async function updateAreaFloorLayoutInSupabase(
  areaId: string,
  input: {
    floorGridColumns: number;
    floorGridRows: number;
    floorNodeSpacing: number;
  },
  options?: FloorLayoutSaveOptions
): Promise<void> {
  const layoutDate = options?.layoutDate?.trim();
  if (layoutDate) {
    const existing = await fetchAreaFloorLayoutForDateInSupabase(areaId, layoutDate);
    const { data: area } = await ensureClient()
      .from("areas")
      .select("floor_grid_columns, floor_grid_rows, floor_node_spacing")
      .eq("id", areaId)
      .maybeSingle();
    const { data: tables } = await ensureClient()
      .from("tables")
      .select("id, position_x, position_y")
      .eq("area_id", areaId);
    const baseSnapshot = existing
      ? {
          floorGridColumns: existing.floorGridColumns,
          floorGridRows: existing.floorGridRows,
          floorNodeSpacing: existing.floorNodeSpacing,
          tablePositions: Object.entries(existing.tablePositions).map(([tableId, pos]) => ({
            tableId,
            x: pos.x,
            y: pos.y,
          })),
        }
      : snapshotFromGlobalArea(
          {
            floorGridColumns:
              typeof area?.floor_grid_columns === "number" ? area.floor_grid_columns : 12,
            floorGridRows: typeof area?.floor_grid_rows === "number" ? area.floor_grid_rows : 8,
            floorNodeSpacing:
              typeof area?.floor_node_spacing === "number"
                ? area.floor_node_spacing
                : FLOOR_DEFAULT_NODE_SPACING_PX,
          },
          (tables ?? []).map((row) => ({
            id: row.id,
            branchId: "",
            areaId,
            name: "",
            status: "available" as const,
            positionX: row.position_x,
            positionY: row.position_y,
          }))
        );
    await upsertAreaFloorLayoutForDateInSupabase(
      areaId,
      layoutDate,
      normalizeFloorLayoutSnapshot({
        ...baseSnapshot,
        floorGridColumns: input.floorGridColumns,
        floorGridRows: input.floorGridRows,
        floorNodeSpacing: input.floorNodeSpacing,
      }),
      {
        sourceTemplateId: options?.sourceTemplateId ?? existing?.sourceTemplateId ?? null,
        updatedByUserId: options?.updatedByUserId ?? null,
        mergeGroupId: options?.mergeGroupId ?? existing?.mergeGroupId ?? null,
      }
    );
    return;
  }

  const client = ensureClient();
  const { error } = await client
    .from("areas")
    .update({
      floor_grid_columns: input.floorGridColumns,
      floor_grid_rows: input.floorGridRows,
      floor_node_spacing: input.floorNodeSpacing,
    })
    .eq("id", areaId);
  if (error) {
    throw new Error(error.message);
  }
}

export type SaveFloorLayoutInput = {
  floorGridColumns: number;
  floorGridRows: number;
  floorNodeSpacing: number;
  /** All tables in this area; positions use grid indices (or `FLOOR_TABLE_PALETTE_SENTINEL` / -1 for palette). */
  tablePositions: Array<{ tableId: string; x: number; y: number }>;
};

async function tablePositionsScopedToArea(
  client: ReturnType<typeof ensureClient>,
  areaId: string,
  tablePositions: Array<{ tableId: string; x: number; y: number }>
): Promise<Array<{ tableId: string; x: number; y: number }>> {
  const { data: areaTables, error } = await client
    .from("tables")
    .select("id")
    .eq("area_id", areaId);
  if (error) {
    throw new Error(error.message);
  }
  const tableIdsInArea = new Set((areaTables ?? []).map((row) => row.id));
  return tablePositions.filter((row) => tableIdsInArea.has(row.tableId));
}

/** Persists grid metadata and all table positions for a floor in one logical save. */
export async function saveFloorLayoutToSupabase(
  areaId: string,
  input: SaveFloorLayoutInput,
  options?: FloorLayoutSaveOptions
): Promise<AreaFloorLayoutByDate | void> {
  const client = ensureClient();
  const scopedTablePositions = await tablePositionsScopedToArea(
    client,
    areaId,
    input.tablePositions
  );
  const layoutDate = options?.layoutDate?.trim();
  if (layoutDate) {
    return upsertAreaFloorLayoutForDateInSupabase(
      areaId,
      layoutDate,
      normalizeFloorLayoutSnapshot({
        floorGridColumns: input.floorGridColumns,
        floorGridRows: input.floorGridRows,
        floorNodeSpacing: input.floorNodeSpacing,
        tablePositions: scopedTablePositions,
      }),
      {
        sourceTemplateId: options?.sourceTemplateId ?? null,
        updatedByUserId: options?.updatedByUserId ?? null,
        mergeGroupId: options?.mergeGroupId ?? null,
      }
    );
  }

  await updateAreaFloorLayoutInSupabase(areaId, {
    floorGridColumns: input.floorGridColumns,
    floorGridRows: input.floorGridRows,
    floorNodeSpacing: input.floorNodeSpacing,
  });
  if (scopedTablePositions.length === 0) {
    return;
  }
  await Promise.all(
    scopedTablePositions.map((row) =>
      updateTablePositionInSupabase(row.tableId, row.x, row.y)
    )
  );
}

const LOCK_TTL_MS = 3 * 60 * 1000;

async function deleteExpiredFloorLayoutLocks(client: ReturnType<typeof ensureClient>) {
  await client.from("floor_layout_edit_locks").delete().lt("expires_at", new Date().toISOString());
}

export async function tryAcquireFloorLayoutLockInSupabase(
  areaId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; holderFullName: string }> {
  const client = ensureClient();
  await deleteExpiredFloorLayoutLocks(client);
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();

  const { data: row } = await client
    .from("floor_layout_edit_locks")
    .select("user_id, expires_at")
    .eq("area_id", areaId)
    .maybeSingle();

  if (!row) {
    const { error } = await client.from("floor_layout_edit_locks").insert({
      area_id: areaId,
      user_id: userId,
      expires_at: expiresAt,
    });
    if (error) {
      throw new Error(error.message);
    }
    return { ok: true };
  }

  if (row.user_id === userId) {
    await client
      .from("floor_layout_edit_locks")
      .update({ expires_at: expiresAt })
      .eq("area_id", areaId);
    return { ok: true };
  }

  if (new Date(row.expires_at) > new Date()) {
    const holder = await getAppUserServer(row.user_id as string);
    const holderFullName = holder?.fullName ?? "Người dùng khác";
    return {
      ok: false,
      holderFullName,
    };
  }

  const { error: upErr } = await client
    .from("floor_layout_edit_locks")
    .update({ user_id: userId, expires_at: expiresAt })
    .eq("area_id", areaId);
  if (upErr) {
    throw new Error(upErr.message);
  }
  return { ok: true };
}

export async function renewFloorLayoutLockInSupabase(
  areaId: string,
  userId: string
): Promise<void> {
  const client = ensureClient();
  await deleteExpiredFloorLayoutLocks(client);
  const expiresAt = new Date(Date.now() + LOCK_TTL_MS).toISOString();
  await client
    .from("floor_layout_edit_locks")
    .update({ expires_at: expiresAt })
    .eq("area_id", areaId)
    .eq("user_id", userId);
}

export async function releaseFloorLayoutLockInSupabase(
  areaId: string,
  userId: string
): Promise<void> {
  const client = ensureClient();
  await client
    .from("floor_layout_edit_locks")
    .delete()
    .eq("area_id", areaId)
    .eq("user_id", userId);
}

export async function getFloorLayoutLockInfoInSupabase(areaId: string): Promise<{
  userId: string;
  fullName: string;
  expiresAt: string;
} | null> {
  const client = ensureClient();
  await deleteExpiredFloorLayoutLocks(client);
  const { data: row } = await client
    .from("floor_layout_edit_locks")
    .select("user_id, expires_at")
    .eq("area_id", areaId)
    .maybeSingle();
  if (!row) {
    return null;
  }
  const holder = await getAppUserServer(row.user_id as string);
  const fullName = holder?.fullName ?? "?";
  return {
    userId: row.user_id as string,
    fullName,
    expiresAt: row.expires_at as string,
  };
}

export async function addUserInSupabase(payload: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  branchIds: string[];
  actorUserId?: string;
}): Promise<Result> {
  return addAppUserServer(payload);
}

export async function updateUserInSupabase(
  userId: string,
  payload: {
    username: string;
    password?: string;
    fullName: string;
    role: Role;
    branchIds: string[];
    actorUserId?: string;
  }
): Promise<Result> {
  return updateAppUserServer(userId, payload);
}

export async function deleteUserInSupabase(userId: string): Promise<Result> {
  return deleteAppUserServer(userId);
}

export async function markNotificationReadInSupabase(id: string): Promise<void> {
  const client = ensureClient();
  const { error } = await client
    .from("internal_notifications")
    .update({ is_read: true })
    .eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function markNotificationsReadBatchInSupabase(ids: string[]): Promise<void> {
  if (ids.length === 0) {
    return;
  }
  const client = ensureClient();
  const { error } = await client
    .from("internal_notifications")
    .update({ is_read: true })
    .in("id", ids);
  if (error) {
    throw new Error(error.message);
  }
}
