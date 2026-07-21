"use client";

import dayjs from "dayjs";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  clearBranchPickRequired,
  clearStoredActiveBranch,
  isBranchPickRequired,
  persistActiveBranch,
  resolveActiveBranchIdForUser,
  setBranchPickRequired,
  shouldPickBranchOnLogin,
} from "@/lib/branch-pick";
import { type BookingDuplicateInfo, DUPLICATE_BOOKING_CODE } from "@/lib/booking-duplicate";
import {
  canQueueBooking,
  MERGE_GROUP_CHECK_IN_BLOCKED_BY_MEMBER_OCCUPIED,
  mergeGroupHasOccupiedMemberTable,
  tableStatusForCreateBooking,
  type BookingArrivalIntent,
} from "@/lib/booking-meta";
import { initialState } from "@/lib/initial-state";
import {
  assertEmployeeMaySetBookingStatus,
  EMPLOYEE_MUTATION_BLOCKED,
  isEmployeeUser,
} from "@/lib/employee-access";
import {
  canEditActiveBranch as computeCanEditActiveBranch,
  isManagerViewOnlyBranch,
  MANAGER_VIEW_ONLY_BLOCKED,
} from "@/lib/manager-branch-access";
import { isFloorLayoutRealtimeReloadBlocked } from "@/lib/floor-layout-sync";
import { mergeFloorMapSliceIntoState, reloadScopeForRealtimeTable, type FloorMapStateSlice } from "@/lib/floor-map-state-slice";
import {
  mapRealtimeBookingRow,
  normalizeRealtimePayload,
  type RealtimeBookingPayload,
} from "@/lib/realtime-booking-row";
import { resolveMergeGroupDateRange } from "@/lib/merge-group-utils";
import {
  applyBookingPatchToSnapshot,
  applyBookingRowToSnapshot,
  applyCreateBookingToSnapshot,
  removeBookingFromSnapshot,
} from "@/lib/optimistic-booking-sync";
import { clampFloorNodeSpacing } from "@/lib/floor-map-layout";
import { SyncTombstones } from "@/lib/sync-tombstones";
import {
  addAreaInSupabase,
  addTableToMergeGroupInSupabase,
  addUserInSupabase,
  assignBookingToTableInSupabase,
  type CreateTableMergeGroupResult,
  type CreateTableSplitCloneResult,
  createTableMergeGroupInSupabase,
  createTableSplitCloneInSupabase,
  deleteAreaInSupabase,
  deleteUserInSupabase,
  updateUserInSupabase,
  updateOwnProfileInSupabase,
  checkInBookingInSupabase,
  queueBookingInSupabase,
  createBookingInSupabase,
  fetchFloorMapSlice,
  fetchSnapshot,
  getFloorLayoutLockInfoInSupabase,
  isSupabaseEnabled,
  loginWithSupabase,
  markNotificationReadInSupabase,
  markNotificationsReadBatchInSupabase,
  deleteTableInSupabase,
  deleteTablesInSupabase,
  deleteCustomersInSupabase,
  mergeCustomersInSupabase,
  purgeCustomersWithRelatedDataInSupabase,
  purgeDataInDateRangeInSupabase,
  releaseTableMergeGroupInSupabase,
  updateTableMergeGroupDatesInSupabase,
  removeTableFromMergeGroupInSupabase,
  renewFloorLayoutLockInSupabase,
  releaseFloorLayoutLockInSupabase,
  type SaveFloorLayoutInput,
  type AreaFloorLayoutByDate,
  type FloorLayoutSnapshot,
  type FloorLayoutTemplate,
  applyFloorLayoutTemplateToDateInSupabase,
  createFloorLayoutTemplateInSupabase,
  deleteAreaFloorLayoutForDateInSupabase,
  deleteFloorLayoutTemplateInSupabase,
  fetchAreaFloorLayoutForDateInSupabase,
  listFloorLayoutTemplatesInSupabase,
  saveFloorLayoutToSupabase,
  tryAcquireFloorLayoutLockInSupabase,
  updateAreaFloorLayoutInSupabase,
  updateAreaInSupabase,
  updateBookingStatusInSupabase,
  updateBranchInSupabase,
  updateTablePositionInSupabase,
  updateTableStatusInSupabase,
  upsertTableInSupabase,
  upsertTablesBatchInSupabase,
  updateBookingGuestCountInSupabase,
  updateBookingOrderInSupabase,
  changeBookingTableInSupabase,
  updateBookingRuntimeSettingsInSupabase,
} from "@/lib/supabase-store";
import { getSupabaseBrowserClient, isSupabaseRealtimeConfigured } from "@/lib/supabase";
import {
  AppStateSnapshot,
  Branch,
  Area,
  AppUser,
  Booking,
  BookingRuntimeSettings,
  BookingStatus,
  Customer,
  DiningTable,
  InternalNotification,
  Role,
  TableMergeGroup,
  TableStatus,
} from "@/lib/types";

const SESSION_KEY = "ganh_hao_booking_session_v1";

function userForSession(user: AppUser): AppUser {
  return { ...user, password: "" };
}

function parseStoredSession(raw: string): AppUser | null {
  try {
    const parsed = JSON.parse(raw) as AppUser;
    return userForSession(parsed);
  } catch {
    return null;
  }
}

function readStoredSession(): AppUser | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const storedSession = window.localStorage.getItem(SESSION_KEY);
    return storedSession ? parseStoredSession(storedSession) : null;
  } catch {
    return null;
  }
}

type CreateBookingInput = {
  customerName: string;
  customerPhone?: string;
  branchId: string;
  areaId?: string | null;
  tableId?: string | null;
  /** Assign the booking to a merge group (Bàn gộp) instead of a single table. */
  mergeGroupId?: string | null;
  guestCount?: number;
  bookingAt: string;
  note?: string;
  guestType?: string | null;
  allowDuplicate?: boolean;
  arrivalIntent?: BookingArrivalIntent;
};

type ActionResult = {
  ok: boolean;
  message: string;
  code?: typeof DUPLICATE_BOOKING_CODE;
  duplicates?: BookingDuplicateInfo[];
  bookingId?: string;
};

interface AppContextValue {
  state: AppStateSnapshot;
  currentUser: AppUser | null;
  filteredBranchIds: string[];
  canEditActiveBranch: boolean;
  isLoading: boolean;
  hasSupabase: boolean;
  login: (username: string, password: string) => Promise<AppUser | null>;
  logout: () => void;
  reload: (options?: {
    forceMaintenance?: boolean;
    /** `floor` = bookings/tables/merge slice only; `full` = entire app snapshot (default). */
    scope?: "full" | "floor";
  }) => Promise<void>;
  setActiveBranchId: (branchId: string) => void;
  updateBranch: (
    branchId: string,
    input: { name: string; address: string }
  ) => Promise<ActionResult>;
  updateBookingRuntimeSettings: (input: BookingRuntimeSettings) => Promise<ActionResult>;
  createBooking: (input: CreateBookingInput) => Promise<ActionResult>;
  assignBookingToTable: (input: {
    bookingId: string;
    areaId: string;
    tableId?: string | null;
    mergeGroupId?: string | null;
    guestCount?: number;
  }) => Promise<ActionResult>;
  updateBookingGuestCount: (bookingId: string, guestCount: number) => Promise<ActionResult>;
  updateBookingOrder: (input: {
    bookingId: string;
    bookingAt: string;
    guestCount?: number;
    customerName?: string;
    customerPhone?: string;
    areaId: string | null;
    tableId: string | null;
    mergeGroupId?: string | null;
    allowDuplicate?: boolean;
  }) => Promise<ActionResult>;
  changeBookingTable: (input: {
    bookingId: string;
    areaId: string;
    tableId: string | null;
    mergeGroupId?: string | null;
    seedBooking?: Booking;
  }) => Promise<ActionResult>;
  createTableMergeGroup: (input: {
    branchId: string;
    areaId: string;
    tableIds: string[];
    startDate: string;
    endDate: string;
    layoutDate?: string;
  }) => Promise<CreateTableMergeGroupResult>;
  createTableSplitClone: (input: {
    sourceTableId: string;
    startDate: string;
    endDate: string;
    layoutDate?: string;
  }) => Promise<CreateTableSplitCloneResult>;
  addTableToMergeGroup: (input: {
    groupId: string;
    tableId: string;
    repackFloor?: boolean;
    layoutDate?: string;
  }) => Promise<ActionResult>;
  removeTableFromMergeGroup: (input: {
    groupId: string;
    tableId: string;
    repackFloor?: boolean;
    layoutDate?: string;
  }) => Promise<ActionResult>;
  releaseTableMergeGroup: (input: { groupId: string }) => Promise<ActionResult>;
  updateTableMergeGroupDates: (input: {
    groupId: string;
    startDate: string;
    endDate: string;
  }) => Promise<ActionResult>;
  updateBookingStatus: (
    bookingId: string,
    status: BookingStatus,
    seedBooking?: Booking
  ) => Promise<void>;
  checkInBooking: (bookingId: string, seedBooking?: Booking) => Promise<void>;
  queueBooking: (bookingId: string, seedBooking?: Booking) => Promise<ActionResult>;
  deleteCustomers: (customerIds: string[]) => Promise<ActionResult>;
  /** Branch editors: merge 2+ customers onto one survivor; bookings reassign and add. */
  mergeCustomers: (input: {
    survivorId: string;
    sourceIds: string[];
    fullName: string;
    phone: string | null;
    note: string | null;
  }) => Promise<ActionResult & { survivorId?: string; mergedBookingCount?: number }>;
  /** GM/admin: hard-delete customers and all related bookings. */
  purgeCustomersWithRelatedData: (customerIds: string[]) => Promise<ActionResult>;
  /** GM/admin: delete bookings in a booking_at range; orphans customers with no bookings left. */
  purgeDataInDateRange: (input: { fromIso: string; toIso: string }) => Promise<ActionResult>;
  upsertTable: (table: Omit<DiningTable, "id"> & { id?: string }) => Promise<void>;
  upsertTablesBatch: (tables: Array<Omit<DiningTable, "id"> & { id?: string }>) => Promise<void>;
  deleteTable: (tableId: string) => Promise<void>;
  deleteTables: (tableIds: string[]) => Promise<void>;
  updateTableStatus: (tableId: string, status: TableStatus) => Promise<void>;
  updateTablePosition: (tableId: string, x: number, y: number) => Promise<void>;
  addArea: (branchId: string, name: string) => Promise<void>;
  updateArea: (
    areaId: string,
    input: { branchId?: string; name?: string }
  ) => Promise<ActionResult>;
  deleteArea: (areaId: string) => Promise<ActionResult>;
  addUser: (payload: {
    username: string;
    password: string;
    fullName: string;
    role: Role;
    branchIds: string[];
  }) => Promise<ActionResult>;
  updateUser: (
    userId: string,
    payload: {
      username: string;
      password?: string;
      fullName: string;
      role: Role;
      branchIds: string[];
    }
  ) => Promise<ActionResult>;
  updateOwnProfile: (payload: {
    currentPassword: string;
    fullName: string;
    newPassword?: string;
  }) => Promise<ActionResult>;
  deleteUser: (userId: string) => Promise<ActionResult>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllScopedNotificationsRead: () => Promise<void>;
  saveAreaFloorGrid: (
    areaId: string,
    columns: number,
    rows: number,
    nodeSpacing: number,
    options?: { layoutDate?: string }
  ) => Promise<void>;
  saveFloorLayout: (
    areaId: string,
    input: SaveFloorLayoutInput,
    options?: { layoutDate?: string }
  ) => Promise<AreaFloorLayoutByDate | void>;
  fetchAreaFloorLayoutForDate: (
    areaId: string,
    layoutDate: string
  ) => Promise<AreaFloorLayoutByDate | null>;
  deleteAreaFloorLayoutForDate: (areaId: string, layoutDate: string) => Promise<void>;
  listFloorLayoutTemplates: (areaId: string) => Promise<FloorLayoutTemplate[]>;
  createFloorLayoutTemplate: (
    areaId: string,
    name: string,
    snapshot: FloorLayoutSnapshot
  ) => Promise<FloorLayoutTemplate>;
  deleteFloorLayoutTemplate: (templateId: string) => Promise<void>;
  applyFloorLayoutTemplateToDate: (
    templateId: string,
    areaId: string,
    layoutDate: string
  ) => Promise<AreaFloorLayoutByDate>;
  acquireFloorLayoutEditLock: (
    areaId: string
  ) => Promise<{ ok: true } | { ok: false; holderFullName: string }>;
  renewFloorLayoutEditLock: (areaId: string) => Promise<void>;
  releaseFloorLayoutEditLock: (areaId: string) => Promise<void>;
  getFloorLayoutEditLockInfo: (areaId: string) => Promise<{
    userId: string;
    fullName: string;
    expiresAt: string;
  } | null>;
}

