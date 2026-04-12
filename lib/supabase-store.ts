import dayjs from "dayjs";
import { initialState } from "./mock-data";
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

export function isSupabaseEnabled() {
  return Boolean(supabase);
}

function ensureClient() {
  if (!supabase) {
    throw new Error("Chua cau hinh Supabase.");
  }
  return supabase;
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
    backgroundsResult,
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
    client.from("floor_backgrounds").select("*"),
  ]);

  const errors = [
    usersResult.error,
    branchesResult.error,
    areasResult.error,
    tablesResult.error,
    customersResult.error,
    bookingsResult.error,
    notificationsResult.error,
    backgroundsResult.error,
  ].filter(Boolean);

  if (errors.length > 0) {
    throw new Error(errors[0]?.message ?? "Khong the tai du lieu Supabase.");
  }

  const floorBackgrounds =
    backgroundsResult.data?.reduce<Record<string, string>>((acc, item) => {
      acc[`${item.user_id}_${item.area_id}`] = item.image_data_url;
      return acc;
    }, {}) ?? {};

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
    floorBackgrounds,
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

  const { data: conflict, error: conflictError } = await client
    .from("bookings")
    .select("id")
    .eq("table_id", input.tableId)
    .eq("booking_at", normalizedAt)
    .neq("status", "cancelled")
    .maybeSingle();
  if (conflictError) {
    return { ok: false, message: conflictError.message };
  }
  if (conflict) {
    return { ok: false, message: "Ban da co booking cung khung gio." };
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
      return { ok: false, message: error?.message ?? "Khong tao duoc khach hang." };
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
    status: "confirmed",
  });
  if (bookingError) {
    return { ok: false, message: bookingError.message };
  }

  await client
    .from("tables")
    .update({ status: "hold" })
    .eq("id", input.tableId);

  await client.from("internal_notifications").insert({
    title: "Booking moi",
    message: `Da tao booking cho ${input.customerName} luc ${dayjs(normalizedAt).format(
      "HH:mm DD/MM/YYYY"
    )}.`,
    created_at: dayjs().toISOString(),
    is_read: false,
    branch_id: input.branchId,
  });

  return { ok: true, message: "Da tao booking thanh cong." };
}

export async function updateBookingStatusInSupabase(
  bookingId: string,
  status: BookingStatus
): Promise<void> {
  const client = ensureClient();
  await client.from("bookings").update({ status }).eq("id", bookingId);
}

export async function checkInBookingInSupabase(bookingId: string): Promise<void> {
  const client = ensureClient();
  const { data: target } = await client
    .from("bookings")
    .select("id, branch_id, table_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!target) {
    return;
  }

  await client.from("bookings").update({ status: "checked_in" }).eq("id", bookingId);
  await client.from("tables").update({ status: "occupied" }).eq("id", target.table_id);
  await client.from("internal_notifications").insert({
    title: "Check-in hoan tat",
    message: `Booking ${target.id} da chuyen trang thai co khach.`,
    created_at: dayjs().toISOString(),
    is_read: false,
    branch_id: target.branch_id,
  });
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

export async function updateTableStatusInSupabase(
  tableId: string,
  status: TableStatus
): Promise<void> {
  const client = ensureClient();
  await client.from("tables").update({ status }).eq("id", tableId);
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

export async function setFloorBackgroundInSupabase(
  userId: string,
  areaId: string,
  imageDataUrl: string
): Promise<void> {
  const client = ensureClient();
  await client.from("floor_backgrounds").upsert(
    {
      user_id: userId,
      area_id: areaId,
      image_data_url: imageDataUrl,
    },
    { onConflict: "user_id,area_id" }
  );
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
  });
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
    return { ok: false, message: "Ten dang nhap da ton tai." };
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
  return { ok: true, message: "Da tao tai khoan moi." };
}

export async function markNotificationReadInSupabase(id: string): Promise<void> {
  const client = ensureClient();
  await client.from("internal_notifications").update({ is_read: true }).eq("id", id);
}
