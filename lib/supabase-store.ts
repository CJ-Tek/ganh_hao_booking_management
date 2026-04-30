import dayjs from "dayjs";
import { initialState } from "./initial-state";
import { supabase } from "./supabase";
import {
  AppStateSnapshot,
  AppUser,
  BookingStatus,
  Role,
  TableStatus,
} from "./types";

type Result = { ok: boolean; message: string };

type CreateBookingInput = {
  customerName: string;
  customerPhone: string;
  branchId: string;
  areaId: string;
  tableId: string;
  guestCount: number;
  bookingAt: string;
  note?: string;
  createdByUserId: string;
};

function resolveAutoTableStatus(bookingAtIso: string): TableStatus {
  return dayjs(bookingAtIso).isAfter(dayjs()) ? "hold" : "occupied";
}

export function isSupabaseEnabled() {
  return Boolean(supabase);
}

function ensureClient() {
  if (!supabase) {
    throw new Error("Chưa cấu hình Supabase.");
  }
  return supabase;
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

export async function fetchSnapshot(): Promise<AppStateSnapshot> {
  if (!supabase) {
    return initialState;
  }

  const client = ensureClient();
  const [
    usersResult,
    branchesResult,
    areasResult,
    tablesResult,
    customersResult,
    bookingsResult,
    notificationsResult,
  ] = await Promise.all([
    client.from("app_users").select("*"),
    client.from("branches").select("*"),
    client.from("areas").select("*"),
    client.from("tables").select("*"),
    client.from("customers").select("*"),
    client.from("bookings").select("*"),
    client
      .from("internal_notifications")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  const errors = [
    usersResult.error,
    branchesResult.error,
    areasResult.error,
    tablesResult.error,
    customersResult.error,
    bookingsResult.error,
    notificationsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]?.message ?? "Không thể tải dữ liệu Supabase.");
  }

  return {
    users:
      usersResult.data?.map((item) => ({
        id: item.id,
        username: item.username,
        password: item.password,
        fullName: item.full_name,
        role: item.role as Role,
        branchIds: (item.branch_ids ?? []) as string[],
      })) ?? [],
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
          typeof item.floor_node_spacing === "number" ? item.floor_node_spacing : 96,
      })) ?? [],
    tables:
      tablesResult.data?.map((item) => ({
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
    bookings:
      bookingsResult.data?.map((item) => ({
        id: item.id,
        customerId: item.customer_id,
        branchId: item.branch_id,
        areaId: item.area_id,
        tableId: item.table_id,
        guestCount: item.guest_count,
        bookingAt: item.booking_at,
        note: item.note ?? undefined,
        createdByUserId: item.created_by_user_id,
        status: item.status as BookingStatus,
      })) ?? [],
    notifications:
      notificationsResult.data?.map((item) => ({
        id: item.id,
        title: item.title,
        message: item.message,
        createdAt: item.created_at,
        isRead: item.is_read,
        branchId: item.branch_id ?? undefined,
      })) ?? [],
    activeBranchId:
      branchesResult.data?.[0]?.id ?? initialState.activeBranchId ?? undefined,
  };
}

export async function loginWithSupabase(
  username: string,
  password: string
): Promise<AppUser | null> {
  if (!supabase) {
    return null;
  }
  const client = ensureClient();
  const { data, error } = await client
    .from("app_users")
    .select("*")
    .eq("username", username)
    .eq("password", password)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    username: data.username,
    password: data.password,
    fullName: data.full_name,
    role: data.role as Role,
    branchIds: (data.branch_ids ?? []) as string[],
  };
}