const AppContext = createContext<AppContextValue | null>(null);

/**
 * Branch IDs used to scope bookings, tables, areas, dashboard, etc.
 * Admin / Quản lý tổng: exactly the active branch (switch in header or after login pick).
 * Quản lý chi nhánh: active branch (any branch in the system; view-only when not assigned).
 * Nhân viên: one assigned branch at a time (switch via "Chọn chi nhánh" when multi-branch).
 */
function userScopeBranchIds(user: AppUser | null, activeBranchId?: string): string[] {
  if (!user) {
    return [];
  }
  if (user.role === "manager") {
    if (activeBranchId) {
      return [activeBranchId];
    }
    if (user.branchIds.length > 0) {
      return [user.branchIds[0]];
    }
    return [];
  }
  if (user.role === "employee") {
    if (user.branchIds.length === 0) {
      return [];
    }
    if (user.branchIds.length === 1) {
      return user.branchIds;
    }
    if (activeBranchId && user.branchIds.includes(activeBranchId)) {
      return [activeBranchId];
    }
    return [user.branchIds[0]];
  }
  if (shouldPickBranchOnLogin(user.role) && isBranchPickRequired()) {
    return [];
  }
  if (activeBranchId && user.branchIds.includes(activeBranchId)) {
    return [activeBranchId];
  }
  return [];
}

function canOperateBookingInBranch(
  user: AppUser | null,
  bookingBranchId: string,
  activeBranchId?: string
): boolean {
  if (!user) {
    return false;
  }
  if (user.role === "admin" || user.role === "general_manager") {
    return true;
  }
  if (user.role === "manager") {
    return (
      user.branchIds.includes(bookingBranchId) &&
      activeBranchId != null &&
      activeBranchId === bookingBranchId
    );
  }
  return user.branchIds.includes(bookingBranchId);
}

