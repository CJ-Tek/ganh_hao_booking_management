import dayjs from "dayjs";
import { initialState } from "./initial-state";
import { supabase } from "./supabase";
import { appendUnknownGuestTag, pickPrimaryBookingOnTable, stripUnknownGuestTag } from "./booking-meta";
import {
  FLOOR_DEFAULT_NODE_SPACING_PX,
} from "./floor-map-layout";
import {
  AppStateSnapshot,
  AppUser,
  BookingRuntimeSettings,
  BookingStatus,
  BookingWaitlistEntry,
  Role,
  TableBlockState,
  TableStatus,
} from "./types";

type Result = { ok: boolean; message: string };

type CreateBookingInput = {
  customerName: string;
  customerPhone?: string;
  branchId: string;
  areaId?: string | null;
  tableId?: string | null;
  guestCount?: number;
  bookingAt: string;
  note?: string;
  createdByUserId: string;
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

const DEFAULT_BOOKING_RUNTIME_SETTINGS: BookingRuntimeSettings = {
  standardTurnaroundMinutes: 90,
  noShowGraceMinutes: 15,
  waitlistOfferTtlMinutes: 5,
};

const ACTIVE_TABLE_SLOT_STATUSES: BookingStatus[] = ["confirmed", "seated", "checked_in"];
const BOOKING_MAINTENANCE_INTERVAL_MS = 60_000;
let lastBookingMaintenanceAt = 0;
let bookingMaintenanceInFlight: Promise<void> | null = null;

async function maybeRunBookingMaintenance(): Promise<void> {
  const now = Date.now();
  if (now - lastBookingMaintenanceAt < BOOKING_MAINTENANCE_INTERVAL_MS) {
    return;
  }
  if (bookingMaintenanceInFlight) {
    await bookingMaintenanceInFlight;
    return;
  }
  lastBookingMaintenanceAt = now;
  bookingMaintenanceInFlight = runBookingMaintenanceInSupabase()
    .then(() => undefined)
    .catch(() => undefined)
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

export function isSupabaseEnabled() {
  return Boolean(supabase);
}

function ensureClient() {
  if (!supabase) {
    throw new Error("Chưa cấu hình Supabase.");
  }
  return supabase;
}

async function getBookingRuntimeSettings(
  client: ReturnType<typeof ensureClient>
): Promise<BookingRuntimeSettings> {
  const { data, error } = await (client as any)
    .from("booking_runtime_settings")
    .select("standard_turnaround_minutes, no_show_grace_minutes, waitlist_offer_ttl_minutes")
    .eq("id", true)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_BOOKING_RUNTIME_SETTINGS;
  }

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
  };
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

export async function fetchSnapshot(): Promise<AppStateSnapshot> {
  if (!supabase) {
    return initialState;
  }

  await maybeRunBookingMaintenance();

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

  const bookings: AppStateSnapshot["bookings"] =
    ((bookingsResult.data ?? []) as any[]).map((item) => ({
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
          .add(DEFAULT_BOOKING_RUNTIME_SETTINGS.standardTurnaroundMinutes, "minute")
          .toISOString(),
      checkedInAt: item.checked_in_at ?? undefined,
      noShowMarkedAt: item.no_show_marked_at ?? undefined,
      note: item.note ?? undefined,
      createdByUserId: item.created_by_user_id,
      status: item.status as BookingStatus,
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
  const bookingNote = guestCountSpecified
    ? stripUnknownGuestTag(input.note) ?? null
    : appendUnknownGuestTag(input.note);
  const hasAssignedTable = Boolean(input.areaId && input.tableId);

  const customerResult = await upsertCustomerForBooking(client, {
    customerName: input.customerName,
    customerPhone: input.customerPhone,
  });
  if ("error" in customerResult) {
    return { ok: false, message: customerResult.error };
  }
  const customerId = customerResult.customerId;

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
    if (normalizedGuestCount > tableInfo.seats) {
      return {
        ok: false,
        message: `Số khách không được vượt quá sức chứa bàn (${tableInfo.seats} ghế).`,
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
  tableId: string;
  guestCount?: number;
}): Promise<Result> {
  const client = ensureClient();
  const { bookingId, areaId, tableId, guestCount } = input;
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
  if (nextGuestCount > table.seats) {
    return {
      ok: false,
      message: `Số khách không được vượt quá sức chứa bàn (${table.seats} ghế).`,
    };
  }

  const normalizedStart = dayjs(booking.start_time ?? booking.booking_at).toISOString();
  const normalizedEnd = dayjs(
    booking.end_time ??
      dayjs(normalizedStart).add(runtimeSettings.standardTurnaroundMinutes, "minute").toISOString()
  ).toISOString();

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
