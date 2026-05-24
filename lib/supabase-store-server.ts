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
import type { Database } from "./database.types";
import { initialState } from "./initial-state";
import { createSupabaseAdmin } from "./supabase-admin";
import {
  bookingSlotKey,
  type BookingDuplicateInfo,
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
  isSyntheticPhoneValue,
  pickPrimaryBookingOnTable,
  stripUnknownGuestTag,
} from "./booking-meta";
import {
  FLOOR_DEFAULT_NODE_SPACING_PX,
} from "./floor-map-layout";
import { packMergeGroupTablePositions } from "./floor-map-merge-layout";
import {
  formatTableGuestCapacityHint,
  getMergeGroupEffectiveGuestCapacity,
  getTableEffectiveGuestCapacity,
  tableFitsGuestCount,
} from "./table-capacity";
import {
  AppStateSnapshot,
  AppUser,
  BookingRuntimeSettings,
  BookingStatus,
  BookingWaitlistEntry,
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
};

type BookingCreateOrQueueResult =
  | {
      outcome: "confirmed";
      message?: string | null;
      booking_id: string;
      start_time: string;
      end_time: string;
    }
  | {
      outcome: "waitlisted";
      message?: string | null;
      waitlist_id: string;
      start_time: string;
      end_time: string;
    };

const ACTIVE_TABLE_SLOT_STATUSES: BookingStatus[] = ["confirmed", "seated", "checked_in"];
const BOOKING_MAINTENANCE_INTERVAL_MS = 60_000;
let lastBookingMaintenanceAt = 0;
let bookingMaintenanceInFlight: Promise<void> | null = null;

async function maybeRunBookingMaintenance(force = false): Promise<void> {
  if (
    !force &&
    Date.now() - lastBookingMaintenanceAt < BOOKING_MAINTENANCE_INTERVAL_MS
  ) {
    return;
  }
  if (bookingMaintenanceInFlight) {
    await bookingMaintenanceInFlight;
    if (!force) {
      return;
    }
  }
  if (
    !force &&
    Date.now() - lastBookingMaintenanceAt < BOOKING_MAINTENANCE_INTERVAL_MS
  ) {
    return;
  }
  bookingMaintenanceInFlight = runBookingMaintenanceInSupabase()
    .then((result) => {
      if (result.ok) {
        lastBookingMaintenanceAt = Date.now();
      }
    })
    .finally(() => {
      bookingMaintenanceInFlight = null;
    });
  await bookingMaintenanceInFlight;
}
const TERMINAL_CANCEL_STATUSES: BookingStatus[] = ["cancelled", "no_show"];

/** Bookings that tie a table (show as hold or occupied, not trống). */
const TABLE_RESERVATION_BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
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
    waitlistOfferTtlMinutes:
      typeof data.waitlist_offer_ttl_minutes === "number"
        ? data.waitlist_offer_ttl_minutes
        : DEFAULT_BOOKING_RUNTIME_SETTINGS.waitlistOfferTtlMinutes,
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
  };
}