function managerViewOnlyResult(user: AppUser | null, activeBranchId?: string): ActionResult | null {
  if (isManagerViewOnlyBranch(user, activeBranchId)) {
    return { ok: false, message: MANAGER_VIEW_ONLY_BLOCKED };
  }
  return null;
}

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppStateSnapshot>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const currentUserRef = useRef(currentUser);
  currentUserRef.current = currentUser;

  const hasSupabase = isSupabaseEnabled();
  const hasRealtime = isSupabaseRealtimeConfigured();
  const filteredBranchIds = useMemo(
    () => userScopeBranchIds(currentUser, state.activeBranchId),
    [currentUser, state.activeBranchId]
  );

  const canEditActiveBranch = useMemo(
    () => computeCanEditActiveBranch(currentUser, state.activeBranchId),
    [currentUser, state.activeBranchId]
  );

  const lastReloadAtRef = useRef<number>(0);
  const reloadInFlightRef = useRef(false);
  const reloadPendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadPendingSourceRef = useRef<string | undefined>(undefined);
  const failedPatchReloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableDeleteTombstonesRef = useRef(new SyncTombstones());
  const areaDeleteTombstonesRef = useRef(new SyncTombstones());
  const customerDeleteTombstonesRef = useRef(new SyncTombstones());

  const applyTombstonesToFloorSlice = useCallback((slice: FloorMapStateSlice): FloorMapStateSlice => {
    tableDeleteTombstonesRef.current.reconcile(slice.tables);
    areaDeleteTombstonesRef.current.reconcile(slice.areas);
    return {
      ...slice,
      tables: tableDeleteTombstonesRef.current.filterById(slice.tables),
      areas: areaDeleteTombstonesRef.current.filterById(slice.areas),
    };
  }, []);

  const applyTombstonesToSnapshot = useCallback((snapshot: AppStateSnapshot): AppStateSnapshot => {
    tableDeleteTombstonesRef.current.reconcile(snapshot.tables);
    areaDeleteTombstonesRef.current.reconcile(snapshot.areas);
    customerDeleteTombstonesRef.current.reconcile(snapshot.customers);
    return {
      ...snapshot,
      tables: tableDeleteTombstonesRef.current.filterById(snapshot.tables),
      areas: areaDeleteTombstonesRef.current.filterById(snapshot.areas),
      customers: customerDeleteTombstonesRef.current.filterById(snapshot.customers),
    };
  }, []);

  const reload = useCallback(
    async (options?: { forceMaintenance?: boolean; scope?: "full" | "floor" }) => {
      const mergeActive = (
        prev: AppStateSnapshot
      ): AppStateSnapshot["activeBranchId"] => {
        const user = currentUserRef.current;
        if (!user) {
          return undefined;
        }
        return resolveActiveBranchIdForUser(user, {
          allBranchIds: prev.branches.map((branch) => branch.id),
        });
      };

      if (!hasSupabase) {
        setState((prev) => ({
          ...initialState,
          activeBranchId: mergeActive(prev),
        }));
        return;
      }

      if (options?.scope === "floor") {
        const slice = await fetchFloorMapSlice(filteredBranchIds);
        const sanitized = applyTombstonesToFloorSlice(slice);
        setState((prev) => mergeFloorMapSliceIntoState(prev, sanitized, filteredBranchIds));
        return;
      }

      const snapshot = await fetchSnapshot({
        forceMaintenance: options?.forceMaintenance,
      });
      const sanitized = applyTombstonesToSnapshot(snapshot);
      setState((prev) => ({
        ...sanitized,
        activeBranchId: mergeActive(prev),
      }));
    },
    [applyTombstonesToFloorSlice, applyTombstonesToSnapshot, filteredBranchIds, hasSupabase, currentUser]
  );

  useEffect(() => {
    const storedUser = readStoredSession();
    if (storedUser) {
      setCurrentUser(storedUser);
    }
    setSessionReady(true);
  }, []);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }
    const run = async () => {
      try {
        await reload();
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  }, [reload, sessionReady]);

  useEffect(() => {
    if (!hasSupabase) {
      return;
    }

    let cancelled = false;
    const realtime = getSupabaseBrowserClient();
    const realtimeChannelName = `app-snapshot-sync:${currentUser?.id ?? "guest"}`;
    const floorEditSensitiveTables = new Set(["tables", "areas", "area_floor_layout_by_date"]);

    const flushReload = () => {
      reloadPendingTimerRef.current = null;
      if (cancelled) return;
      if (isFloorLayoutRealtimeReloadBlocked()) return;
      if (reloadInFlightRef.current) {
        reloadPendingTimerRef.current = setTimeout(flushReload, 150);
        return;
      }
      const elapsed = Date.now() - lastReloadAtRef.current;
      if (elapsed < 400) {
        reloadPendingTimerRef.current = setTimeout(flushReload, 400 - elapsed);
        return;
      }
      const sourceTable = reloadPendingSourceRef.current;
      reloadPendingSourceRef.current = undefined;
      reloadInFlightRef.current = true;
      lastReloadAtRef.current = Date.now();
      const scope = reloadScopeForRealtimeTable(sourceTable);
      Promise.resolve(reload({ scope }))
        .catch(() => {
          // Keep running; fallback timer/realtime retries will pull the next slice/snapshot.
        })
        .finally(() => {
          reloadInFlightRef.current = false;
          if (reloadPendingSourceRef.current !== undefined) {
            flushReload();
          }
        });
    };

    const runReload = (sourceTable?: string) => {
      if (cancelled) return;
      if (isFloorLayoutRealtimeReloadBlocked()) return;
      if (sourceTable !== undefined) {
        reloadPendingSourceRef.current = sourceTable;
      }
      if (reloadPendingTimerRef.current) {
        clearTimeout(reloadPendingTimerRef.current);
      }
      reloadPendingTimerRef.current = setTimeout(flushReload, 50);
    };

    const FAILED_PATCH_RELOAD_MS = 2_500;
    const scheduleFailedPatchReload = (sourceTable: string) => {
      if (failedPatchReloadTimerRef.current) {
        clearTimeout(failedPatchReloadTimerRef.current);
      }
      failedPatchReloadTimerRef.current = setTimeout(() => {
        failedPatchReloadTimerRef.current = null;
        if (!cancelled) {
          runReload(sourceTable);
        }
      }, FAILED_PATCH_RELOAD_MS);
    };

    type RealtimeRow = Record<string, unknown>;

    const mapRealtimeRuntimeSettings = (row: RealtimeRow): BookingRuntimeSettings | null => {
      const standardTurnaroundMinutes = row.standard_turnaround_minutes;
      const noShowGraceMinutes = row.no_show_grace_minutes;
      const groupPartyGuestThreshold = row.group_party_guest_threshold;
      const repeatCustomerMinCompleted = row.repeat_customer_min_completed;
      const receptionArrivalGraceMinutes = row.reception_arrival_grace_minutes;
      const lateGraceMinutesRaw = row.late_grace_minutes;
      if (
        typeof standardTurnaroundMinutes !== "number" ||
        typeof noShowGraceMinutes !== "number" ||
        typeof groupPartyGuestThreshold !== "number" ||
        typeof repeatCustomerMinCompleted !== "number" ||
        typeof receptionArrivalGraceMinutes !== "number"
      ) {
        return null;
      }
      const lateGraceMinutes =
        typeof lateGraceMinutesRaw === "number" ? lateGraceMinutesRaw : noShowGraceMinutes;
      return {
        standardTurnaroundMinutes,
        noShowGraceMinutes,
        groupPartyGuestThreshold,
        repeatCustomerMinCompleted,
        receptionArrivalGraceMinutes,
        lateGraceMinutes,
      };
    };

    const mapRealtimeNotification = (row: RealtimeRow): InternalNotification | null => {
      const id = row.id;
      const title = row.title;
      const message = row.message;
      const createdAt = row.created_at;
      const isRead = row.is_read;
      const branchId = row.branch_id;
      if (
        typeof id !== "string" ||
        typeof title !== "string" ||
        typeof message !== "string" ||
        typeof createdAt !== "string" ||
        typeof isRead !== "boolean"
      ) {
        return null;
      }
      return {
        id,
        title,
        message,
        createdAt,
        isRead,
        branchId: typeof branchId === "string" ? branchId : undefined,
      };
    };

    const mapRealtimeCustomer = (row: RealtimeRow): Customer | null => {
      const id = row.id;
      const fullName = row.full_name;
      const phone = row.phone;
      const note = row.note;
      if (typeof id !== "string" || typeof fullName !== "string") {
        return null;
      }
      if (phone !== null && typeof phone !== "string") {
        return null;
      }
      if (note !== null && typeof note !== "string") {
        return null;
      }
      return {
        id,
        fullName,
        phone: phone ?? null,
        note: note ?? undefined,
        createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : undefined,
      };
    };

    const tableStatuses: TableStatus[] = ["available", "hold", "late", "occupied", "locked"];

    const mapRealtimeTable = (row: RealtimeRow): DiningTable | null => {
      const id = row.id;
      const branchId = row.branch_id;
      const areaId = row.area_id;
      const name = row.name;
      const status = row.status;
      const positionX = row.position_x;
      const positionY = row.position_y;
      if (
        typeof id !== "string" ||
        typeof branchId !== "string" ||
        typeof areaId !== "string" ||
        typeof name !== "string" ||
        typeof status !== "string" ||
        !tableStatuses.includes(status as TableStatus) ||
        typeof positionX !== "number" ||
        typeof positionY !== "number"
      ) {
        return null;
      }
      return {
        id,
        branchId,
        areaId,
        name,
        status: status as TableStatus,
        positionX,
        positionY,
      };
    };

    const mapRealtimeArea = (row: RealtimeRow): Area | null => {
      const id = row.id;
      const branchId = row.branch_id;
      const name = row.name;
      const floorGridColumns = row.floor_grid_columns;
      const floorGridRows = row.floor_grid_rows;
      const floorNodeSpacing = row.floor_node_spacing;
      if (typeof id !== "string" || typeof branchId !== "string" || typeof name !== "string") {
        return null;
      }
      if (floorGridColumns !== undefined && floorGridColumns !== null && typeof floorGridColumns !== "number") {
        return null;
      }
      if (floorGridRows !== undefined && floorGridRows !== null && typeof floorGridRows !== "number") {
        return null;
      }
      if (floorNodeSpacing !== undefined && floorNodeSpacing !== null && typeof floorNodeSpacing !== "number") {
        return null;
      }
      return {
        id,
        branchId,
        name,
        floorGridColumns:
          typeof floorGridColumns === "number" ? floorGridColumns : undefined,
        floorGridRows: typeof floorGridRows === "number" ? floorGridRows : undefined,
        floorNodeSpacing:
          typeof floorNodeSpacing === "number" ? floorNodeSpacing : undefined,
      };
    };

    const mapRealtimeBranch = (row: RealtimeRow): Branch | null => {
      const id = row.id;
      const name = row.name;
      const address = row.address;
      if (typeof id !== "string" || typeof name !== "string" || typeof address !== "string") {
        return null;
      }
      return { id, name, address };
    };

    const roles: Role[] = ["admin", "general_manager", "manager", "employee"];

    const mapRealtimeUser = (row: RealtimeRow): AppUser | null => {
      const id = row.id;
      const username = row.username;
      const fullName = row.full_name;
      const role = row.role;
      const branchIds = row.branch_ids;
      if (
        typeof id !== "string" ||
        typeof username !== "string" ||
        typeof fullName !== "string" ||
        typeof role !== "string" ||
        !roles.includes(role as Role)
      ) {
        return null;
      }
      if (
        branchIds !== null &&
        branchIds !== undefined &&
        (!Array.isArray(branchIds) || !branchIds.every((item) => typeof item === "string"))
      ) {
        return null;
      }
      return {
        id,
        username,
        password: typeof row.password === "string" ? row.password : "",
        fullName,
        role: role as Role,
        branchIds: (branchIds ?? []) as string[],
        createdAt: typeof row.created_at === "string" ? row.created_at : null,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
        createdByUserId:
          typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
        updatedByUserId:
          typeof row.updated_by_user_id === "string" ? row.updated_by_user_id : null,
      };
    };

    const mapRealtimeMergeGroup = (row: RealtimeRow): TableMergeGroup | null => {
      const id = row.id;
      const branchId = row.branch_id;
      const areaId = row.area_id;
      const autoNumber = row.auto_number;
      const mergedName = row.merged_name;
      const status = row.status;
      const createdAt = row.created_at;
      const releasedAt = row.released_at;
      const startDateRaw = row.start_date;
      const endDateRaw = row.end_date;
      if (
        typeof id !== "string" ||
        typeof branchId !== "string" ||
        typeof areaId !== "string" ||
        typeof mergedName !== "string" ||
        typeof status !== "string" ||
        typeof createdAt !== "string"
      ) {
        return null;
      }
      const { startDate, endDate } = resolveMergeGroupDateRange({
        created_at: createdAt,
        start_date: typeof startDateRaw === "string" ? startDateRaw : null,
        end_date: typeof endDateRaw === "string" ? endDateRaw : null,
      });
      return {
        id,
        branchId,
        areaId,
        autoNumber: typeof autoNumber === "number" ? autoNumber : 0,
        mergedName,
        tableIds: [],
        status: status === "released" ? "released" : "active",
        startDate,
        endDate,
        createdAt,
        releasedAt: typeof releasedAt === "string" ? releasedAt : null,
      };
    };

    const applyRealtimePatch = (table: string, payload: RealtimeBookingPayload): boolean => {
      if (table === "booking_runtime_settings") {
        if (payload.eventType === "DELETE" || !payload.new) {
          return false;
        }
        if (payload.new.id !== true) {
          return true;
        }
        const mapped = mapRealtimeRuntimeSettings(payload.new);
        if (!mapped) {
          return false;
        }
        setState((prev) => ({ ...prev, bookingRuntimeSettings: mapped }));
        return true;
      }
      if (table === "internal_notifications") {
        if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (typeof id !== "string") {
            return false;
          }
          setState((prev) => ({
            ...prev,
            notifications: prev.notifications.filter((item) => item.id !== id),
          }));
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const mapped = mapRealtimeNotification(payload.new);
        if (!mapped) {
          return false;
        }
        setState((prev) => {
          const next = [mapped, ...prev.notifications.filter((item) => item.id !== mapped.id)].sort(
            (a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()
          );
          return { ...prev, notifications: next };
        });
        return true;
      }
      if (table === "bookings") {
        if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (typeof id !== "string") {
            return false;
          }
          setState((prev) => removeBookingFromSnapshot(prev, id) ?? prev);
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const mapped = mapRealtimeBookingRow(payload.new);
        if (!mapped) {
          return false;
        }
        setState((prev) => {
          const previous = prev.bookings.find((item) => item.id === mapped.id);
          return applyBookingRowToSnapshot(prev, mapped, previous?.tableId);
        });
        return true;
      }
      if (table === "customers") {
        if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (typeof id !== "string") {
            return false;
          }
          setState((prev) => ({
            ...prev,
            customers: prev.customers.filter((item) => item.id !== id),
          }));
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const mapped = mapRealtimeCustomer(payload.new);
        if (!mapped) {
          return false;
        }
        setState((prev) => ({
          ...prev,
          customers: [mapped, ...prev.customers.filter((item) => item.id !== mapped.id)],
        }));
        return true;
      }
      if (table === "tables") {
        if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (typeof id !== "string") {
            return false;
          }
          tableDeleteTombstonesRef.current.clear(id);
          setState((prev) => ({
            ...prev,
            tables: prev.tables.filter((item) => item.id !== id),
          }));
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const mapped = mapRealtimeTable(payload.new);
        if (!mapped) {
          return false;
        }
        if (tableDeleteTombstonesRef.current.has(mapped.id)) {
          return true;
        }
        setState((prev) => {
          const existingIndex = prev.tables.findIndex((item) => item.id === mapped.id);
          if (existingIndex === -1) {
            return { ...prev, tables: [...prev.tables, mapped] };
          }
          const next = [...prev.tables];
          next[existingIndex] = mapped;
          return { ...prev, tables: next };
        });
        return true;
      }
      if (table === "areas") {
        if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (typeof id !== "string") {
            return false;
          }
          areaDeleteTombstonesRef.current.clear(id);
          setState((prev) => ({
            ...prev,
            areas: prev.areas.filter((item) => item.id !== id),
          }));
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const mapped = mapRealtimeArea(payload.new);
        if (!mapped) {
          return false;
        }
        if (areaDeleteTombstonesRef.current.has(mapped.id)) {
          return true;
        }
        setState((prev) => {
          const existingIndex = prev.areas.findIndex((item) => item.id === mapped.id);
          if (existingIndex === -1) {
            return { ...prev, areas: [...prev.areas, mapped] };
          }
          const next = [...prev.areas];
          next[existingIndex] = mapped;
          return { ...prev, areas: next };
        });
        return true;
      }
      if (table === "branches") {
        if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (typeof id !== "string") {
            return false;
          }
          setState((prev) => ({
            ...prev,
            branches: prev.branches.filter((item) => item.id !== id),
          }));
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const mapped = mapRealtimeBranch(payload.new);
        if (!mapped) {
          return false;
        }
        setState((prev) => {
          const existingIndex = prev.branches.findIndex((item) => item.id === mapped.id);
          if (existingIndex === -1) {
            return { ...prev, branches: [...prev.branches, mapped] };
          }
          const next = [...prev.branches];
          next[existingIndex] = mapped;
          return { ...prev, branches: next };
        });
        return true;
      }
      if (table === "app_users") {
        if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (typeof id !== "string") {
            return false;
          }
          setState((prev) => ({
            ...prev,
            users: prev.users.filter((item) => item.id !== id),
          }));
          setCurrentUser((prev) => (prev?.id === id ? null : prev));
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const mapped = mapRealtimeUser(payload.new);
        if (!mapped) {
          return false;
        }
        setState((prev) => {
          const existingIndex = prev.users.findIndex((item) => item.id === mapped.id);
          if (existingIndex === -1) {
            return { ...prev, users: [...prev.users, mapped] };
          }
          const next = [...prev.users];
          next[existingIndex] = mapped;
          return { ...prev, users: next };
        });
        setCurrentUser((prev) => (prev?.id === mapped.id ? userForSession(mapped) : prev));
        return true;
      }
      if (table === "table_merge_groups") {
        if (payload.eventType === "DELETE") {
          const id = payload.old?.id;
          if (typeof id !== "string") {
            return false;
          }
          setState((prev) => ({
            ...prev,
            mergeGroups: prev.mergeGroups.filter((item) => item.id !== id),
          }));
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const mapped = mapRealtimeMergeGroup(payload.new);
        if (!mapped) {
          return false;
        }
        if (mapped.status !== "active") {
          setState((prev) => ({
            ...prev,
            mergeGroups: prev.mergeGroups.filter((item) => item.id !== mapped.id),
          }));
          return true;
        }
        setState((prev) => {
          const existing = prev.mergeGroups.find((item) => item.id === mapped.id);
          const nextGroup: TableMergeGroup = {
            ...mapped,
            tableIds: existing?.tableIds ?? mapped.tableIds,
          };
          const without = prev.mergeGroups.filter((item) => item.id !== mapped.id);
          return { ...prev, mergeGroups: [...without, nextGroup] };
        });
        return true;
      }
      if (table === "table_merge_members") {
        if (payload.eventType === "UPDATE") {
          // Member order changes do not affect floor-map grid; avoid slow floor slice reload.
          return true;
        }
        if (payload.eventType === "DELETE") {
          const groupId = payload.old?.group_id;
          const tableId = payload.old?.table_id;
          if (typeof groupId !== "string" || typeof tableId !== "string") {
            return false;
          }
          setState((prev) => ({
            ...prev,
            mergeGroups: prev.mergeGroups.map((group) =>
              group.id === groupId
                ? { ...group, tableIds: group.tableIds.filter((id) => id !== tableId) }
                : group
            ),
          }));
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const groupId = payload.new.group_id;
        const tableId = payload.new.table_id;
        if (typeof groupId !== "string" || typeof tableId !== "string") {
          return false;
        }
        setState((prev) => ({
          ...prev,
          mergeGroups: prev.mergeGroups.map((group) => {
            if (group.id !== groupId || group.tableIds.includes(tableId)) {
              return group;
            }
            return { ...group, tableIds: [...group.tableIds, tableId] };
          }),
        }));
        return true;
      }
      return false;
    };

    const globalRealtimeTables = [
      "app_users",
      "booking_runtime_settings",
      "branches",
      "table_merge_members",
      "customers",
    ] as const;
    const branchScopedRealtimeTables = [
      "areas",
      "tables",
      "bookings",
      "table_merge_groups",
    ] as const;
    const scopedBranchIds = filteredBranchIds;
    const bindTableChange = (
      channel: ReturnType<NonNullable<typeof realtime>["channel"]>,
      table: string,
      filter?: string
    ) =>
      channel.on(
        "postgres_changes",
        filter ? { event: "*", schema: "public", table, filter } : { event: "*", schema: "public", table },
        (payload) => {
          const normalized = normalizeRealtimePayload(payload);
          if (
            isFloorLayoutRealtimeReloadBlocked() &&
            floorEditSensitiveTables.has(table)
          ) {
            return;
          }
          if (applyRealtimePatch(table, normalized)) {
            return;
          }
          if (table === "bookings" || table === "tables") {
            scheduleFailedPatchReload(table);
            return;
          }
          runReload(table);
        }
      );

    const realtimeChannel =
      hasRealtime && realtime
        ? (() => {
            let channel = globalRealtimeTables.reduce((ch, table) => bindTableChange(ch, table), realtime.channel(realtimeChannelName));

            for (const table of branchScopedRealtimeTables) {
              if (scopedBranchIds.length === 0) {
                channel = bindTableChange(channel, table);
                continue;
              }
              for (const branchId of scopedBranchIds) {
                channel = bindTableChange(channel, table, `branch_id=eq.${branchId}`);
              }
            }

            if (scopedBranchIds.length === 0) {
              channel = bindTableChange(channel, "internal_notifications");
            } else {
              for (const branchId of scopedBranchIds) {
                channel = bindTableChange(channel, "internal_notifications", `branch_id=eq.${branchId}`);
              }
              // Global notifications are not branch-bound and should still trigger a sync.
              channel = bindTableChange(channel, "internal_notifications", "branch_id=is.null");
            }

            return channel;
          })()
            .subscribe((status) => {
              if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                console.warn(
                  `[realtime] ${realtimeChannelName} status=${status}`
                );
              }
              if (
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT" ||
                status === "CLOSED"
              ) {
                scheduleFailedPatchReload("bookings");
              }
            })
        : null;

    const fallbackInterval = setInterval(() => {
      runReload("bookings");
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(fallbackInterval);
      if (failedPatchReloadTimerRef.current) {
        clearTimeout(failedPatchReloadTimerRef.current);
        failedPatchReloadTimerRef.current = null;
      }
      if (reloadPendingTimerRef.current) {
        clearTimeout(reloadPendingTimerRef.current);
        reloadPendingTimerRef.current = null;
      }
      reloadPendingSourceRef.current = undefined;
      if (realtimeChannel && realtime) {
        void realtime.removeChannel(realtimeChannel);
      }
    };
  }, [filteredBranchIds, hasRealtime, hasSupabase, reload, currentUser?.id]);

  useEffect(() => {
    if (!sessionReady || !currentUser) {
      return;
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(userForSession(currentUser)));
  }, [currentUser, sessionReady]);

  const login = async (username: string, password: string) => {
    let user: AppUser | null = null;

    if (hasSupabase) {
      user = await loginWithSupabase(username, password);
    } else {
      user =
        state.users.find(
          (item) => item.username === username && item.password === password
        ) ?? null;
    }

    if (!user) {
      return null;
    }

    const sessionUser = userForSession(user);
    setCurrentUser(sessionUser);
    if (shouldPickBranchOnLogin(user.role)) {
      setBranchPickRequired();
      clearStoredActiveBranch(user.id);
      setState((prev) => ({
        ...prev,
        activeBranchId: undefined,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        activeBranchId: resolveActiveBranchIdForUser(user, { assignedOnly: true }),
      }));
    }
    return sessionUser;
  };

  const logout = () => {
    clearBranchPickRequired();
    setCurrentUser(null);
    setState((prev) => ({ ...prev, activeBranchId: undefined }));
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      // Ignore storage errors (private mode, etc.).
    }
  };

  const setActiveBranchId = (branchId: string) => {
    if (currentUser) {
      if (shouldPickBranchOnLogin(currentUser.role)) {
        persistActiveBranch(currentUser, branchId);
      } else if (currentUser.role === "manager") {
        persistActiveBranch(currentUser, branchId);
      } else if (currentUser.role === "employee" && currentUser.branchIds.length > 1) {
        persistActiveBranch(currentUser, branchId);
      }
    }
    setState((prev) => ({ ...prev, activeBranchId: branchId }));
  };

  const updateBranch = async (branchId: string, input: { name: string; address: string }) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    if (!hasSupabase) {
      setState((prev) => ({
        ...prev,
        branches: prev.branches.map((branch) =>
          branch.id === branchId ? { ...branch, ...input } : branch
        ),
      }));
      return { ok: true, message: "Đã cập nhật chi nhánh." };
    }
    const result = await updateBranchInSupabase(branchId, input);
    if (result.ok) {
      setState((prev) => ({
        ...prev,
        branches: prev.branches.map((branch) =>
          branch.id === branchId ? { ...branch, ...input } : branch
        ),
      }));
    }
    return result;
  };

  const updateBookingRuntimeSettings = async (input: BookingRuntimeSettings) => {
    if (
      !currentUser ||
      (currentUser.role !== "admin" && currentUser.role !== "general_manager")
    ) {
      return { ok: false, message: "Chỉ Admin và Quản lý tổng được chỉnh cấu hình này." };
    }
    if (!hasSupabase) {
      setState((prev) => ({
        ...prev,
        bookingRuntimeSettings: input,
      }));
      return { ok: true, message: "Đã lưu cấu hình (chế độ ngoại tuyến)." };
    }
    const result = await updateBookingRuntimeSettingsInSupabase(input);
    if (result.ok) {
      setState((prev) => ({
        ...prev,
        bookingRuntimeSettings: input,
      }));
    }
    return result;
  };

  const createBooking = async (input: CreateBookingInput) => {
    if (!currentUser) {
      return { ok: false, message: "Vui lòng đăng nhập." };
    }
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (
      viewOnlyBlock &&
      !(
        currentUser.role === "manager" &&
        currentUser.branchIds.includes(input.branchId)
      )
    ) {
      return viewOnlyBlock;
    }

    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase. Vui lòng cấu hình .env.local." };
    }

    // Optimistic: immediately reflect auto table state from booking time.
    // so UI updates without waiting for the next polling reload.
    const tableBefore = input.tableId
      ? state.tables.find((t) => t.id === input.tableId)
      : undefined;
    if (tableBefore && tableBefore.status !== "locked") {
      const nextStatus: TableStatus = tableStatusForCreateBooking(
        input.bookingAt,
        input.arrivalIntent
      );
      setState((prev) => ({
        ...prev,
        tables: prev.tables.map((t) =>
          t.id === input.tableId ? { ...t, status: nextStatus } : t
        ),
      }));
    }

    try {
      const result = await createBookingInSupabase({
        ...input,
        createdByUserId: currentUser.id,
      });

      if (!result.ok) {
        if (tableBefore) {
          setState((prev) => ({
            ...prev,
            tables: prev.tables.map((t) =>
              t.id === tableBefore.id ? { ...t, status: tableBefore.status } : t
            ),
          }));
        }
      } else if (result.bookingId) {
        setState((prev) =>
          applyCreateBookingToSnapshot(prev, input, result.bookingId!, currentUser.id)
        );
      }

      return result;
    } catch (error) {
      if (tableBefore) {
        setState((prev) => ({
          ...prev,
          tables: prev.tables.map((t) =>
            t.id === tableBefore.id ? { ...t, status: tableBefore.status } : t
          ),
        }));
      }
      return { ok: false, message: error instanceof Error ? error.message : "Không tạo được booking." };
    }
  };

  const assignBookingToTable = async (input: {
    bookingId: string;
    areaId: string;
    tableId?: string | null;
    mergeGroupId?: string | null;
    guestCount?: number;
  }) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    const booking = state.bookings.find((item) => item.id === input.bookingId);
    if (!booking) {
      return { ok: false, message: "Không tìm thấy booking." };
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId, state.activeBranchId)) {
      return { ok: false, message: "Bạn không có quyền chỉnh booking của chi nhánh này." };
    }
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }

    const revertPatch: Partial<Booking> = {
      areaId: booking.areaId,
      tableId: booking.tableId,
      mergeGroupId: booking.mergeGroupId,
      status: booking.status,
      guestCount: booking.guestCount,
    };

    if (input.tableId || input.mergeGroupId) {
      setState((prev) => {
        const next = applyBookingPatchToSnapshot(prev, input.bookingId, {
          areaId: input.areaId,
          tableId: input.tableId ?? null,
          mergeGroupId: input.mergeGroupId ?? null,
          status: "confirmed",
          lateMarkedAt: undefined,
          checkedInAt: undefined,
          guestCount:
            typeof input.guestCount === "number" && Number.isFinite(input.guestCount)
              ? Math.max(1, Math.round(input.guestCount))
              : booking.guestCount,
        });
        return next ?? prev;
      });
    }

    const result = await assignBookingToTableInSupabase(input);
    if (!result.ok) {
      setState((prev) => {
        const next = applyBookingPatchToSnapshot(prev, input.bookingId, revertPatch);
        return next ?? prev;
      });
    }
    return result;
  };

  const updateBookingGuestCount = async (bookingId: string, guestCount: number) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      return { ok: false, message: "Không tìm thấy booking." };
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId, state.activeBranchId)) {
      return { ok: false, message: "Bạn không có quyền chỉnh booking của chi nhánh này." };
    }
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }
    setState((prev) => {
      const next = applyBookingPatchToSnapshot(prev, bookingId, {
        guestCount: Math.max(1, Math.round(guestCount)),
      });
      return next ?? prev;
    });

    const result = await updateBookingGuestCountInSupabase(bookingId, guestCount);
    if (!result.ok) {
      setState((prev) => {
        const next = applyBookingPatchToSnapshot(prev, bookingId, {
          guestCount: booking.guestCount,
        });
        return next ?? prev;
      });
    }
    return result;
  };

  const updateBookingOrder = async (input: {
    bookingId: string;
    bookingAt: string;
    guestCount?: number;
    customerName?: string;
    customerPhone?: string;
    areaId: string | null;
    tableId: string | null;
    mergeGroupId?: string | null;
    allowDuplicate?: boolean;
  }) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }
    if (!currentUser) {
      return { ok: false, message: "Chưa đăng nhập." };
    }
    const booking = state.bookings.find((item) => item.id === input.bookingId);
    if (!booking) {
      return { ok: false, message: "Không tìm thấy booking." };
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId, state.activeBranchId)) {
      return { ok: false, message: "Bạn không có quyền chỉnh booking của chi nhánh này." };
    }
    const existingCustomer = state.customers.find((item) => item.id === booking.customerId);
    const previousCustomerName = existingCustomer?.fullName;
    const previousStartIso = dayjs(booking.startTime ?? booking.bookingAt).toISOString();
    const nextStartIso = dayjs(input.bookingAt).toISOString();
    const timeChanged = previousStartIso !== nextStartIso;
    const hasNextTarget = Boolean(input.tableId) || Boolean(input.mergeGroupId);
    const rescheduleLate = booking.status === "late" && timeChanged;
    const revertPatch: Partial<Booking> = {
      bookingAt: booking.bookingAt,
      startTime: booking.startTime,
      endTime: booking.endTime,
      guestCount: booking.guestCount,
      areaId: booking.areaId,
      tableId: booking.tableId,
      mergeGroupId: booking.mergeGroupId,
      status: booking.status,
      lateMarkedAt: booking.lateMarkedAt,
      checkedInAt: booking.checkedInAt,
    };
    const optimisticPatch: Partial<Booking> = {
      bookingAt: input.bookingAt,
      startTime: input.bookingAt,
      guestCount:
        typeof input.guestCount === "number" && Number.isFinite(input.guestCount)
          ? Math.max(1, Math.round(input.guestCount))
          : booking.guestCount,
      ...(rescheduleLate
        ? hasNextTarget
          ? {
              status: "confirmed" as const,
              areaId: input.areaId,
              tableId: input.tableId,
              mergeGroupId: input.mergeGroupId ?? null,
              lateMarkedAt: null,
              checkedInAt: undefined,
            }
          : {
              status: "pending" as const,
              areaId: null,
              tableId: null,
              mergeGroupId: null,
              lateMarkedAt: null,
              checkedInAt: undefined,
            }
        : {
            areaId: input.areaId,
            tableId: input.tableId,
            mergeGroupId: input.mergeGroupId ?? null,
          }),
    };

    setState((prev) => {
      const next = applyBookingPatchToSnapshot(prev, input.bookingId, optimisticPatch);
      if (!next) {
        return prev;
      }
      const trimmedName = input.customerName?.trim();
      if (!trimmedName || !booking.customerId || trimmedName === previousCustomerName) {
        return next;
      }
      return {
        ...next,
        customers: next.customers.map((customer) =>
          customer.id === booking.customerId ? { ...customer, fullName: trimmedName } : customer
        ),
      };
    });

    const result = await updateBookingOrderInSupabase({
      ...input,
      editedByUserId: currentUser.id,
    });
    if (!result.ok) {
      setState((prev) => {
        const next = applyBookingPatchToSnapshot(prev, input.bookingId, revertPatch);
        if (!next) {
          return prev;
        }
        if (previousCustomerName === undefined || !booking.customerId) {
          return next;
        }
        return {
          ...next,
          customers: next.customers.map((customer) =>
            customer.id === booking.customerId
              ? { ...customer, fullName: previousCustomerName }
              : customer
          ),
        };
      });
    }
    return result;
  };

  const changeBookingTable = async (input: {
    bookingId: string;
    areaId: string;
    tableId: string | null;
    mergeGroupId?: string | null;
    seedBooking?: Booking;
  }) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }
    if (!currentUser) {
      return { ok: false, message: "Chưa đăng nhập." };
    }
    const booking =
      state.bookings.find((item) => item.id === input.bookingId) ?? input.seedBooking;
    if (!booking) {
      return { ok: false, message: "Không tìm thấy booking." };
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId, state.activeBranchId)) {
      return { ok: false, message: "Bạn không có quyền chỉnh booking của chi nhánh này." };
    }
    const editedAt = dayjs().toISOString();
    const revertPatch: Partial<Booking> = {
      areaId: booking.areaId,
      tableId: booking.tableId,
      mergeGroupId: booking.mergeGroupId,
      status: booking.status,
      lastEditedAt: booking.lastEditedAt,
    };
    const optimisticPatch: Partial<Booking> = {
      areaId: input.areaId,
      tableId: input.tableId,
      mergeGroupId: input.mergeGroupId ?? null,
      status: booking.status,
      lastEditedAt: editedAt,
    };

    setState((prev) => {
      const seeded = seedBookingIntoSnapshot(prev, input.bookingId, input.seedBooking);
      const next = applyBookingPatchToSnapshot(seeded, input.bookingId, optimisticPatch);
      return next ?? seeded;
    });

    const result = await changeBookingTableInSupabase({
      bookingId: input.bookingId,
      areaId: input.areaId,
      tableId: input.tableId,
      mergeGroupId: input.mergeGroupId,
      editedByUserId: currentUser.id,
    });
    if (!result.ok) {
      setState((prev) => {
        const seeded = seedBookingIntoSnapshot(prev, input.bookingId, input.seedBooking);
        const next = applyBookingPatchToSnapshot(seeded, input.bookingId, revertPatch);
        return next ?? seeded;
      });
    }
    return result;
  };

  const seedBookingIntoSnapshot = (
    prev: AppStateSnapshot,
    bookingId: string,
    seedBooking?: Booking
  ): AppStateSnapshot => {
    if (!seedBooking || prev.bookings.some((item) => item.id === bookingId)) {
      return prev;
    }
    return applyBookingRowToSnapshot(prev, seedBooking);
  };

  const updateBookingStatus = async (
    bookingId: string,
    status: BookingStatus,
    seedBooking?: Booking
  ) => {
    if (!hasSupabase) {
      return;
    }
    const booking =
      state.bookings.find((item) => item.id === bookingId) ?? seedBooking;
    if (!booking) {
      throw new Error("Không tìm thấy booking.");
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId, state.activeBranchId)) {
      throw new Error("Bạn không có quyền chỉnh booking của chi nhánh này.");
    }
    if (isEmployeeUser(currentUser)) {
      assertEmployeeMaySetBookingStatus(state, bookingId, status, currentUser);
    }

    const clearsCheckedInAt =
      status === "cancelled" ||
      status === "completed" ||
      status === "no_show" ||
      status === "confirmed" ||
      status === "pending" ||
      status === "late";

    const optimisticPatch: Partial<Booking> = {
      status,
      ...(clearsCheckedInAt ? { checkedInAt: undefined } : {}),
      ...(status === "no_show" ? { noShowMarkedAt: dayjs().toISOString() } : {}),
      ...(status === "late" ? { lateMarkedAt: dayjs().toISOString() } : {}),
      ...(status === "no_show" ? { areaId: null, tableId: null, mergeGroupId: null } : {}),
    };

    const revertPatch: Partial<Booking> = {
      status: booking.status,
      checkedInAt: booking.checkedInAt,
      noShowMarkedAt: booking.noShowMarkedAt,
      lateMarkedAt: booking.lateMarkedAt,
      areaId: booking.areaId,
      tableId: booking.tableId,
      mergeGroupId: booking.mergeGroupId,
    };

    setState((prev) => {
      const seeded = seedBookingIntoSnapshot(prev, bookingId, seedBooking);
      const next = applyBookingPatchToSnapshot(seeded, bookingId, optimisticPatch);
      return next ?? seeded;
    });

    try {
      await updateBookingStatusInSupabase(bookingId, status);
    } catch (error) {
      setState((prev) => {
        const seeded = seedBookingIntoSnapshot(prev, bookingId, seedBooking);
        const next = applyBookingPatchToSnapshot(seeded, bookingId, revertPatch);
        return next ?? seeded;
      });
      throw error;
    }
  };

  const checkInBooking = async (bookingId: string, seedBooking?: Booking) => {
    if (!hasSupabase) {
      return;
    }
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
    }
    const booking =
      state.bookings.find((item) => item.id === bookingId) ?? seedBooking;
    if (!booking) {
      throw new Error("Không tìm thấy booking.");
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId, state.activeBranchId)) {
      throw new Error("Bạn không có quyền chỉnh booking của chi nhánh này.");
    }
    if (booking.mergeGroupId) {
      const mergeGroup = state.mergeGroups.find((group) => group.id === booking.mergeGroupId);
      if (
        mergeGroup &&
        mergeGroupHasOccupiedMemberTable(mergeGroup, state.tables, state.bookings)
      ) {
        throw new Error(MERGE_GROUP_CHECK_IN_BLOCKED_BY_MEMBER_OCCUPIED);
      }
    }

    const revertPatch: Partial<Booking> = {
      status: booking.status,
      checkedInAt: booking.checkedInAt,
    };
    const checkedInAt = dayjs().toISOString();

    setState((prev) => {
      const seeded = seedBookingIntoSnapshot(prev, bookingId, seedBooking);
      const next = applyBookingPatchToSnapshot(seeded, bookingId, {
        status: "seated",
        checkedInAt,
      });
      return next ?? seeded;
    });

    try {
      await checkInBookingInSupabase(bookingId);
    } catch (error) {
      setState((prev) => {
        const seeded = seedBookingIntoSnapshot(prev, bookingId, seedBooking);
        const next = applyBookingPatchToSnapshot(seeded, bookingId, revertPatch);
        return next ?? seeded;
      });
      throw error;
    }
  };

  const queueBooking = async (
    bookingId: string,
    seedBooking?: Booking
  ): Promise<ActionResult> => {
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    const booking =
      state.bookings.find((item) => item.id === bookingId) ?? seedBooking;
    if (!booking) {
      return { ok: false, message: "Không tìm thấy booking." };
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId, state.activeBranchId)) {
      return { ok: false, message: "Bạn không có quyền chỉnh booking của chi nhánh này." };
    }
    if (!canQueueBooking(booking)) {
      return {
        ok: false,
        message: "Booking này không thể chuyển về chờ xếp bàn.",
      };
    }

    const revertPatch: Partial<Booking> = {
      status: booking.status,
      tableId: booking.tableId,
      mergeGroupId: booking.mergeGroupId,
      areaId: booking.areaId,
      checkedInAt: booking.checkedInAt,
      lateMarkedAt: booking.lateMarkedAt,
    };
    const optimisticPatch: Partial<Booking> = {
      status: "pending",
      tableId: null,
      mergeGroupId: null,
      areaId: null,
      checkedInAt: undefined,
      lateMarkedAt: undefined,
    };

    setState((prev) => {
      const seeded = seedBookingIntoSnapshot(prev, bookingId, seedBooking);
      const next = applyBookingPatchToSnapshot(seeded, bookingId, optimisticPatch);
      return next ?? seeded;
    });

    try {
      const result = await queueBookingInSupabase(bookingId);
      if (!result.ok) {
        setState((prev) => {
          const seeded = seedBookingIntoSnapshot(prev, bookingId, seedBooking);
          const next = applyBookingPatchToSnapshot(seeded, bookingId, revertPatch);
          return next ?? seeded;
        });
      }
      return result;
    } catch (error) {
      setState((prev) => {
        const seeded = seedBookingIntoSnapshot(prev, bookingId, seedBooking);
        const next = applyBookingPatchToSnapshot(seeded, bookingId, revertPatch);
        return next ?? seeded;
      });
      throw error;
    }
  };

  const deleteCustomers = async (customerIds: string[]) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    const ids = customerIds.filter((id) => id.trim().length > 0);
    if (ids.length === 0) {
      return { ok: true, message: "Không có khách hàng để xóa." };
    }

    const hasBooking = state.bookings.some((b) => ids.includes(b.customerId));
    if (hasBooking) {
      return { ok: false, message: "Không thể xóa: khách hàng đã có booking." };
    }

    if (!hasSupabase) {
      setState((prev) => ({
        ...prev,
        customers: prev.customers.filter((c) => !ids.includes(c.id)),
      }));
      return { ok: true, message: "Đã xóa khách hàng." };
    }

    const result = await deleteCustomersInSupabase(ids);
    if (result.ok) {
      customerDeleteTombstonesRef.current.register(ids);
      setState((prev) => ({
        ...prev,
        customers: prev.customers.filter((customer) => !ids.includes(customer.id)),
      }));
    }
    return result;
  };

  const mergeCustomers = async (input: {
    survivorId: string;
    sourceIds: string[];
    fullName: string;
    phone: string | null;
    note: string | null;
  }) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    if (!canEditActiveBranch) {
      return { ok: false, message: "Không có quyền gộp khách hàng trên chi nhánh đang chọn." };
    }

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

    const loserIds = sourceIds.filter((id) => id !== survivorId);
    const note =
      input.note != null && input.note.trim().length > 0 ? input.note.trim() : null;
    const nowIso = new Date().toISOString();

    const applyMergeToState = () => {
      const loserSet = new Set(loserIds);
      customerDeleteTombstonesRef.current.register(loserIds);
      setState((prev) => ({
        ...prev,
        customers: prev.customers
          .filter((customer) => !loserSet.has(customer.id))
          .map((customer) =>
            customer.id === survivorId
              ? {
                  ...customer,
                  fullName,
                  phone: input.phone,
                  note: note ?? undefined,
                  updatedAt: nowIso,
                }
              : customer
          ),
        bookings: prev.bookings.map((booking) =>
          loserSet.has(booking.customerId)
            ? { ...booking, customerId: survivorId }
            : booking
        ),
      }));
    };

    if (!hasSupabase) {
      const mergedBookingCount = state.bookings.filter((booking) =>
        sourceIds.includes(booking.customerId)
      ).length;
      applyMergeToState();
      return {
        ok: true,
        message: `Đã gộp ${sourceIds.length} khách → 1 hồ sơ (${mergedBookingCount} booking).`,
        survivorId,
        mergedBookingCount,
      };
    }

    const result = await mergeCustomersInSupabase({
      survivorId,
      sourceIds,
      fullName,
      phone: input.phone,
      note,
    });
    if (result.ok) {
      applyMergeToState();
    }
    return result;
  };

  const canPurgeCustomerData =
    currentUser?.role === "general_manager" || currentUser?.role === "admin";

  const applyPurgedCustomerDataToState = (
    deletedCustomerIds: string[],
    deletedBookingIds: string[]
  ) => {
    const customerIdSet = new Set(deletedCustomerIds);
    const bookingIdSet = new Set(deletedBookingIds);
    if (customerIdSet.size > 0) {
      customerDeleteTombstonesRef.current.register([...customerIdSet]);
    }
    setState((prev) => ({
      ...prev,
      customers: prev.customers.filter((customer) => !customerIdSet.has(customer.id)),
      bookings: prev.bookings.filter(
        (booking) => !bookingIdSet.has(booking.id) && !customerIdSet.has(booking.customerId)
      ),
    }));
  };

  const purgeCustomersWithRelatedData = async (customerIds: string[]) => {
    if (!canPurgeCustomerData) {
      return {
        ok: false,
        message: "Chỉ quản lý tổng hoặc admin mới được xóa toàn bộ dữ liệu khách hàng.",
      };
    }
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const ids = [...new Set(customerIds.map((id) => id.trim()).filter((id) => id.length > 0))];
    if (ids.length === 0) {
      return { ok: true, message: "Không có khách hàng để xóa." };
    }

    if (!hasSupabase) {
      const relatedBookingIds = state.bookings
        .filter((booking) => ids.includes(booking.customerId))
        .map((booking) => booking.id);
      applyPurgedCustomerDataToState(ids, relatedBookingIds);
      return {
        ok: true,
        message: `Đã xóa ${ids.length} khách hàng và ${relatedBookingIds.length} booking liên quan.`,
      };
    }

    const result = await purgeCustomersWithRelatedDataInSupabase(ids);
    if (result.ok) {
      applyPurgedCustomerDataToState(
        result.deletedCustomerIds ?? ids,
        result.deletedBookingIds ??
          state.bookings
            .filter((booking) => ids.includes(booking.customerId))
            .map((booking) => booking.id)
      );
    }
    return result;
  };

  const purgeDataInDateRange = async (input: { fromIso: string; toIso: string }) => {
    if (!canPurgeCustomerData) {
      return {
        ok: false,
        message: "Chỉ quản lý tổng hoặc admin mới được xóa dữ liệu theo khoảng thời gian.",
      };
    }
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const fromIso = input.fromIso.trim();
    const toIso = input.toIso.trim();
    if (!fromIso || !toIso) {
      return { ok: false, message: "Khoảng thời gian không hợp lệ." };
    }

    if (!hasSupabase) {
      const inRange = state.bookings.filter((booking) => {
        const at = dayjs(booking.bookingAt).valueOf();
        return at >= dayjs(fromIso).valueOf() && at <= dayjs(toIso).valueOf();
      });
      const bookingIds = inRange.map((booking) => booking.id);
      const bookingIdSet = new Set(bookingIds);
      const touchedCustomerIds = [...new Set(inRange.map((booking) => booking.customerId))];
      const remainingByCustomer = new Map<string, number>();
      for (const booking of state.bookings) {
        if (bookingIdSet.has(booking.id)) {
          continue;
        }
        remainingByCustomer.set(
          booking.customerId,
          (remainingByCustomer.get(booking.customerId) ?? 0) + 1
        );
      }
      const orphanCustomerIds = touchedCustomerIds.filter(
        (customerId) => !remainingByCustomer.has(customerId)
      );
      applyPurgedCustomerDataToState(orphanCustomerIds, bookingIds);
      return {
        ok: true,
        message: `Đã xóa ${bookingIds.length} booking và ${orphanCustomerIds.length} khách hàng không còn dữ liệu.`,
      };
    }

    const result = await purgeDataInDateRangeInSupabase({ fromIso, toIso });
    if (result.ok) {
      applyPurgedCustomerDataToState(
        result.deletedCustomerIds ?? [],
        result.deletedBookingIds ?? []
      );
    }
    return result;
  };

  const applyTableToState = (table: DiningTable) => {
    setState((prev) => {
      const index = prev.tables.findIndex((item) => item.id === table.id);
      if (index === -1) {
        return { ...prev, tables: [...prev.tables, table] };
      }
      const tables = [...prev.tables];
      tables[index] = table;
      return { ...prev, tables };
    });
  };

  const applyTablesToState = (tables: DiningTable[]) => {
    if (tables.length === 0) {
      return;
    }
    setState((prev) => {
      let nextTables = [...prev.tables];
      for (const table of tables) {
        const index = nextTables.findIndex((item) => item.id === table.id);
        if (index === -1) {
          nextTables.push(table);
        } else {
          nextTables[index] = table;
        }
      }
      return { ...prev, tables: nextTables };
    });
  };

  const removeTablesFromState = (tableIds: readonly string[]) => {
    if (tableIds.length === 0) {
      return;
    }
    const remove = new Set(tableIds);
    setState((prev) => ({
      ...prev,
      tables: prev.tables.filter((table) => !remove.has(table.id)),
    }));
  };

  const applyAreaToState = (area: Area) => {
    setState((prev) => {
      const index = prev.areas.findIndex((item) => item.id === area.id);
      if (index === -1) {
        return { ...prev, areas: [...prev.areas, area] };
      }
      const areas = [...prev.areas];
      areas[index] = area;
      return { ...prev, areas };
    });
  };

  const removeAreaFromState = (areaId: string) => {
    setState((prev) => ({
      ...prev,
      areas: prev.areas.filter((area) => area.id !== areaId),
    }));
  };

  const upsertTable = async (table: Omit<DiningTable, "id"> & { id?: string }) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
    }
    if (!hasSupabase) {
      return;
    }
    const saved = await upsertTableInSupabase(table);
    applyTableToState(saved);
  };

  const upsertTablesBatch = async (tables: Array<Omit<DiningTable, "id"> & { id?: string }>) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
    }
    if (!hasSupabase || tables.length === 0) {
      return;
    }
    const saved = await upsertTablesBatchInSupabase(tables);
    applyTablesToState(saved);
  };

  const updateTableStatus = async (tableId: string, status: TableStatus) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
    }
    if (!hasSupabase) {
      return;
    }
    let prevTable: DiningTable | undefined;
    setState((prev) => {
      prevTable = prev.tables.find((t) => t.id === tableId);
      if (!prevTable || prevTable.status === status) {
        return prev;
      }
      return {
        ...prev,
        tables: prev.tables.map((t) => (t.id === tableId ? { ...t, status } : t)),
      };
    });

    try {
      await updateTableStatusInSupabase(tableId, status);
    } catch (error) {
      if (prevTable) {
        setState((prev) => ({
          ...prev,
          tables: prev.tables.map((t) =>
            t.id === prevTable!.id ? { ...t, status: prevTable!.status } : t
          ),
        }));
      }
      throw error;
    }
  };

  const deleteTable = async (tableId: string) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
    }
    if (!hasSupabase) {
      return;
    }
    tableDeleteTombstonesRef.current.register([tableId]);
    try {
      await deleteTableInSupabase(tableId);
      removeTablesFromState([tableId]);
    } catch (error) {
      tableDeleteTombstonesRef.current.clear(tableId);
      throw error;
    }
  };

  const deleteTables = async (tableIds: string[]) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
    }
    if (!hasSupabase || tableIds.length === 0) {
      return;
    }
    tableDeleteTombstonesRef.current.register(tableIds);
    try {
      await deleteTablesInSupabase(tableIds);
      removeTablesFromState(tableIds);
    } catch (error) {
      for (const tableId of tableIds) {
        tableDeleteTombstonesRef.current.clear(tableId);
      }
      throw error;
    }
  };

  const updateLocalTablePosition = (tableId: string, x: number, y: number) => {
    setState((prev) => ({
      ...prev,
      tables: prev.tables.map((table) =>
        table.id === tableId ? { ...table, positionX: x, positionY: y } : table
      ),
    }));
  };

  const updateTablePosition = async (tableId: string, x: number, y: number) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
    }
    updateLocalTablePosition(tableId, x, y);
    if (!hasSupabase) {
      return;
    }
    await updateTablePositionInSupabase(tableId, x, y);
  };

  const addArea = async (branchId: string, name: string) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
    }
    if (!hasSupabase) {
      return;
    }
    const saved = await addAreaInSupabase(branchId, name);
    applyAreaToState(saved);
  };

  const updateArea = async (
    areaId: string,
    input: { branchId?: string; name?: string }
  ) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    const applyLocal = () => {
      setState((prev) => ({
        ...prev,
        areas: prev.areas.map((a) =>
          a.id === areaId
            ? {
                ...a,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.branchId !== undefined ? { branchId: input.branchId } : {}),
              }
            : a
        ),
        tables:
          input.branchId !== undefined
            ? prev.tables.map((t) =>
                t.areaId === areaId ? { ...t, branchId: input.branchId! } : t
              )
            : prev.tables,
        bookings:
          input.branchId !== undefined
            ? prev.bookings.map((b) =>
                b.areaId === areaId ? { ...b, branchId: input.branchId! } : b
              )
            : prev.bookings,
      }));
    };

    if (!hasSupabase) {
      applyLocal();
      return { ok: true, message: "Đã cập nhật khu vực." };
    }
    const result = await updateAreaInSupabase(areaId, input);
    if (result.ok) {
      // NOTE: branch-scoped realtime filters can't reliably deliver updates when `branch_id`
      // changes (old branch listeners won't receive the UPDATE). Use a one-time reload in
      // that specific case to keep everyone consistent.
      if (input.branchId !== undefined) {
        await reload({ scope: "floor" });
      } else {
        applyLocal();
      }
    }
    return result;
  };

  const deleteArea = async (areaId: string) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    const tablesInArea = state.tables.filter((t) => t.areaId === areaId);
    const bookingsInArea = state.bookings.filter((b) => b.areaId === areaId);
    if (!hasSupabase) {
      if (tablesInArea.length > 0 || bookingsInArea.length > 0) {
        return {
          ok: false,
          message: `Không thể xóa: còn ${tablesInArea.length} bàn và ${bookingsInArea.length} đặt bàn gắn khu vực này.`,
        };
      }
      setState((prev) => ({
        ...prev,
        areas: prev.areas.filter((a) => a.id !== areaId),
      }));
      return { ok: true, message: "Đã xóa khu vực." };
    }
    areaDeleteTombstonesRef.current.register([areaId]);
    const result = await deleteAreaInSupabase(areaId);
    if (result.ok) {
      removeAreaFromState(areaId);
    } else {
      areaDeleteTombstonesRef.current.clear(areaId);
    }
    return result;
  };

  const addUser = async (payload: {
    username: string;
    password: string;
    fullName: string;
    role: Role;
    branchIds: string[];
  }) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    if (currentUser?.role === "general_manager" && payload.role === "admin") {
      return {
        ok: false,
        message: "Chỉ Admin mới có thể tạo hoặc gán vai trò Admin.",
      };
    }
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }
    const result = await addUserInSupabase({
      ...payload,
      actorUserId: currentUser?.id,
    });
    if (result.ok) {
      // Realtime for `app_users` might be disabled; ensure UI reflects the new user.
      await reload();
    }
    return result;
  };

  const updateUser = async (
    userId: string,
    payload: {
      username: string;
      password?: string;
      fullName: string;
      role: Role;
      branchIds: string[];
    }
  ) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    const target = state.users.find((u) => u.id === userId);
    if (!target) {
      return { ok: false, message: "Không tìm thấy tài khoản." };
    }
    if (currentUser?.role === "general_manager") {
      if (target.role === "admin") {
        return {
          ok: false,
          message: "Quản lý tổng không được chỉnh sửa tài khoản Admin.",
        };
      }
      if (payload.role === "admin") {
        return {
          ok: false,
          message: "Chỉ Admin mới có thể gán vai trò Admin.",
        };
      }
    }

    const applySession = () => {
      if (currentUser?.id !== userId) {
        return;
      }
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              username: payload.username,
              fullName: payload.fullName,
              role: payload.role,
              branchIds: payload.branchIds,
              password:
                payload.password && payload.password.trim().length > 0
                  ? payload.password.trim()
                  : prev.password,
            }
          : null
      );
    };

    if (!hasSupabase) {
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.id === userId
            ? {
                ...u,
                username: payload.username,
                fullName: payload.fullName,
                role: payload.role,
                branchIds: payload.branchIds,
                password:
                  payload.password && payload.password.trim().length > 0
                    ? payload.password.trim()
                    : u.password,
              }
            : u
        ),
      }));
      applySession();
      return { ok: true, message: "Đã cập nhật tài khoản." };
    }
    const result = await updateUserInSupabase(userId, {
      ...payload,
      actorUserId: currentUser?.id,
    });
    if (result.ok) {
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.id === userId
            ? {
                ...u,
                username: payload.username,
                fullName: payload.fullName,
                role: payload.role,
                branchIds: payload.branchIds,
                password:
                  payload.password && payload.password.trim().length > 0
                    ? payload.password.trim()
                    : u.password,
              }
            : u
        ),
      }));
      applySession();
    }
    return result;
  };

  const updateOwnProfile = async (payload: {
    currentPassword: string;
    fullName: string;
    newPassword?: string;
  }) => {
    if (!currentUser) {
      return { ok: false, message: "Chưa đăng nhập." };
    }
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }

    const fullName = payload.fullName.trim();
    if (!fullName) {
      return { ok: false, message: "Vui lòng nhập họ tên." };
    }
    if (!payload.currentPassword) {
      return { ok: false, message: "Vui lòng nhập mật khẩu hiện tại." };
    }

    const newPassword = payload.newPassword?.trim();
    if (newPassword && newPassword.length > 0 && newPassword.length < 4) {
      return { ok: false, message: "Mật khẩu mới phải có ít nhất 4 ký tự." };
    }

    const result = await updateOwnProfileInSupabase({
      userId: currentUser.id,
      currentPassword: payload.currentPassword,
      fullName,
      newPassword: newPassword && newPassword.length > 0 ? newPassword : undefined,
    });

    if (result.ok) {
      setCurrentUser((prev) =>
        prev
          ? {
              ...prev,
              fullName,
            }
          : null
      );
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) =>
          u.id === currentUser.id
            ? {
                ...u,
                fullName,
              }
            : u
        ),
      }));
    }

    return result;
  };

  const deleteUser = async (userId: string) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
    if (viewOnlyBlock) {
      return viewOnlyBlock;
    }
    if (userId === currentUser?.id) {
      return { ok: false, message: "Không thể xóa tài khoản đang đăng nhập." };
    }
    const target = state.users.find((u) => u.id === userId);
    if (currentUser?.role === "general_manager" && target?.role === "admin") {
      return {
        ok: false,
        message: "Quản lý tổng không được xóa tài khoản Admin.",
      };
    }
    if (!hasSupabase) {
      setState((prev) => ({
        ...prev,
        users: prev.users.filter((u) => u.id !== userId),
      }));
      return { ok: true, message: "Đã xóa tài khoản." };
    }
    const result = await deleteUserInSupabase(userId);
    if (result.ok) {
      // Realtime for `app_users` might be disabled; ensure UI reflects deletion.
      await reload();
    }
    return result;
  };

  const markNotificationRead = async (id: string) => {
    if (isEmployeeUser(currentUser)) {
      return;
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      return;
    }
    if (!hasSupabase) {
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((item) =>
          item.id === id ? { ...item, isRead: true } : item
        ),
      }));
      return;
    }
    await markNotificationReadInSupabase(id);
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((item) =>
        item.id === id ? { ...item, isRead: true } : item
      ),
    }));
  };

  const markAllScopedNotificationsRead = useCallback(async () => {
    if (isEmployeeUser(currentUser)) {
      return;
    }
    if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
      return;
    }
    const ids = state.notifications
      .filter(
        (n) =>
          !n.isRead && (!n.branchId || filteredBranchIds.includes(n.branchId))
      )
      .map((n) => n.id);
    if (ids.length === 0) {
      return;
    }
    if (!hasSupabase) {
      setState((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) =>
          ids.includes(n.id) ? { ...n, isRead: true } : n
        ),
      }));
      return;
    }
    await markNotificationsReadBatchInSupabase(ids);
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        ids.includes(n.id) ? { ...n, isRead: true } : n
      ),
    }));
  }, [currentUser, filteredBranchIds, hasSupabase, state.notifications]);

  const saveAreaFloorGrid = useCallback(
    async (
      areaId: string,
      columns: number,
      rows: number,
      spacing: number,
      options?: { layoutDate?: string }
    ) => {
      if (isEmployeeUser(currentUser)) {
        return;
      }
      if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
        return;
      }
      const floorGridColumns = Math.min(24, Math.max(4, Math.round(columns)));
      const floorGridRows = Math.min(18, Math.max(4, Math.round(rows)));
      const floorNodeSpacing = clampFloorNodeSpacing(spacing);
      const layoutDate = options?.layoutDate?.trim();
      if (!hasSupabase) {
        if (!layoutDate) {
          setState((prev) => ({
            ...prev,
            areas: prev.areas.map((a) =>
              a.id === areaId
                ? { ...a, floorGridColumns, floorGridRows, floorNodeSpacing }
                : a
            ),
          }));
        }
        return;
      }
      await updateAreaFloorLayoutInSupabase(
        areaId,
        {
          floorGridColumns,
          floorGridRows,
          floorNodeSpacing,
        },
        layoutDate
          ? { layoutDate, updatedByUserId: currentUser?.id ?? null }
          : undefined
      );
      if (!layoutDate) {
        setState((prev) => ({
          ...prev,
          areas: prev.areas.map((a) =>
            a.id === areaId
              ? { ...a, floorGridColumns, floorGridRows, floorNodeSpacing }
              : a
          ),
        }));
      }
    },
    [currentUser, hasSupabase]
  );

  const saveFloorLayout = useCallback(
    async (
      areaId: string,
      input: SaveFloorLayoutInput,
      options?: { layoutDate?: string }
    ) => {
      if (isEmployeeUser(currentUser)) {
        throw new Error(EMPLOYEE_MUTATION_BLOCKED);
      }
      if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
        throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
      }
      const floorGridColumns = Math.min(24, Math.max(4, Math.round(input.floorGridColumns)));
      const floorGridRows = Math.min(18, Math.max(4, Math.round(input.floorGridRows)));
      const floorNodeSpacing = clampFloorNodeSpacing(input.floorNodeSpacing);
      const tablePositions = input.tablePositions.map((p) => ({
        tableId: p.tableId,
        x: Math.round(p.x),
        y: Math.round(p.y),
      }));
      const posById = new Map(tablePositions.map((p) => [p.tableId, p]));
      const layoutDate = options?.layoutDate?.trim();

      if (!hasSupabase) {
        if (!layoutDate) {
          setState((prev) => ({
            ...prev,
            areas: prev.areas.map((a) =>
              a.id === areaId
                ? { ...a, floorGridColumns, floorGridRows, floorNodeSpacing }
                : a
            ),
            tables: prev.tables.map((t) => {
              const pos = posById.get(t.id);
              if (!pos || t.areaId !== areaId) {
                return t;
              }
              return { ...t, positionX: pos.x, positionY: pos.y };
            }),
          }));
        }
        return;
      }
      const result = await saveFloorLayoutToSupabase(
        areaId,
        {
          floorGridColumns,
          floorGridRows,
          floorNodeSpacing,
          tablePositions,
        },
        layoutDate
          ? {
              layoutDate,
              updatedByUserId: currentUser?.id ?? null,
              mergeGroupId: null,
            }
          : undefined
      );
      if (!layoutDate) {
        await reload({ scope: "floor" });
      }
      return result;
    },
    [currentUser, hasSupabase, reload]
  );

  const fetchAreaFloorLayoutForDate = useCallback(
    async (areaId: string, layoutDate: string) => {
      if (!hasSupabase) {
        return null;
      }
      return fetchAreaFloorLayoutForDateInSupabase(areaId, layoutDate);
    },
    [hasSupabase]
  );

  const deleteAreaFloorLayoutForDate = useCallback(
    async (areaId: string, layoutDate: string) => {
      if (isEmployeeUser(currentUser)) {
        throw new Error(EMPLOYEE_MUTATION_BLOCKED);
      }
      if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
        throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
      }
      if (!hasSupabase) {
        return;
      }
      await deleteAreaFloorLayoutForDateInSupabase(areaId, layoutDate);
    },
    [currentUser, hasSupabase]
  );

  const listFloorLayoutTemplates = useCallback(
    async (areaId: string) => {
      if (!hasSupabase) {
        return [];
      }
      return listFloorLayoutTemplatesInSupabase(areaId);
    },
    [hasSupabase]
  );

  const createFloorLayoutTemplate = useCallback(
    async (areaId: string, name: string, snapshot: FloorLayoutSnapshot) => {
      if (isEmployeeUser(currentUser)) {
        throw new Error(EMPLOYEE_MUTATION_BLOCKED);
      }
      if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
        throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
      }
      if (!hasSupabase || !currentUser) {
        throw new Error("Chưa kết nối Supabase hoặc chưa đăng nhập.");
      }
      return createFloorLayoutTemplateInSupabase(
        areaId,
        name,
        snapshot,
        currentUser.id
      );
    },
    [currentUser, hasSupabase]
  );

  const deleteFloorLayoutTemplate = useCallback(
    async (templateId: string) => {
      if (isEmployeeUser(currentUser)) {
        throw new Error(EMPLOYEE_MUTATION_BLOCKED);
      }
      if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
        throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
      }
      if (!hasSupabase) {
        return;
      }
      await deleteFloorLayoutTemplateInSupabase(templateId);
    },
    [currentUser, hasSupabase]
  );

  const applyFloorLayoutTemplateToDate = useCallback(
    async (templateId: string, areaId: string, layoutDate: string) => {
      if (isEmployeeUser(currentUser)) {
        throw new Error(EMPLOYEE_MUTATION_BLOCKED);
      }
      if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
        throw new Error(MANAGER_VIEW_ONLY_BLOCKED);
      }
      if (!hasSupabase) {
        throw new Error("Chưa kết nối Supabase.");
      }
      return applyFloorLayoutTemplateToDateInSupabase(
        templateId,
        areaId,
        layoutDate,
        currentUser?.id ?? null
      );
    },
    [currentUser, hasSupabase]
  );

  // Snapshot synchronization is driven by Supabase Realtime with fallback polling.

  const acquireFloorLayoutEditLock = useCallback(
    async (areaId: string) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false as const, holderFullName: "Tài khoản nhân viên" };
      }
      if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
        return { ok: false as const, holderFullName: "Chế độ chỉ xem" };
      }
      if (!hasSupabase || !currentUser) {
        return { ok: true as const };
      }
      return tryAcquireFloorLayoutLockInSupabase(areaId, currentUser.id);
    },
    [hasSupabase, currentUser]
  );

  const renewFloorLayoutEditLock = useCallback(
    async (areaId: string) => {
      if (isEmployeeUser(currentUser)) {
        return;
      }
      if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
        return;
      }
      if (!hasSupabase || !currentUser) {
        return;
      }
      await renewFloorLayoutLockInSupabase(areaId, currentUser.id);
    },
    [hasSupabase, currentUser]
  );

  const releaseFloorLayoutEditLock = useCallback(
    async (areaId: string) => {
      if (isEmployeeUser(currentUser)) {
        return;
      }
      if (isManagerViewOnlyBranch(currentUser, state.activeBranchId)) {
        return;
      }
      if (!hasSupabase || !currentUser) {
        return;
      }
      await releaseFloorLayoutLockInSupabase(areaId, currentUser.id);
    },
    [hasSupabase, currentUser]
  );

  const getFloorLayoutEditLockInfo = useCallback(async (areaId: string) => {
    if (!hasSupabase) {
      return null;
    }
    return getFloorLayoutLockInfoInSupabase(areaId);
  }, [hasSupabase]);

  const createTableMergeGroup = useCallback(
    async (input: {
      branchId: string;
      areaId: string;
      tableIds: string[];
      startDate: string;
      endDate: string;
      layoutDate?: string;
    }) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
      }
      const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
      if (viewOnlyBlock) {
        return viewOnlyBlock;
      }
      if (!hasSupabase) {
        return { ok: false, message: "Chưa kết nối Supabase." };
      }
      if (!currentUser) {
        return { ok: false, message: "Chưa đăng nhập." };
      }
      const result = await createTableMergeGroupInSupabase({
        ...input,
        createdByUserId: currentUser.id,
      });
      if (result.ok && result.group) {
        setState((prev) => ({
          ...prev,
          mergeGroups: [
            ...prev.mergeGroups.filter((group) => group.id !== result.group!.id),
            result.group!,
          ],
        }));
      } else if (result.ok) {
        await reload({ scope: "floor" });
      }
      return result;
    },
    [currentUser, hasSupabase, reload]
  );

  const createTableSplitClone = useCallback(
    async (input: {
      sourceTableId: string;
      startDate: string;
      endDate: string;
      layoutDate?: string;
    }) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
      }
      const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
      if (viewOnlyBlock) {
        return viewOnlyBlock;
      }
      if (!hasSupabase) {
        return { ok: false, message: "Chưa kết nối Supabase." };
      }
      if (!currentUser) {
        return { ok: false, message: "Chưa đăng nhập." };
      }
      const result = await createTableSplitCloneInSupabase({
        ...input,
        createdByUserId: currentUser.id,
      });
      if (result.ok && result.table) {
        setState((prev) => ({
          ...prev,
          tables: [
            ...prev.tables.filter((table) => table.id !== result.table!.id),
            result.table!,
          ],
        }));
      } else if (result.ok) {
        await reload({ scope: "floor" });
      }
      return result;
    },
    [currentUser, hasSupabase, reload]
  );

  const addTableToMergeGroup = useCallback(
    async (input: {
      groupId: string;
      tableId: string;
      repackFloor?: boolean;
      layoutDate?: string;
    }) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
      }
      const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
      if (viewOnlyBlock) {
        return viewOnlyBlock;
      }
      if (!hasSupabase) {
        return { ok: false, message: "Chưa kết nối Supabase." };
      }
      const result = await addTableToMergeGroupInSupabase(input);
      if (result.ok) {
        await reload({ scope: "floor" });
      }
      return result;
    },
    [currentUser, hasSupabase, reload]
  );

  const removeTableFromMergeGroup = useCallback(
    async (input: {
      groupId: string;
      tableId: string;
      repackFloor?: boolean;
      layoutDate?: string;
    }) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
      }
      const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
      if (viewOnlyBlock) {
        return viewOnlyBlock;
      }
      if (!hasSupabase) {
        return { ok: false, message: "Chưa kết nối Supabase." };
      }
      const result = await removeTableFromMergeGroupInSupabase(input);
      if (result.ok) {
        await reload({ scope: "floor" });
      }
      return result;
    },
    [currentUser, hasSupabase, reload]
  );

  const releaseTableMergeGroup = useCallback(
    async (input: { groupId: string }) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
      }
      const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
      if (viewOnlyBlock) {
        return viewOnlyBlock;
      }
      if (!hasSupabase) {
        return { ok: false, message: "Chưa kết nối Supabase." };
      }
      const result = await releaseTableMergeGroupInSupabase(input);
      if (result.ok) {
        await reload({ scope: "floor" });
      }
      return result;
    },
    [currentUser, hasSupabase, reload]
  );

  const updateTableMergeGroupDates = useCallback(
    async (input: { groupId: string; startDate: string; endDate: string }) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
      }
      const viewOnlyBlock = managerViewOnlyResult(currentUser, state.activeBranchId);
      if (viewOnlyBlock) {
        return viewOnlyBlock;
      }
      if (!hasSupabase) {
        return { ok: false, message: "Chưa kết nối Supabase." };
      }
      const result = await updateTableMergeGroupDatesInSupabase(input);
      if (result.ok) {
        await reload({ scope: "floor" });
      }
      return result;
    },
    [currentUser, hasSupabase, reload]
  );

  const value: AppContextValue = {
    state,
    currentUser,
    filteredBranchIds,
    canEditActiveBranch,
    isLoading: isLoading || !sessionReady,
    hasSupabase,
    login,
    logout,
    reload,
    setActiveBranchId,
    updateBranch,
    updateBookingRuntimeSettings,
    createBooking,
    assignBookingToTable,
    updateBookingGuestCount,
    updateBookingOrder,
    changeBookingTable,
    createTableMergeGroup,
    createTableSplitClone,
    addTableToMergeGroup,
    removeTableFromMergeGroup,
    releaseTableMergeGroup,
    updateTableMergeGroupDates,
    updateBookingStatus,
    checkInBooking,
    queueBooking,
    deleteCustomers,
    mergeCustomers,
    purgeCustomersWithRelatedData,
    purgeDataInDateRange,
    upsertTable,
    upsertTablesBatch,
    deleteTable,
    deleteTables,
    updateTableStatus,
    updateTablePosition,
    addArea,
    updateArea,
    deleteArea,
    addUser,
    updateUser,
    updateOwnProfile,
    deleteUser,
    markNotificationRead,
    markAllScopedNotificationsRead,
    saveAreaFloorGrid,
    saveFloorLayout,
    fetchAreaFloorLayoutForDate,
    deleteAreaFloorLayoutForDate,
    listFloorLayoutTemplates,
    createFloorLayoutTemplate,
    deleteFloorLayoutTemplate,
    applyFloorLayoutTemplateToDate,
    acquireFloorLayoutEditLock,
    renewFloorLayoutEditLock,
    releaseFloorLayoutEditLock,
    getFloorLayoutEditLockInfo,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext phải dùng trong AppContextProvider");
  }
  return context;
}
