import type { FloorMapStateSlice } from "./floor-map-state-slice";
import { callStore } from "./store-client";
import type {
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

export type { ActionResult, SaveFloorLayoutInput } from "./supabase-store-server";
import type { ActionResult } from "./supabase-store-server";

type Result = ActionResult;

export function isSupabaseEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export async function updateBookingRuntimeSettingsInSupabase(
  input: BookingRuntimeSettings
): Promise<Result> {
  return callStore("updateBookingRuntimeSettings", input);
}

export async function updateBranchInSupabase(
  branchId: string,
  input: { name: string; address: string }
): Promise<Result> {
  return callStore("updateBranch", { branchId, input });
}

export async function fetchSnapshot(options?: {
  forceMaintenance?: boolean;
}): Promise<AppStateSnapshot> {
  if (!isSupabaseEnabled()) {
    const { initialState } = await import("./initial-state");
    return initialState;
  }
  return callStore<AppStateSnapshot>("fetchSnapshot", options);
}

export async function fetchFloorMapSlice(
  branchIds: readonly string[]
): Promise<FloorMapStateSlice> {
  if (!isSupabaseEnabled()) {
    return {
      areas: [],
      tables: [],
      mergeGroups: [],
    };
  }
  return callStore("fetchFloorMapSlice", { branchIds: [...branchIds] });
}

export async function fetchFloorMapDayBookings(
  branchIds: readonly string[],
  layoutDate: string
): Promise<{ bookings: Booking[]; customers: Customer[] }> {
  if (!isSupabaseEnabled()) {
    return { bookings: [], customers: [] };
  }
  return callStore("fetchFloorMapDayBookings", {
    branchIds: [...branchIds],
    layoutDate,
  });
}

export async function loginWithSupabase(
  username: string,
  password: string
): Promise<AppUser | null> {
  if (!isSupabaseEnabled()) {
    return null;
  }

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { ok?: boolean; user?: AppUser };
    if (!payload.ok || !payload.user) {
      return null;
    }

    return { ...payload.user, password: "" };
  } catch {
    return null;
  }
}

export async function createBookingInSupabase(
  input: Parameters<
    typeof import("./supabase-store-server").createBookingInSupabase
  >[0]
): Promise<Result> {
  return callStore("createBooking", input);
}

export async function assignBookingToTableInSupabase(
  input: Parameters<typeof import("./supabase-store-server").assignBookingToTableInSupabase>[0]
): Promise<Result> {
  return callStore("assignBookingToTable", input);
}

export async function updateBookingGuestCountInSupabase(
  bookingId: string,
  guestCount: number
): Promise<Result> {
  return callStore("updateBookingGuestCount", { bookingId, guestCount });
}

export async function updateBookingOrderInSupabase(
  input: Parameters<typeof import("./supabase-store-server").updateBookingOrderInSupabase>[0]
): Promise<Result> {
  return callStore("updateBookingOrder", input);
}

export async function changeBookingTableInSupabase(
  input: Parameters<typeof import("./supabase-store-server").changeBookingTableInSupabase>[0]
): Promise<Result> {
  return callStore("changeBookingTable", input);
}

export async function updateBookingStatusInSupabase(
  bookingId: string,
  status: BookingStatus
): Promise<void> {
  await callStore("updateBookingStatus", { bookingId, status });
}

export async function deleteCustomersInSupabase(customerIds: string[]): Promise<Result> {
  return callStore("deleteCustomers", customerIds);
}

export async function checkInBookingInSupabase(bookingId: string): Promise<void> {
  await callStore("checkInBooking", bookingId);
}

export async function queueBookingInSupabase(bookingId: string): Promise<Result> {
  return callStore("queueBooking", { bookingId });
}

export async function getTableBlockStateInSupabase(
  input: Parameters<typeof import("./supabase-store-server").getTableBlockStateInSupabase>[0]
): Promise<TableBlockState> {
  return callStore("getTableBlockState", input);
}

export type CreateTableMergeGroupResult = Result & {
  groupId?: string;
  mergedName?: string;
  group?: import("@/lib/types").TableMergeGroup;
  dayLayout?: import("@/lib/floor-layout-snapshot").AreaFloorLayoutByDate | null;
};