async function getBookingRuntimeSettings(
  client: ReturnType<typeof ensureClient>
): Promise<BookingRuntimeSettings> {
  const { data, error } = await (client as any)
    .from("booking_runtime_settings")
    .select(
      "standard_turnaround_minutes, no_show_grace_minutes, waitlist_offer_ttl_minutes, group_party_guest_threshold, repeat_customer_min_completed, reception_arrival_grace_minutes"
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
      waitlist_offer_ttl_minutes: input.waitlistOfferTtlMinutes,
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
    .filter((row) => {
      const customerJoin = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      const bookingPhone = customerJoin?.phone ? normalizeVietnamPhone(customerJoin.phone) : "";
      const phoneMatched = hasValidPhone && bookingPhone === phoneNorm;
      if (phoneMatched) {
        return true;
      }
      const bookingName = normalizeVietnameseName(customerJoin?.full_name ?? "");
      if (!bookingName || !targetName) {
        return false;
      }
      return isLikelySameGuestName(bookingName, targetName);
    })
    .map((row) => {
      const customerJoin = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      const creatorJoin = Array.isArray(row.app_users) ? row.app_users[0] : row.app_users;
      return {
        bookingId: row.id,
        bookingAt: row.booking_at,
        guestCount: row.guest_count,
        receiverFullName: creatorJoin?.full_name ?? "Không rõ",
        receiverUserId: row.created_by_user_id ?? undefined,
        customerName: customerJoin?.full_name ?? undefined,
        tableLabel: row.table_id ? `Bàn ${row.table_id.slice(0, 8)}` : "Chờ xếp bàn",
      };
    });
}

type TableSlotConflictRow = {
  id: string;
  booking_at: string;
  start_time: string | null;
  end_time: string | null;
  guest_count: number;
  customers: { full_name: string } | { full_name: string }[] | null;
};

async function findTableBookingSlotConflictsInSupabase(
  client: ReturnType<typeof ensureClient>,
  input: {
    bookingId: string;
    tableId: string;
    startTime: string;
    endTime: string;
  }
): Promise<TableSlotConflictRow[]> {
  const { data, error } = await (client as any)
    .from("bookings")
    .select("id, booking_at, start_time, end_time, guest_count, customers(full_name)")
    .eq("table_id", input.tableId)
    .neq("id", input.bookingId)
    .in("status", TABLE_RESERVATION_BOOKING_STATUSES);
  if (error) {
    throw new Error(error.message);
  }

  const candidate = {
    bookingAt: input.startTime,
    startTime: input.startTime,
    endTime: input.endTime,
  };

  return ((data ?? []) as TableSlotConflictRow[]).filter((row) =>
    bookingsTimeSlotsOverlap(candidate, {
      bookingAt: row.booking_at,
      startTime: row.start_time ?? row.booking_at,
      endTime: row.end_time ?? input.endTime,
    })
  );
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
      totalCapacity: number;
      memberTableIds: string[];
      /** Largest seat table inside the group — used to satisfy NOT NULL on RPC p_table_id (still nullified in SQL). */
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
  }
): Promise<MergeGroupAssignContext> {
  const { data: groupRow, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .select("id, branch_id, area_id, status, merged_name, total_capacity")
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
  const groupMaxGuests = getMergeGroupEffectiveGuestCapacity(groupRow.total_capacity);
  if (input.guestCount > groupMaxGuests) {
    return {
      ok: false,
      message: `Số khách vượt sức chứa cụm bàn gộp (${formatTableGuestCapacityHint(groupRow.total_capacity)}).`,
    };
  }

  const { data: members, error: membersErr } = await (client as any)
    .from("table_merge_members")
    .select("table_id, tables(id, seats)")
    .eq("group_id", input.mergeGroupId);
  if (membersErr) {
    return { ok: false, message: membersErr.message };
  }
  const memberRows = (members ?? []) as Array<{
    table_id: string;
    tables: { id: string; seats: number } | { id: string; seats: number }[] | null;
  }>;
  if (memberRows.length === 0) {
    return { ok: false, message: "Cụm bàn gộp không còn bàn thành viên." };
  }
  const memberSeats = memberRows.map((row) => {
    const join = Array.isArray(row.tables) ? row.tables[0] : row.tables;
    return { id: row.table_id, seats: join?.seats ?? 0 };
  });
  const fallback = memberSeats.reduce(
    (best, current) => (current.seats > best.seats ? current : best),
    memberSeats[0]
  );

  return {
    ok: true,
    mergedName: groupRow.merged_name,
    areaId: groupRow.area_id,
    branchId: groupRow.branch_id,
    totalCapacity: groupRow.total_capacity,
    memberTableIds: memberSeats.map((row) => row.id),
    fallbackTableId: fallback.id,
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
  const { data: rows, error } = await client
    .from("bookings")
    .select("id, status")
    .eq("table_id", tableId)
    .in("status", TABLE_RESERVATION_BOOKING_STATUSES);
  if (error || !rows?.length) {
    if (!error) {
      await client.from("tables").update({ status: "available" }).eq("id", tableId);
    }
    return;
  }
  const hasSeated = rows.some(
    (r: { status: string }) => r.status === "seated" || r.status === "checked_in"
  );
  const nextStatus: TableStatus = hasSeated ? "occupied" : "hold";
  await client.from("tables").update({ status: nextStatus }).eq("id", tableId);
}

/**
 * Automated no-show (run_booking_maintenance) updates `bookings` in SQL without touching
 * `tables.status`. This reconciles affected tables so we do not leave "Giữ chỗ" with empty peek.
 */
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

  await maybeRunBookingMaintenance(Boolean(options?.forceMaintenance));

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
    client.from("branches").select("*"),
    client.from("areas").select("*"),
    client.from("tables").select("*"),
    client.from("customers").select("*"),
    client.from("bookings").select("*"),
    client
      .from("internal_notifications")
      .select("*")
      .order("created_at", { ascending: false }),
    client
      .from("table_merge_groups")
      .select("*")
      .eq("status", "active")
      .order("auto_number", { ascending: true }),
    client
      .from("table_merge_members")
      .select("group_id, table_id, order_index")
      .order("order_index", { ascending: true }),
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
      note: item.note ?? undefined,
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
    total_capacity: number;
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
  const mergeGroups: TableMergeGroup[] = mergeGroupRows.map((row) => ({
    id: row.id,
    branchId: row.branch_id,
    areaId: row.area_id,
    autoNumber: row.auto_number ?? 0,
    mergedName: row.merged_name,
    totalCapacity: row.total_capacity ?? 0,
    tableIds: membersByGroup.get(row.id) ?? [],
    status: row.status === "released" ? "released" : "active",
    createdAt: row.created_at,
    releasedAt: row.released_at,
  }));

  let tablesRowList = tablesResult.data ?? [];
  const orphanTableIds = tablesRowList
    .filter((item) => {
      const st = item.status as TableStatus;
      if (st === "locked") {
        return false;
      }
      if (st !== "hold" && st !== "occupied") {
        return false;
      }
      return pickPrimaryBookingOnTable(item.id, bookings) === null;
    })
    .map((item) => item.id);

  if (orphanTableIds.length > 0) {
    await Promise.all(orphanTableIds.map((id) => refreshTableAvailabilityForBooking(client, id)));
    const tablesRefetch = await client.from("tables").select("*");
    if (!tablesRefetch.error && tablesRefetch.data) {
      tablesRowList = tablesRefetch.data;
    }
  }

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
        capacity: item.capacity,
        floorGridColumns:
          typeof item.floor_grid_columns === "number" ? item.floor_grid_columns : 12,
        floorGridRows: typeof item.floor_grid_rows === "number" ? item.floor_grid_rows : 8,
        floorNodeSpacing:
          typeof item.floor_node_spacing === "number"
            ? item.floor_node_spacing
            : FLOOR_DEFAULT_NODE_SPACING_PX,
      })) ?? [],
    tables:
      tablesRowList.map((item) => ({
        id: item.id,
        branchId: item.branch_id,
        areaId: item.area_id,
        name: item.name,
        seats: item.seats,
        status: item.status as TableStatus,
        positionX: item.position_x,
        positionY: item.position_y,
      })) ?? [],
    customers:
      customersResult.data?.map((item) => ({
        id: item.id,
        fullName: item.full_name,
        phone: item.phone,
        note: item.note ?? undefined,
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
    });
    if (!groupCheck.ok) {
      return { ok: false, message: groupCheck.message };
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
    const outcome = Array.isArray(createData) ? createData[0] : createData;
    if (!outcome || typeof outcome !== "object") {
      return { ok: false, message: "Không nhận được phản hồi khi tạo booking cụm bàn gộp." };
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

    return { ok: true, message: `Đã tạo booking trên cụm ${groupCheck.mergedName}.` };
  }

  if (hasAssignedTable) {
    const { data: tableInfo, error: tableInfoError } = await client
      .from("tables")
      .select("seats, branch_id")
      .eq("id", input.tableId!)
      .maybeSingle();
    if (tableInfoError || !tableInfo) {
      return {
        ok: false,
        message: tableInfoError?.message ?? "Không tìm thấy bàn.",
      };
    }
    if (!tableFitsGuestCount(tableInfo.seats, normalizedGuestCount)) {
      return {
        ok: false,
        message: `Số khách không được vượt quá sức chứa bàn (${formatTableGuestCapacityHint(tableInfo.seats)}).`,
      };
    }
    if (tableInfo.branch_id !== input.branchId) {
      return { ok: false, message: "Bàn không thuộc cùng chi nhánh với booking." };
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

    const outcome = Array.isArray(createData) ? createData[0] : createData;
    if (!outcome || typeof outcome !== "object") {
      return { ok: false, message: "Không nhận được phản hồi từ hệ thống đặt bàn." };
    }

    const normalizedOutcome = outcome as BookingCreateOrQueueResult;
    if (normalizedOutcome.outcome === "waitlisted") {
      const { error: waitlistNotifErr } = await client.from("internal_notifications").insert({
        title: "Đã vào hàng chờ",
        message: `Khung giờ ${dayjs(normalizedAt).format(
          "HH:mm DD/MM/YYYY"
        )} đã kín. Đã thêm ${input.customerName} vào hàng chờ.`,
        created_at: dayjs().toISOString(),
        is_read: false,
        branch_id: input.branchId,
      });
      if (waitlistNotifErr) {
        return { ok: false, message: waitlistNotifErr.message };
      }
      return {
        ok: true,
        message:
          normalizedOutcome.message ??
          "Khung giờ đã kín. Khách đã được thêm vào hàng chờ của bàn.",
      };
    }

    {
      const { data: tableRow } = await client
        .from("tables")
        .select("status")
        .eq("id", input.tableId!)
        .maybeSingle();
      if ((tableRow?.status as TableStatus | undefined) !== "locked") {
        await refreshTableAvailabilityForBooking(client, input.tableId!);
      }
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

    return { ok: true, message: "Đã tạo booking thành công." };
  }

  const { error: bookingError } = await (client as any).from("bookings").insert({
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
  });
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

  return { ok: true, message: "Đã tạo booking thành công." };
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
  if (booking.status !== "pending") {
    return { ok: false, message: "Chỉ gán bàn cho booking đang chờ xếp bàn." };
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
    });
    if (!groupCheck.ok) {
      return { ok: false, message: groupCheck.message };
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
    const outcome = Array.isArray(assignData) ? assignData[0] : assignData;
    if (!outcome || typeof outcome !== "object") {
      return { ok: false, message: "Không nhận được phản hồi khi gán cụm bàn gộp." };
    }

    return { ok: true, message: `Đã gán booking vào cụm ${groupCheck.mergedName}.` };
  }

  if (!tableId) {
    return { ok: false, message: "Vui lòng chọn bàn hoặc cụm bàn gộp." };
  }

  const { data: table, error: tableErr } = await client
    .from("tables")
    .select("id, branch_id, seats, status")
    .eq("id", tableId)
    .maybeSingle();
  if (tableErr || !table) {
    return { ok: false, message: tableErr?.message ?? "Không tìm thấy bàn." };
  }
  if (table.branch_id !== booking.branch_id) {
    return { ok: false, message: "Bàn không thuộc cùng chi nhánh với booking." };
  }
  if (!tableFitsGuestCount(table.seats, nextGuestCount)) {
    return {
      ok: false,
      message: `Số khách không được vượt quá sức chứa bàn (${formatTableGuestCapacityHint(table.seats)}).`,
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

  const outcome = Array.isArray(assignData) ? assignData[0] : assignData;
  if (!outcome || typeof outcome !== "object") {
    return { ok: false, message: "Không nhận được phản hồi khi gán bàn." };
  }
  if ((outcome as BookingCreateOrQueueResult).outcome === "waitlisted") {
    return {
      ok: true,
      message: (outcome as BookingCreateOrQueueResult).message ?? "Đã chuyển booking sang hàng chờ.",
    };
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

  const { data: tableRow } = await client
    .from("tables")
    .select("status")
    .eq("id", tableId)
    .maybeSingle();
  if ((tableRow?.status as TableStatus | undefined) !== "locked") {
    await refreshTableAvailabilityForBooking(client, tableId);
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
        "Chỉ chỉnh giờ, số khách, SĐT và khu/bàn khi booking chờ xếp bàn hoặc đã xác nhận.",
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
    .select("phone")
    .eq("id", booking.customer_id)
    .maybeSingle();
  if (customerLoadErr || !customerRow) {
    return { ok: false, message: customerLoadErr?.message ?? "Không tìm thấy khách hàng." };
  }
  const existingPhone = customerRow.phone as string | null;

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
    const { data: customerNameRow } = await client
      .from("customers")
      .select("full_name")
      .eq("id", booking.customer_id)
      .maybeSingle();
    const duplicates = await findBookingDuplicatesByPhoneSlotInSupabase(client, {
      branchId: booking.branch_id,
      customerPhone:
        phoneForDuplicate && !isSyntheticPhoneValue(phoneForDuplicate)
          ? phoneForDuplicate
          : undefined,
      customerName: customerNameRow?.full_name ?? "",
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
    });
    if (!mergeGroupContext.ok) {
      return { ok: false, message: mergeGroupContext.message };
    }
  }

  if (nextTableId) {
    const { data: table, error: tableErr } = await client
      .from("tables")
      .select("id, branch_id, area_id, seats, status, name")
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
    if (!tableFitsGuestCount(table.seats, effectiveGuestCount)) {
      return {
        ok: false,
        message: `Số khách không được vượt quá sức chứa bàn (${formatTableGuestCapacityHint(table.seats)}).`,
      };
    }

    if (timeChanged || assignmentChanged) {
      const tableConflicts = await findTableBookingSlotConflictsInSupabase(client, {
        bookingId: input.bookingId,
        tableId: nextTableId,
        startTime: normalizedAt,
        endTime: slotEnd,
      });
      if (tableConflicts.length > 0) {
        const firstConflict = tableConflicts[0];
        const customerJoin = firstConflict.customers;
        const conflictCustomerName = Array.isArray(customerJoin)
          ? customerJoin[0]?.full_name
          : customerJoin?.full_name;
        const message =
          formatTableSlotConflictMessage(
            tableConflicts.map((row) => ({
              bookingAt: row.booking_at,
              guestCount: row.guest_count,
            })),
            { tableName: table.name, customerName: conflictCustomerName }
          ) ?? "Khung giờ mới trùng với booking khác trên cùng bàn.";
        return { ok: false, message };
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
    const outcome = Array.isArray(assignData) ? assignData[0] : assignData;
    if (!outcome || typeof outcome !== "object") {
      return { ok: false, message: "Không nhận được phản hồi khi gán cụm bàn gộp." };
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

    if ((outcome as BookingCreateOrQueueResult).outcome === "waitlisted") {
      return {
        ok: true,
        message:
          (outcome as BookingCreateOrQueueResult).message ??
          "Khung giờ đã kín, booking đã được đưa vào hàng chờ.",
      };
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

export async function updateBookingStatusInSupabase(
  bookingId: string,
  status: BookingStatus
): Promise<void> {
  const client = ensureClient();
  const { data: booking } = await (client as any)
    .from("bookings")
    .select("id, table_id, branch_id, start_time, end_time")
    .eq("id", bookingId)
    .maybeSingle();
  const normalizedStatus: BookingStatus = status === "checked_in" ? "seated" : status;
  const shouldClearCheckedInAt =
    normalizedStatus === "cancelled" ||
    normalizedStatus === "pending" ||
    normalizedStatus === "confirmed" ||
    normalizedStatus === "no_show";
  const { error } = await (client as any)
    .from("bookings")
    .update(
      shouldClearCheckedInAt
        ? {
            status: normalizedStatus,
            checked_in_at: null,
            no_show_marked_at:
              normalizedStatus === "no_show" ? dayjs().toISOString() : null,
          }
        : { status: normalizedStatus }
    )
    .eq("id", bookingId);
  if (error) {
    throw new Error(error.message);
  }
  if (!booking || !booking.table_id) {
    return;
  }

  if (TERMINAL_CANCEL_STATUSES.includes(normalizedStatus)) {
    await (client as any).rpc("promote_waitlist_for_booking_slot", {
      p_table_id: booking.table_id,
      p_branch_id: booking.branch_id,
      p_slot_start_time: booking.start_time ?? dayjs().toISOString(),
      p_slot_end_time:
        booking.end_time ??
        dayjs(booking.start_time ?? dayjs().toISOString())
          .add(DEFAULT_BOOKING_RUNTIME_SETTINGS.standardTurnaroundMinutes, "minute")
          .toISOString(),
    });
  }

  if (normalizedStatus === "cancelled" || normalizedStatus === "completed" || normalizedStatus === "no_show") {
    await refreshTableAvailabilityForBooking(client, booking.table_id);
  }
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

export async function checkInBookingInSupabase(bookingId: string): Promise<void> {
  const client = ensureClient();
  const { data: target, error: loadErr } = await client
    .from("bookings")
    .select("id, branch_id, table_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (loadErr) {
    throw new Error(loadErr.message);
  }
  if (!target) {
    throw new Error("Không tìm thấy booking.");
  }
  if (!target.table_id) {
    throw new Error("Booking chưa được gán bàn. Vui lòng gán trong mục Sơ đồ trước.");
  }

  const { error: bookingErr } = await (client as any)
    .from("bookings")
    .update({ status: "seated", checked_in_at: dayjs().toISOString(), no_show_marked_at: null })
    .eq("id", bookingId);
  if (bookingErr) {
    throw new Error(bookingErr.message);
  }

  const { data: tableRow, error: tableReadErr } = await client
    .from("tables")
    .select("status, name")
    .eq("id", target.table_id)
    .maybeSingle();
  if (tableReadErr) {
    throw new Error(tableReadErr.message);
  }
  if ((tableRow?.status as TableStatus | undefined) !== "locked") {
    await refreshTableAvailabilityForBooking(client, target.table_id);
  }

  const tableName =
    typeof tableRow?.name === "string" ? tableRow.name.trim() : "";
  const checkInMessage =
    tableName.length > 0
      ? `Đã check-in thành công. Bàn ${tableName} chuyển sang trạng thái có khách.`
      : "Đã check-in thành công. Bàn chuyển sang trạng thái có khách.";

  const { error: notifErr } = await client.from("internal_notifications").insert({
    title: "Check-in hoàn tất",
    message: checkInMessage,
    created_at: dayjs().toISOString(),
    is_read: false,
    branch_id: target.branch_id,
  });
  if (notifErr) {
    throw new Error(notifErr.message);
  }
}

export async function getTableBlockStateInSupabase(input: {
  tableId: string;
  slotStartTime: string;
  slotEndTime?: string;
  /** `all` = every active waitlist row for this table; `day` = same calendar day; `slot` = exact window. */
  waitlistScope?: "slot" | "day" | "all";
}): Promise<TableBlockState> {
  const client = ensureClient();
  const runtimeSettings = await getBookingRuntimeSettings(client);
  const slotStartTime = dayjs(input.slotStartTime).toISOString();
  const slotEndTime = dayjs(
    input.slotEndTime ??
      dayjs(slotStartTime).add(runtimeSettings.standardTurnaroundMinutes, "minute").toISOString()
  ).toISOString();

  const scheduleFrom = dayjs().startOf("day").toISOString();

  const waitlistScope = input.waitlistScope ?? "all";
  let waitlistQuery = (client as any)
    .from("booking_waitlist_entries")
    .select("*")
    .eq("table_id", input.tableId)
    .in("status", ["waiting", "offered"])
    .order("queue_position", { ascending: true });
  if (waitlistScope === "slot") {
    waitlistQuery = waitlistQuery
      .eq("desired_start_time", slotStartTime)
      .eq("desired_end_time", slotEndTime);
  } else if (waitlistScope === "day") {
    const dayStart = dayjs(slotStartTime).startOf("day").toISOString();
    const dayEnd = dayjs(slotStartTime).endOf("day").toISOString();
    waitlistQuery = waitlistQuery
      .gte("desired_start_time", dayStart)
      .lte("desired_start_time", dayEnd);
  }

  const [confirmedResult, waitlistResult] = await Promise.all([
    (client as any)
      .from("bookings")
      .select("*")
      .eq("table_id", input.tableId)
      .gte("start_time", scheduleFrom)
      .in("status", ["confirmed", "seated", "checked_in"])
      .order("start_time", { ascending: true }),
    waitlistQuery,
  ]);

  if (confirmedResult.error) {
    throw new Error(confirmedResult.error.message);
  }
  if (waitlistResult.error) {
    throw new Error(waitlistResult.error.message);
  }

  return {
    tableId: input.tableId,
    slotStartTime,
    slotEndTime,
    confirmedSchedule:
      (confirmedResult.data as any[] | null | undefined)?.map((item) => ({
        id: item.id,
        customerId: item.customer_id,
        branchId: item.branch_id,
        areaId: item.area_id,
        tableId: item.table_id,
        guestCount: item.guest_count,
        bookingAt: item.booking_at,
        startTime: item.start_time ?? item.booking_at,
        endTime:
          item.end_time ??
          dayjs(item.start_time ?? item.booking_at)
            .add(runtimeSettings.standardTurnaroundMinutes, "minute")
            .toISOString(),
        checkedInAt: item.checked_in_at,
        noShowMarkedAt: item.no_show_marked_at,
        note: item.note ?? undefined,
        createdByUserId: item.created_by_user_id,
        lastEditedAt: item.last_edited_at ?? undefined,
        lastEditedByUserId: item.last_edited_by_user_id ?? undefined,
        status: item.status as BookingStatus,
      })) ?? [],
    waitlistQueue:
      (waitlistResult.data as any[] | null | undefined)?.map(
        (item): BookingWaitlistEntry => ({
          id: item.id,
          tableId: item.table_id,
          branchId: item.branch_id,
          areaId: item.area_id,
          customerId: item.customer_id,
          bookingId: item.booking_id,
          desiredStartTime: item.desired_start_time,
          desiredEndTime: item.desired_end_time,
          partySize: item.party_size,
          status: item.status as BookingWaitlistEntry["status"],
          position: item.queue_position,
          offeredAt: item.offered_at,
          offerExpiresAt: item.offer_expires_at,
          promotedBookingId: item.promoted_booking_id,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        })
      ) ?? [],
  };
}

export async function confirmWaitlistOfferInSupabase(waitlistEntryId: string): Promise<Result> {
  const client = ensureClient();
  const { data, error } = await (client as any).rpc("confirm_waitlist_offer", {
    p_waitlist_entry_id: waitlistEntryId,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  const response = Array.isArray(data) ? data[0] : data;
  if (!response || typeof response !== "object") {
    return { ok: false, message: "Không thể xác nhận suất từ hàng chờ." };
  }
  return {
    ok: Boolean((response as { ok?: boolean }).ok),
    message:
      ((response as { message?: string }).message ?? "Đã xử lý xác nhận hàng chờ."),
  };
}

type MergeGroupCreateInput = {
  branchId: string;
  areaId: string;
  tableIds: string[];
  createdByUserId?: string;
};

type MergeGroupCreateResult = Result & { groupId?: string; mergedName?: string };

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
  tableIds: string[]
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (tableIds.length === 0) {
    return { ok: true };
  }
  const { data, error } = await (client as any)
    .from("table_merge_members")
    .select("table_id, table_merge_groups!inner(status)")
    .in("table_id", tableIds)
    .eq("table_merge_groups.status", "active");
  if (error) {
    return { ok: false, message: error.message };
  }
  const busyIds = new Set(
    ((data ?? []) as Array<{ table_id: string }>).map((row) => row.table_id)
  );
  if (busyIds.size === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    message: `Có bàn đã thuộc cụm gộp khác (${busyIds.size} bàn). Vui lòng bỏ gộp trước khi gộp mới.`,
  };
}

/** Snap active merge members into one adjacent row on the area floor grid (+ one empty plug cell). */
async function packMergeGroupTablesOnFloor(
  client: ReturnType<typeof ensureClient>,
  areaId: string,
  memberTableIds: string[],
  preferredAnchor?: { row: number; col: number }
): Promise<{ packed: boolean }> {
  if (memberTableIds.length === 0) {
    return { packed: false };
  }
  const { data: area, error: areaErr } = await client
    .from("areas")
    .select("floor_grid_columns, floor_grid_rows, floor_node_spacing")
    .eq("id", areaId)
    .maybeSingle();
  if (areaErr || !area) {
    return { packed: false };
  }
  const gridColumns =
    typeof area.floor_grid_columns === "number" ? area.floor_grid_columns : 12;
  const gridRows = typeof area.floor_grid_rows === "number" ? area.floor_grid_rows : 8;
  const nodeSpacing =
    typeof area.floor_node_spacing === "number" ? area.floor_node_spacing : 168;

  const { data: areaTables, error: tablesErr } = await client
    .from("tables")
    .select("id, position_x, position_y")
    .eq("area_id", areaId);
  if (tablesErr) {
    return { packed: false };
  }

  const packResult = packMergeGroupTablePositions({
    memberTableIds,
    areaTables: (areaTables ?? []).map((row) => ({
      id: row.id,
      positionX: row.position_x,
      positionY: row.position_y,
    })),
    gridColumns,
    gridRows,
    preferredAnchor,
  });
  if (!packResult) {
    return { packed: false };
  }

  if (packResult.gridRows > gridRows) {
    await updateAreaFloorLayoutInSupabase(areaId, {
      floorGridColumns: gridColumns,
      floorGridRows: packResult.gridRows,
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
    .select("id, name, seats, status, branch_id, area_id")
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
  if (tables.some((table) => (table.status as TableStatus) === "locked")) {
    return { ok: false, message: "Không gộp được bàn đang khóa." };
  }
  const lockCheck = await ensureTablesAreFreeToMerge(client, tableIds);
  if (!lockCheck.ok) {
    return { ok: false, message: lockCheck.message };
  }

  const totalCapacity = tables.reduce((acc, table) => acc + Math.max(1, table.seats ?? 1), 0);
  const nextNumber = await pickNextMergeGroupNumberForArea(client, input.areaId);
  const groupName = `Bàn gộp ${nextNumber}`;

  const { data: groupRow, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .insert({
      branch_id: input.branchId,
      area_id: input.areaId,
      merged_name: groupName,
      auto_number: nextNumber,
      total_capacity: totalCapacity,
      created_by_user_id: input.createdByUserId ?? null,
      status: "active",
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

  const packResult = await packMergeGroupTablesOnFloor(client, input.areaId, tableIds);
  let message = `Đã gộp ${tableIds.length} bàn thành "${groupName}".`;
  if (!packResult.packed) {
    message +=
      " Chưa xếp được cụm trên sơ đồ tự động — vào Sơ đồ (chỉnh sửa) để kéo các bàn sát nhau.";
  }

  return {
    ok: true,
    groupId: groupRow.id,
    mergedName: groupName,
    message,
  };
}

export async function addTableToMergeGroupInSupabase(input: {
  groupId: string;
  tableId: string;
  /** When false, membership is updated but floor positions are left unchanged (caller saved layout). */
  repackFloor?: boolean;
}): Promise<Result> {
  const client = ensureClient();
  const { data: group, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .select("id, branch_id, area_id, status, merged_name, total_capacity")
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
    .select("id, name, seats, status, branch_id, area_id")
    .eq("id", input.tableId)
    .maybeSingle();
  if (tableErr || !table) {
    return { ok: false, message: tableErr?.message ?? "Không tìm thấy bàn." };
  }
  if (table.branch_id !== group.branch_id || table.area_id !== group.area_id) {
    return { ok: false, message: "Bàn không cùng chi nhánh hoặc khu vực với cụm bàn gộp." };
  }
  if ((table.status as TableStatus) === "locked") {
    return { ok: false, message: "Không gộp được bàn đang khóa." };
  }
  const lockCheck = await ensureTablesAreFreeToMerge(client, [input.tableId]);
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

  const { error: updateErr } = await (client as any)
    .from("table_merge_groups")
    .update({
      total_capacity: (group.total_capacity ?? 0) + Math.max(1, table.seats ?? 1),
      updated_at: dayjs().toISOString(),
    })
    .eq("id", group.id);
  if (updateErr) {
    return { ok: false, message: updateErr.message };
  }

  const repackFloor = input.repackFloor !== false;
  if (repackFloor) {
    const allMemberIds = [
      ...((existingMembers ?? []) as Array<{ table_id: string }>).map((row) => row.table_id),
      input.tableId,
    ];
    const packResult = await packMergeGroupTablesOnFloor(client, group.area_id, allMemberIds);
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
}): Promise<Result> {
  const client = ensureClient();
  const { data: group, error: groupErr } = await (client as any)
    .from("table_merge_groups")
    .select("id, status, merged_name, total_capacity, area_id")
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
    .select("table_id, tables(id, name, seats)")
    .eq("group_id", group.id);
  if (membersErr) {
    return { ok: false, message: membersErr.message };
  }
  const memberRows = (members ?? []) as Array<{
    table_id: string;
    tables: { id: string; name: string; seats: number } | { id: string; name: string; seats: number }[] | null;
  }>;
  const target = memberRows.find((row) => row.table_id === input.tableId);
  if (!target) {
    return { ok: false, message: "Bàn không thuộc cụm bàn gộp này." };
  }
  if (memberRows.length <= 2) {
    // Removing one of the last two members effectively dissolves the group.
    return await releaseTableMergeGroupInSupabase({ groupId: group.id });
  }

  const targetJoin = Array.isArray(target.tables) ? target.tables[0] : target.tables;
  const removedSeats = targetJoin?.seats ?? 0;

  const { error: delErr } = await (client as any)
    .from("table_merge_members")
    .delete()
    .eq("group_id", group.id)
    .eq("table_id", input.tableId);
  if (delErr) {
    return { ok: false, message: delErr.message };
  }

  const { error: updateErr } = await (client as any)
    .from("table_merge_groups")
    .update({
      total_capacity: Math.max(0, (group.total_capacity ?? 0) - removedSeats),
      updated_at: dayjs().toISOString(),
    })
    .eq("id", group.id);
  if (updateErr) {
    return { ok: false, message: updateErr.message };
  }

  const remainingIds = memberRows
    .filter((row) => row.table_id !== input.tableId)
    .map((row) => row.table_id);
  const repackFloor = input.repackFloor !== false;
  let message = `Đã tách bàn khỏi ${group.merged_name}.`;
  if (repackFloor && remainingIds.length >= 2) {
    const packResult = await packMergeGroupTablesOnFloor(client, group.area_id, remainingIds);
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
    .select("table_id, tables(id, seats)")
    .eq("group_id", group.id);
  if (membersErr) {
    return { ok: false, message: membersErr.message };
  }
  const members = (memberRows ?? []) as Array<{
    table_id: string;
    tables: { id: string; seats: number } | { id: string; seats: number }[] | null;
  }>;
  const memberSeats = members.map((row) => {
    const join = Array.isArray(row.tables) ? row.tables[0] : row.tables;
    return { id: row.table_id, seats: join?.seats ?? 0 };
  });
  const largestMemberSeats = memberSeats.reduce((max, row) => Math.max(max, row.seats), 0);
  const largestMemberGuestCapacity = getTableEffectiveGuestCapacity(largestMemberSeats);

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
  const overflowBookings = activeRows.filter(
    (row) => row.guest_count > largestMemberGuestCapacity
  );
  if (overflowBookings.length > 0) {
    return {
      ok: false,
      message:
        `Không thể giải tán ${group.merged_name}: vẫn còn ${overflowBookings.length} booking dùng sức chứa vượt 1 bàn lẻ. ` +
        `Vui lòng đợi khách hoàn tất hoặc đổi sang hủy / no-show trước.`,
    };
  }

  // For remaining bookings (guest_count <= largestMemberSeats), try fall back to a member table
  // that can fit them without slot conflicts. Otherwise revert to pending.
  for (const booking of activeRows) {
    const candidates = [...memberSeats]
      .filter((row) => tableFitsGuestCount(row.seats, booking.guest_count))
      .sort((a, b) => b.seats - a.seats);
    let assignedTableId: string | null = null;
    for (const candidate of candidates) {
      const conflicts = await findTableBookingSlotConflictsInSupabase(client, {
        bookingId: booking.id,
        tableId: candidate.id,
        startTime: booking.start_time,
        endTime: booking.end_time,
      });
      if (conflicts.length === 0) {
        assignedTableId = candidate.id;
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

  return { ok: true, message: `Đã giải tán ${group.merged_name}.` };
}

export async function listTableMergeGroupsInSupabase(branchId: string): Promise<TableMergeGroup[]> {
  const client = ensureClient();
  const { data: groups, error: groupsErr } = await (client as any)
    .from("table_merge_groups")
    .select("id, branch_id, area_id, auto_number, merged_name, total_capacity, status, created_at, released_at")
    .eq("branch_id", branchId)
    .eq("status", "active")
    .order("auto_number", { ascending: true });
  if (groupsErr || !groups) {
    return [];
  }

  const typedGroups = (groups ?? []) as Array<{
    id: string;
    branch_id: string;
    area_id: string;
    auto_number: number | null;
    merged_name: string;
    total_capacity: number;
    status: string;
    created_at: string;
    released_at: string | null;
  }>;
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
  return typedGroups.map((group) => ({
    id: group.id,
    branchId: group.branch_id,
    areaId: group.area_id,
    autoNumber: group.auto_number ?? 0,
    mergedName: group.merged_name,
    totalCapacity: group.total_capacity ?? 0,
    tableIds: typedMembers
      .filter((member) => member.group_id === group.id)
      .map((member) => member.table_id),
    status: group.status === "released" ? "released" : "active",
    createdAt: group.created_at,
    releasedAt: group.released_at,
  }));
}

export async function runBookingMaintenanceInSupabase(): Promise<Result> {
  const client = ensureClient();
  const noShowWindowStart = dayjs().subtract(5, "minute").toISOString();
  const { data, error } = await (client as any).rpc("run_booking_maintenance");
  if (error) {
    return { ok: false, message: error.message };
  }
  const payload = Array.isArray(data) ? data[0] : data;
  if (!payload || typeof payload !== "object") {
    return { ok: true, message: "Đã chạy tác vụ bảo trì booking." };
  }
  const noShowCount = Number((payload as { no_show_count?: number }).no_show_count ?? 0);
  const expiredOfferCount = Number((payload as { expired_offer_count?: number }).expired_offer_count ?? 0);
  const promotedCount = Number((payload as { promoted_count?: number }).promoted_count ?? 0);

  if (noShowCount > 0) {
    await refreshTablesTouchedByRecentNoShows(client, noShowWindowStart);
  }

  return {
    ok: true,
    message: `Bảo trì xong: ${noShowCount} no-show, ${expiredOfferCount} offer hết hạn, ${promotedCount} lượt promotion.`,
  };
}

export async function upsertTableInSupabase(input: {
  id?: string;
  branchId: string;
  areaId: string;
  name: string;
  seats: number;
  status: TableStatus;
  positionX: number;
  positionY: number;
}): Promise<void> {
  const client = ensureClient();
  if (input.id) {
    await client
      .from("tables")
      .update({
        branch_id: input.branchId,
        area_id: input.areaId,
        name: input.name,
        seats: input.seats,
        status: input.status,
        position_x: input.positionX,
        position_y: input.positionY,
      })
      .eq("id", input.id);
    return;
  }

  await client.from("tables").insert({
    branch_id: input.branchId,
    area_id: input.areaId,
    name: input.name,
    seats: input.seats,
    status: input.status,
    position_x: input.positionX,
    position_y: input.positionY,
  });
}

export async function upsertTablesBatchInSupabase(
  inputs: Array<{
    id?: string;
    branchId: string;
    areaId: string;
    name: string;
    seats: number;
    status: TableStatus;
    positionX: number;
    positionY: number;
  }>
): Promise<void> {
  const client = ensureClient();
  if (inputs.length === 0) {
    return;
  }

  const updates = inputs.filter((item) => item.id);
  const inserts = inputs.filter((item) => !item.id);

  for (const item of updates) {
    await client
      .from("tables")
      .update({
        branch_id: item.branchId,
        area_id: item.areaId,
        name: item.name,
        seats: item.seats,
        status: item.status,
        position_x: item.positionX,
        position_y: item.positionY,
      })
      .eq("id", item.id as string);
  }

  if (inserts.length > 0) {
    await client.from("tables").insert(
      inserts.map((item) => ({
        branch_id: item.branchId,
        area_id: item.areaId,
        name: item.name,
        seats: item.seats,
        status: item.status,
        position_x: item.positionX,
        position_y: item.positionY,
      }))
    );
  }
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

export async function addAreaInSupabase(
  branchId: string,
  name: string,
  capacity: number
): Promise<void> {
  const client = ensureClient();
  await client.from("areas").insert({
    branch_id: branchId,
    name,
    capacity,
    floor_grid_columns: 12,
    floor_grid_rows: 8,
    floor_node_spacing: FLOOR_DEFAULT_NODE_SPACING_PX,
  });
}

export async function updateAreaInSupabase(
  areaId: string,
  input: { branchId?: string; name?: string; capacity?: number }
): Promise<Result> {
  const client = ensureClient();
  const patch: {
    name?: string;
    capacity?: number;
    branch_id?: string;
  } = {};
  if (input.name !== undefined) {
    patch.name = input.name;
  }
  if (input.capacity !== undefined) {
    patch.capacity = input.capacity;
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
  await client.from("floor_layout_template_selections").delete().eq("area_id", areaId);
  await client.from("floor_layout_templates").delete().eq("area_id", areaId);

  const { error } = await client.from("areas").delete().eq("id", areaId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã xóa khu vực." };
}

export async function updateAreaFloorLayoutInSupabase(
  areaId: string,
  input: {
    floorGridColumns: number;
    floorGridRows: number;
    floorNodeSpacing: number;
  }
): Promise<void> {
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

/** Persists grid metadata and all table positions for a floor in one logical save. */
export async function saveFloorLayoutToSupabase(
  areaId: string,
  input: SaveFloorLayoutInput
): Promise<void> {
  await updateAreaFloorLayoutInSupabase(areaId, {
    floorGridColumns: input.floorGridColumns,
    floorGridRows: input.floorGridRows,
    floorNodeSpacing: input.floorNodeSpacing,
  });
  if (input.tablePositions.length === 0) {
    return;
  }
  await Promise.all(
    input.tablePositions.map((row) =>
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
