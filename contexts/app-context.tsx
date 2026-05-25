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
  readStoredActiveBranch,
  setBranchPickRequired,
  shouldPickBranchOnLogin,
} from "@/lib/branch-pick";
import { type BookingDuplicateInfo, DUPLICATE_BOOKING_CODE } from "@/lib/booking-duplicate";
import { isImmediateBookingArrival } from "@/lib/booking-meta";
import { initialState } from "@/lib/initial-state";
import {
  assertEmployeeMaySetBookingStatus,
  EMPLOYEE_MUTATION_BLOCKED,
  isEmployeeUser,
} from "@/lib/employee-access";
import { mergeFloorMapSliceIntoState, reloadScopeForRealtimeTable } from "@/lib/floor-map-state-slice";
import { resolveMergeGroupDateRange } from "@/lib/merge-group-utils";
import { applyBookingPatchToSnapshot } from "@/lib/optimistic-booking-sync";
import { clampFloorNodeSpacing } from "@/lib/floor-map-layout";
import {
  addAreaInSupabase,
  addTableToMergeGroupInSupabase,
  addUserInSupabase,
  assignBookingToTableInSupabase,
  type CreateTableMergeGroupResult,
  createTableMergeGroupInSupabase,
  deleteAreaInSupabase,
  deleteUserInSupabase,
  updateUserInSupabase,
  checkInBookingInSupabase,
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
  releaseTableMergeGroupInSupabase,
  updateTableMergeGroupDatesInSupabase,
  removeTableFromMergeGroupInSupabase,
  renewFloorLayoutLockInSupabase,
  releaseFloorLayoutLockInSupabase,
  type SaveFloorLayoutInput,
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
};

type ActionResult = {
  ok: boolean;
  message: string;
  code?: typeof DUPLICATE_BOOKING_CODE;
  duplicates?: BookingDuplicateInfo[];
};