export async function createTableMergeGroupInSupabase(
  input: Parameters<typeof import("./supabase-store-server").createTableMergeGroupInSupabase>[0]
): Promise<CreateTableMergeGroupResult> {
  return callStore<CreateTableMergeGroupResult>("createTableMergeGroup", input);
}

export type CreateTableSplitCloneResult = Result & {
  table?: import("@/lib/types").DiningTable;
  dayLayout?: import("@/lib/floor-layout-snapshot").AreaFloorLayoutByDate | null;
};

export async function createTableSplitCloneInSupabase(
  input: Parameters<typeof import("./supabase-store-server").createTableSplitCloneInSupabase>[0]
): Promise<CreateTableSplitCloneResult> {
  return callStore<CreateTableSplitCloneResult>("createTableSplitClone", input);
}

export async function addTableToMergeGroupInSupabase(input: {
  groupId: string;
  tableId: string;
  repackFloor?: boolean;
}): Promise<Result> {
  return callStore("addTableToMergeGroup", input);
}

export async function removeTableFromMergeGroupInSupabase(input: {
  groupId: string;
  tableId: string;
  repackFloor?: boolean;
}): Promise<Result> {
  return callStore("removeTableFromMergeGroup", input);
}

export async function releaseTableMergeGroupInSupabase(input: {
  groupId: string;
}): Promise<Result> {
  return callStore("releaseTableMergeGroup", input);
}

export async function updateTableMergeGroupDatesInSupabase(input: {
  groupId: string;
  startDate: string;
  endDate: string;
}): Promise<Result> {
  return callStore("updateTableMergeGroupDates", input);
}

export async function listTableMergeGroupsInSupabase(
  branchId: string
): Promise<TableMergeGroup[]> {
  return callStore<TableMergeGroup[]>("listTableMergeGroups", branchId);
}

export async function runBookingMaintenanceInSupabase(): Promise<Result> {
  return callStore("runBookingMaintenance");
}

export async function upsertTableInSupabase(
  input: Parameters<typeof import("./supabase-store-server").upsertTableInSupabase>[0]
): Promise<DiningTable> {
  return callStore<DiningTable>("upsertTable", input);
}

export async function upsertTablesBatchInSupabase(
  tables: Parameters<typeof import("./supabase-store-server").upsertTablesBatchInSupabase>[0]
): Promise<DiningTable[]> {
  return callStore<DiningTable[]>("upsertTablesBatch", tables);
}

export async function updateTableStatusInSupabase(
  tableId: string,
  status: TableStatus
): Promise<void> {
  await callStore("updateTableStatus", { tableId, status });
}

export async function deleteTableInSupabase(tableId: string): Promise<void> {
  await callStore("deleteTable", tableId);
}

export async function deleteTablesInSupabase(tableIds: string[]): Promise<void> {
  await callStore("deleteTables", tableIds);
}

export async function updateTablePositionInSupabase(
  tableId: string,
  x: number,
  y: number
): Promise<void> {
  await callStore("updateTablePosition", { tableId, x, y });
}

export async function addAreaInSupabase(branchId: string, name: string): Promise<Area> {
  return callStore<Area>("addArea", { branchId, name });
}

export async function updateAreaInSupabase(
  areaId: string,
  input: { branchId?: string; name?: string }
): Promise<Result> {
  return callStore("updateArea", { areaId, input });
}

export async function deleteAreaInSupabase(areaId: string): Promise<Result> {
  return callStore("deleteArea", areaId);
}

export async function updateAreaFloorLayoutInSupabase(
  areaId: string,
  input: Parameters<typeof import("./supabase-store-server").updateAreaFloorLayoutInSupabase>[1],
  options?: Parameters<typeof import("./supabase-store-server").updateAreaFloorLayoutInSupabase>[2]
): Promise<void> {
  await callStore("updateAreaFloorLayout", { areaId, input, options });
}

export async function saveFloorLayoutToSupabase(
  areaId: string,
  input: Parameters<typeof import("./supabase-store-server").saveFloorLayoutToSupabase>[1],
  options?: Parameters<typeof import("./supabase-store-server").saveFloorLayoutToSupabase>[2]
): Promise<
  Awaited<ReturnType<typeof import("./supabase-store-server").saveFloorLayoutToSupabase>>
