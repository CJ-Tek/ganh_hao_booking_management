import dayjs from "dayjs";
import { initialState } from "./mock-data";
import { supabase } from "./supabase";
import {
  AppStateSnapshot,
  AppUser,
  BookingStatus,
  DiningTable,
  FloorLayoutTemplateSummary,
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

export async function deleteTableInSupabase(tableId: string): Promise<void> {
  const client = ensureClient();
  await client.from("tables").delete().eq("id", tableId);
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

export async function listFloorLayoutTemplatesInSupabase(
  areaId: string
): Promise<FloorLayoutTemplateSummary[]> {
  const client = ensureClient();
  const { data, error } = await client
    .from("floor_layout_templates")
    .select("name, updated_at")
    .eq("area_id", areaId)
    .order("updated_at", { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return (
    data?.map((item) => ({
      name: item.name,
      updatedAt: item.updated_at,
    })) ?? []
  );
}

export async function getLastSelectedFloorLayoutTemplateInSupabase(
  userId: string,
  areaId: string
): Promise<string | null> {
  const client = ensureClient();
  const { data, error } = await client
    .from("floor_layout_template_selections")
    .select("template_name")
    .eq("user_id", userId)
    .eq("area_id", areaId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.template_name ?? null;
}

export async function setLastSelectedFloorLayoutTemplateInSupabase(
  userId: string,
  areaId: string,
  templateName: string | null
): Promise<void> {
  const client = ensureClient();
  if (!templateName) {
    const { error } = await client
      .from("floor_layout_template_selections")
      .delete()
      .eq("user_id", userId)
      .eq("area_id", areaId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }
  const { error } = await client.from("floor_layout_template_selections").upsert(
    {
      user_id: userId,
      area_id: areaId,
      template_name: templateName,
      updated_at: dayjs().toISOString(),
    },
    { onConflict: "user_id,area_id" }
  );
  if (error) {
    throw new Error(error.message);
  }
}

export async function saveFloorLayoutTemplateInSupabase(input: {
  areaId: string;
  name: string;
  createdByUserId: string;
  backgroundImageDataUrl?: string;
  backgroundScale: number;
  tables: DiningTable[];
}): Promise<void> {
  const client = ensureClient();
  const templateLayout = input.tables.map((table) => ({
    tableId: table.id,
    name: table.name,
    seats: table.seats,
    status: table.status,
    positionX: table.positionX,
    positionY: table.positionY,
  }));
  const selectedTableIds = new Set(templateLayout.map((item) => item.tableId));
  const { error } = await client.from("floor_layout_templates").upsert(
    {
      area_id: input.areaId,
      name: input.name,
      created_by_user_id: input.createdByUserId,
      background_image_data_url: input.backgroundImageDataUrl ?? null,
      background_scale: input.backgroundScale,
      table_layout_json: templateLayout,
      updated_at: dayjs().toISOString(),
    },
    { onConflict: "area_id,name" }
  );
  if (error) {
    throw new Error(error.message);
  }

  if (selectedTableIds.size > 0) {
    const { data: siblingTemplates, error: siblingError } = await client
      .from("floor_layout_templates")
      .select("id, table_layout_json")
      .eq("area_id", input.areaId)
      .neq("name", input.name);
    if (siblingError) {
      throw new Error(siblingError.message);
    }

    for (const template of siblingTemplates ?? []) {
      const siblingLayout = Array.isArray(template.table_layout_json) ? template.table_layout_json : [];
      const filteredLayout = siblingLayout.filter((item) => {
        const tableId = String(item.tableId ?? item.table_id ?? "");
        return !selectedTableIds.has(tableId);
      });
      if (filteredLayout.length === siblingLayout.length) {
        continue;
      }
      const { error: updateSiblingError } = await client
        .from("floor_layout_templates")
        .update({ table_layout_json: filteredLayout, updated_at: dayjs().toISOString() })
        .eq("id", template.id);
      if (updateSiblingError) {
        throw new Error(updateSiblingError.message);
      }
    }
  }
}

export async function applyFloorLayoutTemplateInSupabase(input: {
  areaId: string;
  name: string;
  userId: string;
}): Promise<{ backgroundScale: number; tableIds: string[] } | null> {
  const client = ensureClient();
  const { data, error } = await client
    .from("floor_layout_templates")
    .select("background_image_data_url, background_scale, table_layout_json")
    .eq("area_id", input.areaId)
    .eq("name", input.name)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const tableLayoutsRaw = Array.isArray(data.table_layout_json) ? data.table_layout_json : [];
  const tableLayouts = tableLayoutsRaw
    .map((item) => ({
      tableId: String(item.tableId ?? item.table_id ?? ""),
      name: String(item.name ?? ""),
      seats: Number(item.seats ?? 1),
      status: item.status as TableStatus,
      positionX: Number(item.positionX ?? item.position_x ?? 0),
      positionY: Number(item.positionY ?? item.position_y ?? 0),
    }))
    .filter((item) => item.name && Number.isFinite(item.positionX) && Number.isFinite(item.positionY));

  if (tableLayouts.length > 0) {
    const { data: areaTables, error: areaTablesError } = await client
      .from("tables")
      .select("id, name")
      .eq("area_id", input.areaId);
    if (areaTablesError) {
      throw new Error(areaTablesError.message);
    }

    const nameToId = new Map(
      (areaTables ?? []).map((table) => [String(table.name).toLowerCase().trim(), table.id])
    );
    let updatedCount = 0;

    for (const item of tableLayouts) {
      const targetTableId = item.tableId || nameToId.get(item.name.toLowerCase().trim());
      if (!targetTableId) {
        continue;
      }
      const { data: updatedTable, error: updateError } = await client
        .from("tables")
        .update({
          name: item.name,
          seats: item.seats,
          status: item.status,
          position_x: Math.round(item.positionX),
          position_y: Math.round(item.positionY),
        })
        .eq("id", targetTableId)
        .eq("area_id", input.areaId)
        .select("id")
        .maybeSingle();
      if (updateError) {
        throw new Error(updateError.message);
      }
      if (updatedTable?.id) {
        updatedCount += 1;
      }
    }

    if (updatedCount === 0) {
      throw new Error("Template không khớp với bàn hiện tại trong khu vực.");
    }
  }

  if (data.background_image_data_url) {
    await setFloorBackgroundInSupabase(input.userId, input.areaId, data.background_image_data_url);
  }

  return {
    backgroundScale: data.background_scale ?? 100,
    tableIds: tableLayouts.map((item) => item.tableId).filter(Boolean),
  };
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