interface AppContextValue {
  state: AppStateSnapshot;
  currentUser: AppUser | null;
  filteredBranchIds: string[];
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
  }) => Promise<ActionResult>;
  createTableMergeGroup: (input: {
    branchId: string;
    areaId: string;
    tableIds: string[];
    startDate: string;
    endDate: string;
  }) => Promise<CreateTableMergeGroupResult>;
  addTableToMergeGroup: (input: {
    groupId: string;
    tableId: string;
    repackFloor?: boolean;
  }) => Promise<ActionResult>;
  removeTableFromMergeGroup: (input: {
    groupId: string;
    tableId: string;
    repackFloor?: boolean;
  }) => Promise<ActionResult>;
  releaseTableMergeGroup: (input: { groupId: string }) => Promise<ActionResult>;
  updateTableMergeGroupDates: (input: {
    groupId: string;
    startDate: string;
    endDate: string;
  }) => Promise<ActionResult>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  checkInBooking: (bookingId: string) => Promise<void>;
  deleteCustomers: (customerIds: string[]) => Promise<ActionResult>;
  upsertTable: (table: Omit<DiningTable, "id"> & { id?: string }) => Promise<void>;
  upsertTablesBatch: (tables: Array<Omit<DiningTable, "id"> & { id?: string }>) => Promise<void>;
  deleteTable: (tableId: string) => Promise<void>;
  deleteTables: (tableIds: string[]) => Promise<void>;
  updateTableStatus: (tableId: string, status: TableStatus) => Promise<void>;
  updateTablePosition: (tableId: string, x: number, y: number) => Promise<void>;
  addArea: (branchId: string, name: string, capacity: number) => Promise<void>;
  updateArea: (
    areaId: string,
    input: { branchId?: string; name?: string; capacity?: number }
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
  deleteUser: (userId: string) => Promise<ActionResult>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllScopedNotificationsRead: () => Promise<void>;
  saveAreaFloorGrid: (
    areaId: string,
    columns: number,
    rows: number,
    nodeSpacing: number
  ) => Promise<void>;
  saveFloorLayout: (areaId: string, input: SaveFloorLayoutInput) => Promise<void>;
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
 * Quản lý chi nhánh / nhân viên: one branch at a time — assigned branch if only one; otherwise the active
 * branch (switch via menu "Chọn chi nhánh" → /select-branch).
 */
function userScopeBranchIds(user: AppUser | null, activeBranchId?: string): string[] {
  if (!user) {
    return [];
  }
  if (user.role === "manager" || user.role === "employee") {
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

function canOperateBookingInBranch(user: AppUser | null, bookingBranchId: string): boolean {
  if (!user) {
    return false;
  }
  if (user.role === "admin" || user.role === "general_manager") {
    return true;
  }
  return user.branchIds.includes(bookingBranchId);
}

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppStateSnapshot>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const storedSession = window.localStorage.getItem(SESSION_KEY);
    return storedSession ? parseStoredSession(storedSession) : null;
  });

  const hasSupabase = isSupabaseEnabled();
  const hasRealtime = isSupabaseRealtimeConfigured();
  const filteredBranchIds = useMemo(
    () => userScopeBranchIds(currentUser, state.activeBranchId),
    [currentUser, state.activeBranchId]
  );

  const reload = useCallback(
    async (options?: { forceMaintenance?: boolean; scope?: "full" | "floor" }) => {
      const mergeActive = (
        prev: AppStateSnapshot,
        fallback: AppStateSnapshot["activeBranchId"]
      ): AppStateSnapshot["activeBranchId"] => {
        if (!currentUser) {
          return prev.activeBranchId ?? fallback;
        }
        if (shouldPickBranchOnLogin(currentUser.role) && isBranchPickRequired()) {
          return undefined;
        }
        const stored = readStoredActiveBranch(currentUser);
        if (stored) {
          return stored;
        }
        return prev.activeBranchId ?? fallback;
      };

      if (!hasSupabase) {
        setState((prev) => ({
          ...initialState,
          activeBranchId: mergeActive(prev, initialState.activeBranchId),
        }));
        return;
      }

      if (options?.scope === "floor") {
        const slice = await fetchFloorMapSlice(filteredBranchIds);
        setState((prev) => mergeFloorMapSliceIntoState(prev, slice, filteredBranchIds));
        return;
      }

      const snapshot = await fetchSnapshot({
        forceMaintenance: options?.forceMaintenance,
      });
      setState((prev) => ({
        ...snapshot,
        activeBranchId: mergeActive(prev, snapshot.activeBranchId),
      }));
    },
    [filteredBranchIds, hasSupabase, currentUser]
  );

  const lastReloadAtRef = useRef<number>(0);
  const reloadInFlightRef = useRef(false);

  useEffect(() => {
    const run = async () => {
      try {
        await reload();
      } finally {
        setIsLoading(false);
      }
    };
    void run();
  }, [reload]);

  useEffect(() => {
    if (!hasSupabase) {
      return;
    }

    let cancelled = false;
    const realtime = getSupabaseBrowserClient();
    const realtimeChannelName = `app-snapshot-sync:${currentUser?.id ?? "guest"}`;
    const runReload = (sourceTable?: string) => {
      if (cancelled) return;
      if (reloadInFlightRef.current) return;
      // Burst updates can emit multiple row changes; cap reload cadence to avoid thrash.
      if (Date.now() - lastReloadAtRef.current < 400) return;
      reloadInFlightRef.current = true;
      lastReloadAtRef.current = Date.now();
      const scope = reloadScopeForRealtimeTable(sourceTable);
      Promise.resolve(reload({ scope }))
        .catch(() => {
          // Keep running; fallback timer/realtime retries will pull the next slice/snapshot.
        })
        .finally(() => {
          reloadInFlightRef.current = false;
        });
    };

    type RealtimeRow = Record<string, unknown>;
    type RealtimePayload = {
      eventType?: "INSERT" | "UPDATE" | "DELETE";
      new?: RealtimeRow;
      old?: RealtimeRow;
    };

    const mapRealtimeRuntimeSettings = (row: RealtimeRow): BookingRuntimeSettings | null => {
      const standardTurnaroundMinutes = row.standard_turnaround_minutes;
      const noShowGraceMinutes = row.no_show_grace_minutes;
      const waitlistOfferTtlMinutes = row.waitlist_offer_ttl_minutes;
      const groupPartyGuestThreshold = row.group_party_guest_threshold;
      const repeatCustomerMinCompleted = row.repeat_customer_min_completed;
      const receptionArrivalGraceMinutes = row.reception_arrival_grace_minutes;
      if (
        typeof standardTurnaroundMinutes !== "number" ||
        typeof noShowGraceMinutes !== "number" ||
        typeof waitlistOfferTtlMinutes !== "number" ||
        typeof groupPartyGuestThreshold !== "number" ||
        typeof repeatCustomerMinCompleted !== "number" ||
        typeof receptionArrivalGraceMinutes !== "number"
      ) {
        return null;
      }
      return {
        standardTurnaroundMinutes,
        noShowGraceMinutes,
        waitlistOfferTtlMinutes,
        groupPartyGuestThreshold,
        repeatCustomerMinCompleted,
        receptionArrivalGraceMinutes,
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

    const bookingStatuses: BookingStatus[] = [
      "pending",
      "confirmed",
      "seated",
      "cancelled",
      "no_show",
      "checked_in",
      "completed",
    ];

    const mapRealtimeBooking = (row: RealtimeRow): Booking | null => {
      const id = row.id;
      const customerId = row.customer_id;
      const branchId = row.branch_id;
      const areaId = row.area_id;
      const tableId = row.table_id;
      const mergeGroupId = row.merge_group_id;
      const guestCount = row.guest_count;
      const bookingAt = row.booking_at;
      const startTimeRaw = row.start_time;
      const endTimeRaw = row.end_time;
      const startTime =
        typeof startTimeRaw === "string" && startTimeRaw.trim().length > 0
          ? startTimeRaw
          : typeof bookingAt === "string"
            ? bookingAt
            : null;
      const endTime =
        typeof endTimeRaw === "string" && endTimeRaw.trim().length > 0
          ? endTimeRaw
          : typeof startTime === "string"
            ? dayjs(startTime)
                .add(90, "minute")
                .toISOString()
            : null;
      const checkedInAt = row.checked_in_at;
      const noShowMarkedAt = row.no_show_marked_at;
      const note = row.note;
      const createdByUserId = row.created_by_user_id;
      const lastEditedAt = row.last_edited_at;
      const lastEditedByUserId = row.last_edited_by_user_id;
      const status = row.status;

      if (
        typeof id !== "string" ||
        typeof customerId !== "string" ||
        typeof branchId !== "string" ||
        typeof guestCount !== "number" ||
        typeof bookingAt !== "string" ||
        startTime === null ||
        endTime === null ||
        typeof createdByUserId !== "string" ||
        typeof status !== "string" ||
        !bookingStatuses.includes(status as BookingStatus)
      ) {
        return null;
      }
      if (areaId !== null && typeof areaId !== "string") {
        return null;
      }
      if (tableId !== null && typeof tableId !== "string") {
        return null;
      }
      if (mergeGroupId !== null && mergeGroupId !== undefined && typeof mergeGroupId !== "string") {
        return null;
      }
      if (checkedInAt !== null && typeof checkedInAt !== "string") {
        return null;
      }
      if (noShowMarkedAt !== null && typeof noShowMarkedAt !== "string") {
        return null;
      }
      if (note !== null && typeof note !== "string") {
        return null;
      }
      if (lastEditedAt !== null && typeof lastEditedAt !== "string") {
        return null;
      }
      if (lastEditedByUserId !== null && typeof lastEditedByUserId !== "string") {
        return null;
      }

      return {
        id,
        customerId,
        branchId,
        areaId,
        tableId,
        mergeGroupId: (mergeGroupId as string | null | undefined) ?? null,
        guestCount,
        bookingAt,
        startTime,
        endTime,
        checkedInAt: checkedInAt ?? undefined,
        noShowMarkedAt: noShowMarkedAt ?? undefined,
        note: note ?? undefined,
        createdByUserId,
        lastEditedAt: lastEditedAt ?? undefined,
        lastEditedByUserId: lastEditedByUserId ?? undefined,
        status: status as BookingStatus,
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
      };
    };

    const tableStatuses: TableStatus[] = ["available", "hold", "occupied", "locked"];

    const mapRealtimeTable = (row: RealtimeRow): DiningTable | null => {
      const id = row.id;
      const branchId = row.branch_id;
      const areaId = row.area_id;
      const name = row.name;
      const seats = row.seats;
      const status = row.status;
      const positionX = row.position_x;
      const positionY = row.position_y;
      if (
        typeof id !== "string" ||
        typeof branchId !== "string" ||
        typeof areaId !== "string" ||
        typeof name !== "string" ||
        typeof seats !== "number" ||
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
        seats,
        status: status as TableStatus,
        positionX,
        positionY,
      };
    };

    const mapRealtimeArea = (row: RealtimeRow): Area | null => {
      const id = row.id;
      const branchId = row.branch_id;
      const name = row.name;
      const capacity = row.capacity;
      const floorGridColumns = row.floor_grid_columns;
      const floorGridRows = row.floor_grid_rows;
      const floorNodeSpacing = row.floor_node_spacing;
      if (
        typeof id !== "string" ||
        typeof branchId !== "string" ||
        typeof name !== "string" ||
        typeof capacity !== "number"
      ) {
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
        capacity,
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
        password: "",
        fullName,
        role: role as Role,
        branchIds: (branchIds ?? []) as string[],
      };
    };

    const mapRealtimeMergeGroup = (row: RealtimeRow): TableMergeGroup | null => {
      const id = row.id;
      const branchId = row.branch_id;
      const areaId = row.area_id;
      const autoNumber = row.auto_number;
      const mergedName = row.merged_name;
      const totalCapacity = row.total_capacity;
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
        totalCapacity: typeof totalCapacity === "number" ? totalCapacity : 0,
        tableIds: [],
        status: status === "released" ? "released" : "active",
        startDate,
        endDate,
        createdAt,
        releasedAt: typeof releasedAt === "string" ? releasedAt : null,
      };
    };

    const applyRealtimePatch = (table: string, payload: RealtimePayload): boolean => {
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
          setState((prev) => ({
            ...prev,
            bookings: prev.bookings.filter((item) => item.id !== id),
          }));
          return true;
        }
        if (!payload.new) {
          return false;
        }
        const mapped = mapRealtimeBooking(payload.new);
        if (!mapped) {
          return false;
        }
        setState((prev) => {
          const next = [mapped, ...prev.bookings.filter((item) => item.id !== mapped.id)].sort(
            (a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()
          );
          return { ...prev, bookings: next };
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
          return false;
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
    ] as const;
    const branchScopedRealtimeTables = [
      "areas",
      "tables",
      "customers",
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
          if (applyRealtimePatch(table, payload as RealtimePayload)) {
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
              if (
                status === "SUBSCRIBED" ||
                status === "CHANNEL_ERROR" ||
                status === "TIMED_OUT" ||
                status === "CLOSED"
              ) {
                // Keep fallback poll active and ensure eventual consistency even after reconnect races.
                runReload();
              }
            })
        : null;

    const fallbackInterval = setInterval(() => {
      runReload();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(fallbackInterval);
      if (realtimeChannel && realtime) {
        void realtime.removeChannel(realtimeChannel);
      }
    };
  }, [filteredBranchIds, hasRealtime, hasSupabase, reload, currentUser?.id]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(userForSession(currentUser)));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [currentUser]);

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
        activeBranchId: user.branchIds[0],
      }));
    }
    return sessionUser;
  };

  const logout = () => {
    clearBranchPickRequired();
    setCurrentUser(null);
  };

  const setActiveBranchId = (branchId: string) => {
    if (currentUser) {
      if (shouldPickBranchOnLogin(currentUser.role)) {
        persistActiveBranch(currentUser, branchId);
      } else if (
        (currentUser.role === "manager" || currentUser.role === "employee") &&
        currentUser.branchIds.length > 1
      ) {
        persistActiveBranch(currentUser, branchId);
      }
    }
    setState((prev) => ({ ...prev, activeBranchId: branchId }));
  };

  const updateBranch = async (branchId: string, input: { name: string; address: string }) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
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

    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase. Vui lòng cấu hình .env.local." };
    }

    // Optimistic: immediately reflect auto table state from booking time.
    // so UI updates without waiting for the next polling reload.
    const tableBefore = input.tableId
      ? state.tables.find((t) => t.id === input.tableId)
      : undefined;
    if (tableBefore && tableBefore.status !== "locked") {
      const nextStatus: TableStatus = isImmediateBookingArrival(input.bookingAt)
        ? "occupied"
        : "hold";
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

      if (!result.ok && tableBefore) {
        setState((prev) => ({
          ...prev,
          tables: prev.tables.map((t) =>
            t.id === tableBefore.id ? { ...t, status: tableBefore.status } : t
          ),
        }));
      }

      // Pull a fresh snapshot immediately so the new booking/customer appears without
      // waiting for the 5s polling tick (still no browser refresh).
      if (result.ok) {
        if (!reloadInFlightRef.current) {
          reloadInFlightRef.current = true;
          lastReloadAtRef.current = Date.now();
          try {
            await reload({ scope: "floor" });
          } finally {
            reloadInFlightRef.current = false;
          }
        } else {
          // If a poll reload is already in flight, skip; next tick/slice will include it.
        }
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
    const booking = state.bookings.find((item) => item.id === input.bookingId);
    if (!booking) {
      return { ok: false, message: "Không tìm thấy booking." };
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId)) {
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
          guestCount:
            typeof input.guestCount === "number" && Number.isFinite(input.guestCount)
              ? Math.max(1, Math.round(input.guestCount))
              : booking.guestCount,
        });
        return next ?? prev;
      });
    }

    const result = await assignBookingToTableInSupabase(input);
    if (!result.ok || /hàng chờ/i.test(result.message)) {
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
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      return { ok: false, message: "Không tìm thấy booking." };
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId)) {
      return { ok: false, message: "Bạn không có quyền chỉnh booking của chi nhánh này." };
    }
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }
    const result = await updateBookingGuestCountInSupabase(bookingId, guestCount);
    if (result.ok && !reloadInFlightRef.current) {
      reloadInFlightRef.current = true;
      lastReloadAtRef.current = Date.now();
      try {
        await reload({ scope: "floor" });
      } finally {
        reloadInFlightRef.current = false;
      }
    }
    return result;
  };

  const updateBookingOrder = async (input: {
    bookingId: string;
    bookingAt: string;
    guestCount?: number;
    customerPhone?: string;
    areaId: string | null;
    tableId: string | null;
    mergeGroupId?: string | null;
    allowDuplicate?: boolean;
  }) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
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
    if (!canOperateBookingInBranch(currentUser, booking.branchId)) {
      return { ok: false, message: "Bạn không có quyền chỉnh booking của chi nhánh này." };
    }
    const result = await updateBookingOrderInSupabase({
      ...input,
      editedByUserId: currentUser.id,
    });
    if (result.ok && !reloadInFlightRef.current) {
      reloadInFlightRef.current = true;
      lastReloadAtRef.current = Date.now();
      try {
        await reload({ scope: "floor" });
      } finally {
        reloadInFlightRef.current = false;
      }
    }
    return result;
  };

  const changeBookingTable = async (input: {
    bookingId: string;
    areaId: string;
    tableId: string | null;
    mergeGroupId?: string | null;
  }) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
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
    if (!canOperateBookingInBranch(currentUser, booking.branchId)) {
      return { ok: false, message: "Bạn không có quyền chỉnh booking của chi nhánh này." };
    }
    const result = await changeBookingTableInSupabase({
      ...input,
      editedByUserId: currentUser.id,
    });
    if (result.ok && !reloadInFlightRef.current) {
      reloadInFlightRef.current = true;
      lastReloadAtRef.current = Date.now();
      try {
        await reload({ scope: "floor" });
      } finally {
        reloadInFlightRef.current = false;
      }
    }
    return result;
  };

  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    if (!hasSupabase) {
      return;
    }
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      throw new Error("Không tìm thấy booking.");
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId)) {
      throw new Error("Bạn không có quyền chỉnh booking của chi nhánh này.");
    }
    if (isEmployeeUser(currentUser)) {
      assertEmployeeMaySetBookingStatus(state, bookingId, status);
    }

    const clearsCheckedInAt =
      status === "cancelled" ||
      status === "completed" ||
      status === "no_show" ||
      status === "confirmed" ||
      status === "pending";

    const optimisticPatch: Partial<Booking> = {
      status,
      ...(clearsCheckedInAt ? { checkedInAt: undefined } : {}),
      ...(status === "no_show" ? { noShowMarkedAt: dayjs().toISOString() } : {}),
    };

    const revertPatch: Partial<Booking> = {
      status: booking.status,
      checkedInAt: booking.checkedInAt,
      noShowMarkedAt: booking.noShowMarkedAt,
    };

    setState((prev) => {
      const next = applyBookingPatchToSnapshot(prev, bookingId, optimisticPatch);
      return next ?? prev;
    });

    try {
      await updateBookingStatusInSupabase(bookingId, status);
    } catch (error) {
      setState((prev) => {
        const next = applyBookingPatchToSnapshot(prev, bookingId, revertPatch);
        return next ?? prev;
      });
      throw error;
    }
  };

  const checkInBooking = async (bookingId: string) => {
    if (!hasSupabase) {
      return;
    }
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    const booking = state.bookings.find((item) => item.id === bookingId);
    if (!booking) {
      throw new Error("Không tìm thấy booking.");
    }
    if (!canOperateBookingInBranch(currentUser, booking.branchId)) {
      throw new Error("Bạn không có quyền chỉnh booking của chi nhánh này.");
    }

    const revertPatch: Partial<Booking> = {
      status: booking.status,
      checkedInAt: booking.checkedInAt,
    };

    setState((prev) => {
      const next = applyBookingPatchToSnapshot(prev, bookingId, {
        status: "seated",
        checkedInAt: dayjs().toISOString(),
      });
      return next ?? prev;
    });

    try {
      await checkInBookingInSupabase(bookingId);
    } catch (error) {
      setState((prev) => {
        const next = applyBookingPatchToSnapshot(prev, bookingId, revertPatch);
        return next ?? prev;
      });
      throw error;
    }
  };

  const deleteCustomers = async (customerIds: string[]) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
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
    return result;
  };

  const upsertTable = async (table: Omit<DiningTable, "id"> & { id?: string }) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (!hasSupabase) {
      return;
    }
    await upsertTableInSupabase(table);
  };

  const upsertTablesBatch = async (tables: Array<Omit<DiningTable, "id"> & { id?: string }>) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (!hasSupabase || tables.length === 0) {
      return;
    }
    await upsertTablesBatchInSupabase(tables);
  };

  const updateTableStatus = async (tableId: string, status: TableStatus) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
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
    if (!hasSupabase) {
      return;
    }
    await deleteTableInSupabase(tableId);
  };

  const deleteTables = async (tableIds: string[]) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (!hasSupabase || tableIds.length === 0) {
      return;
    }
    await deleteTablesInSupabase(tableIds);
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
    updateLocalTablePosition(tableId, x, y);
    if (!hasSupabase) {
      return;
    }
    await updateTablePositionInSupabase(tableId, x, y);
  };

  const addArea = async (branchId: string, name: string, capacity: number) => {
    if (isEmployeeUser(currentUser)) {
      throw new Error(EMPLOYEE_MUTATION_BLOCKED);
    }
    if (!hasSupabase) {
      return;
    }
    await addAreaInSupabase(branchId, name, capacity);
  };

  const updateArea = async (
    areaId: string,
    input: { branchId?: string; name?: string; capacity?: number }
  ) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
    }
    const applyLocal = () => {
      setState((prev) => ({
        ...prev,
        areas: prev.areas.map((a) =>
          a.id === areaId
            ? {
                ...a,
                ...(input.name !== undefined ? { name: input.name } : {}),
                ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
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
      }
    }
    return result;
  };

  const deleteArea = async (areaId: string) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
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
    const result = await deleteAreaInSupabase(areaId);
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
    if (currentUser?.role === "general_manager" && payload.role === "admin") {
      return {
        ok: false,
        message: "Chỉ Admin mới có thể tạo hoặc gán vai trò Admin.",
      };
    }
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }
    const result = await addUserInSupabase(payload);
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
    const result = await updateUserInSupabase(userId, payload);
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

  const deleteUser = async (userId: string) => {
    if (isEmployeeUser(currentUser)) {
      return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
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
    async (areaId: string, columns: number, rows: number, spacing: number) => {
      if (isEmployeeUser(currentUser)) {
        return;
      }
      const floorGridColumns = Math.min(24, Math.max(4, Math.round(columns)));
      const floorGridRows = Math.min(18, Math.max(4, Math.round(rows)));
      const floorNodeSpacing = clampFloorNodeSpacing(spacing);
      if (!hasSupabase) {
        setState((prev) => ({
          ...prev,
          areas: prev.areas.map((a) =>
            a.id === areaId
              ? { ...a, floorGridColumns, floorGridRows, floorNodeSpacing }
              : a
          ),
        }));
        return;
      }
      await updateAreaFloorLayoutInSupabase(areaId, {
        floorGridColumns,
        floorGridRows,
        floorNodeSpacing,
      });
      setState((prev) => ({
        ...prev,
        areas: prev.areas.map((a) =>
          a.id === areaId
            ? { ...a, floorGridColumns, floorGridRows, floorNodeSpacing }
            : a
        ),
      }));
    },
    [currentUser, hasSupabase]
  );

  const saveFloorLayout = useCallback(
    async (areaId: string, input: SaveFloorLayoutInput) => {
      if (isEmployeeUser(currentUser)) {
        throw new Error(EMPLOYEE_MUTATION_BLOCKED);
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

      if (!hasSupabase) {
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
        return;
      }
      await saveFloorLayoutToSupabase(areaId, {
        floorGridColumns,
        floorGridRows,
        floorNodeSpacing,
        tablePositions,
      });
      await reload({ scope: "floor" });
    },
    [currentUser, hasSupabase, reload]
  );

  // Snapshot synchronization is driven by Supabase Realtime with fallback polling.

  const acquireFloorLayoutEditLock = useCallback(
    async (areaId: string) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false as const, holderFullName: "Tài khoản nhân viên" };
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
    }) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
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
      if (result.ok) {
        await reload({ scope: "floor" });
      }
      return result;
    },
    [currentUser, hasSupabase, reload]
  );

  const addTableToMergeGroup = useCallback(
    async (input: { groupId: string; tableId: string; repackFloor?: boolean }) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
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
    async (input: { groupId: string; tableId: string; repackFloor?: boolean }) => {
      if (isEmployeeUser(currentUser)) {
        return { ok: false, message: EMPLOYEE_MUTATION_BLOCKED };
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
    isLoading,
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
    addTableToMergeGroup,
    removeTableFromMergeGroup,
    releaseTableMergeGroup,
    updateTableMergeGroupDates,
    updateBookingStatus,
    checkInBooking,
    deleteCustomers,
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
    deleteUser,
    markNotificationRead,
    markAllScopedNotificationsRead,
    saveAreaFloorGrid,
    saveFloorLayout,
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