> {
  return callStore("saveFloorLayout", { areaId, input, options });
}

export type { AreaFloorLayoutByDate, FloorLayoutSnapshot } from "./floor-layout-snapshot";
export type { FloorLayoutTemplate } from "./supabase-store-server";

export async function fetchAreaFloorLayoutForDateInSupabase(
  areaId: string,
  layoutDate: string
): Promise<import("./floor-layout-snapshot").AreaFloorLayoutByDate | null> {
  return callStore<import("./floor-layout-snapshot").AreaFloorLayoutByDate | null>(
    "fetchAreaFloorLayoutForDate",
    { areaId, layoutDate }
  );
}

export async function deleteAreaFloorLayoutForDateInSupabase(
  areaId: string,
  layoutDate: string
): Promise<void> {
  await callStore("deleteAreaFloorLayoutForDate", { areaId, layoutDate });
}

export async function listFloorLayoutTemplatesInSupabase(
  areaId: string
): Promise<import("./supabase-store-server").FloorLayoutTemplate[]> {
  return callStore<import("./supabase-store-server").FloorLayoutTemplate[]>(
    "listFloorLayoutTemplates",
    areaId
  );
}

export async function createFloorLayoutTemplateInSupabase(
  areaId: string,
  name: string,
  snapshot: Parameters<
    typeof import("./supabase-store-server").createFloorLayoutTemplateInSupabase
  >[2],
  createdByUserId: string
): Promise<import("./supabase-store-server").FloorLayoutTemplate> {
  return callStore<import("./supabase-store-server").FloorLayoutTemplate>(
    "createFloorLayoutTemplate",
    {
      areaId,
      name,
      snapshot,
      createdByUserId,
    }
  );
}

export async function deleteFloorLayoutTemplateInSupabase(templateId: string): Promise<void> {
  await callStore("deleteFloorLayoutTemplate", templateId);
}

export async function applyFloorLayoutTemplateToDateInSupabase(
  templateId: string,
  areaId: string,
  layoutDate: string,
  updatedByUserId?: string | null
): Promise<import("./floor-layout-snapshot").AreaFloorLayoutByDate> {
  return callStore<import("./floor-layout-snapshot").AreaFloorLayoutByDate>(
    "applyFloorLayoutTemplateToDate",
    {
      templateId,
      areaId,
      layoutDate,
      updatedByUserId,
    }
  );
}

export async function tryAcquireFloorLayoutLockInSupabase(
  areaId: string,
  userId: string
): Promise<{ ok: true } | { ok: false; holderFullName: string }> {
  return callStore("tryAcquireFloorLayoutLock", { areaId, userId });
}

export async function renewFloorLayoutLockInSupabase(
  areaId: string,
  userId: string
): Promise<void> {
  await callStore("renewFloorLayoutLock", { areaId, userId });
}

export async function releaseFloorLayoutLockInSupabase(
  areaId: string,
  userId: string
): Promise<void> {
  await callStore("releaseFloorLayoutLock", { areaId, userId });
}

export async function getFloorLayoutLockInfoInSupabase(areaId: string): Promise<{
  userId: string;
  fullName: string;
  expiresAt: string;
} | null> {
  return callStore("getFloorLayoutLockInfo", areaId);
}

export async function addUserInSupabase(payload: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  branchIds: string[];
}): Promise<Result> {
  if (!isSupabaseEnabled()) {
    return { ok: false, message: "Chưa cấu hình Supabase." };
  }
  return callStore("addUser", payload);
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
  if (!isSupabaseEnabled()) {
    return { ok: false, message: "Chưa cấu hình Supabase." };
  }
  return callStore("updateUser", { userId, input: payload });
}

export async function deleteUserInSupabase(userId: string): Promise<Result> {
  if (!isSupabaseEnabled()) {
    return { ok: false, message: "Chưa cấu hình Supabase." };
  }
  return callStore("deleteUser", userId);
}

export async function markNotificationReadInSupabase(id: string): Promise<void> {
  await callStore("markNotificationRead", id);
}

export async function markNotificationsReadBatchInSupabase(ids: string[]): Promise<void> {
  await callStore("markNotificationsReadBatch", ids);
}