export async function createBookingInSupabase(input: CreateBookingInput): Promise<Result> {
  const client = ensureClient();
  const normalizedAt = dayjs(input.bookingAt).toISOString();
  const nextTableStatus = resolveAutoTableStatus(normalizedAt);
  const nextBookingStatus: BookingStatus =
    nextTableStatus === "hold" ? "confirmed" : "checked_in";

  const { data: tableInfo, error: tableInfoError } = await client
    .from("tables")
    .select("seats")
    .eq("id", input.tableId)
    .maybeSingle();
  if (tableInfoError || !tableInfo) {
    return {
      ok: false,
      message: tableInfoError?.message ?? "Không tìm thấy bàn.",
    };
  }
  if (input.guestCount > tableInfo.seats) {
    return {
      ok: false,
      message: `Số khách không được vượt quá sức chứa bàn (${tableInfo.seats} ghế).`,
    };
  }

  const { data: conflict, error: conflictError } = await client
    .from("bookings")
    .select("id")
    .eq("table_id", input.tableId)
    .eq("booking_at", normalizedAt)
    .in("status", ["confirmed", "checked_in"])
    .maybeSingle();
  if (conflictError) {
    return { ok: false, message: conflictError.message };
  }
  if (conflict) {
    return { ok: false, message: "Đã có đặt bàn trùng khung giờ trên bàn này." };
  }

  const { data: currentCustomer } = await client
    .from("customers")
    .select("id")
    .eq("phone", input.customerPhone)
    .maybeSingle();

  let customerId = currentCustomer?.id as string | undefined;
  if (customerId) {
    const { error } = await client
      .from("customers")
      .update({ full_name: input.customerName })
      .eq("id", customerId);
    if (error) {
      return { ok: false, message: error.message };
    }
  } else {
    const { data, error } = await client
      .from("customers")
      .insert({
        full_name: input.customerName,
        phone: input.customerPhone,
      })
      .select("id")
      .single();
    if (error || !data) {
      return { ok: false, message: error?.message ?? "Không tạo được khách hàng." };
    }
    customerId = data.id;
  }

  const { error: bookingError } = await client.from("bookings").insert({
    customer_id: customerId,
    branch_id: input.branchId,
    area_id: input.areaId,
    table_id: input.tableId,
    guest_count: input.guestCount,
    booking_at: normalizedAt,
    note: input.note ?? null,
    created_by_user_id: input.createdByUserId,
    status: nextBookingStatus,
  });
  if (bookingError) {
    return { ok: false, message: bookingError.message };
  }

  const { data: tableRow } = await client
    .from("tables")
    .select("status")
    .eq("id", input.tableId)
    .maybeSingle();
  if ((tableRow?.status as TableStatus | undefined) !== "locked") {
    await client
      .from("tables")
      .update({ status: nextTableStatus })
      .eq("id", input.tableId);
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

export async function updateBookingStatusInSupabase(
  bookingId: string,
  status: BookingStatus
): Promise<void> {
  const client = ensureClient();
  const { data: booking } = await client
    .from("bookings")
    .select("id, table_id")
    .eq("id", bookingId)
    .maybeSingle();
  const { error } = await client.from("bookings").update({ status }).eq("id", bookingId);
  if (error) {
    throw new Error(error.message);
  }
  if (!booking || (status !== "cancelled" && status !== "completed")) {
    return;
  }
  const { data: tableRow } = await client
    .from("tables")
    .select("status")
    .eq("id", booking.table_id)
    .maybeSingle();
  if ((tableRow?.status as TableStatus | undefined) === "locked") {
    return;
  }
  const { data: activeBooking } = await client
    .from("bookings")
    .select("id")
    .eq("table_id", booking.table_id)
    .in("status", ["confirmed", "checked_in"])
    .neq("id", bookingId)
    .limit(1)
    .maybeSingle();
  if (!activeBooking) {
    await client.from("tables").update({ status: "available" }).eq("id", booking.table_id);
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

  const { error: bookingErr } = await client
    .from("bookings")
    .update({ status: "checked_in" })
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
    const { error: tableUpdErr } = await client
      .from("tables")
      .update({ status: "occupied" })
      .eq("id", target.table_id);
    if (tableUpdErr) {
      throw new Error(tableUpdErr.message);
    }
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
    floor_node_spacing: 96,
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
  /** All tables in this area; positions use grid indices (or STORAGE_OFF_GRID for palette). */
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
    const { data: holder } = await client
      .from("app_users")
      .select("full_name")
      .eq("id", row.user_id)
      .maybeSingle();
    return {
      ok: false,
      holderFullName: (holder?.full_name as string) ?? "Người dùng khác",
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
  const { data: holder } = await client
    .from("app_users")
    .select("full_name")
    .eq("id", row.user_id)
    .maybeSingle();
  return {
    userId: row.user_id as string,
    fullName: (holder?.full_name as string) ?? "?",
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
  const client = ensureClient();
  const { data: existing } = await client
    .from("app_users")
    .select("id")
    .eq("username", payload.username)
    .maybeSingle();
  if (existing) {
    return { ok: false, message: "Tên đăng nhập đã tồn tại." };
  }
  const { error } = await client.from("app_users").insert({
    username: payload.username,
    password: payload.password,
    full_name: payload.fullName,
    role: payload.role,
    branch_ids: payload.branchIds,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã tạo tài khoản mới." };
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
  const client = ensureClient();
  const { data: conflict } = await client
    .from("app_users")
    .select("id")
    .eq("username", payload.username)
    .neq("id", userId)
    .maybeSingle();
  if (conflict) {
    return { ok: false, message: "Tên đăng nhập đã tồn tại." };
  }
  const update: {
    username: string;
    full_name: string;
    role: Role;
    branch_ids: string[];
    password?: string;
  } = {
    username: payload.username,
    full_name: payload.fullName,
    role: payload.role,
    branch_ids: payload.branchIds,
  };
  if (payload.password && payload.password.trim().length > 0) {
    update.password = payload.password.trim();
  }
  const { error } = await client.from("app_users").update(update).eq("id", userId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã cập nhật tài khoản." };
}

export async function deleteUserInSupabase(userId: string): Promise<Result> {
  const client = ensureClient();
  const { error } = await client.from("app_users").delete().eq("id", userId);
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, message: "Đã xóa tài khoản." };
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
