"use client";

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
import { initialState } from "@/lib/initial-state";
import { clampFloorNodeSpacing } from "@/lib/floor-map-layout";
import {
  addAreaInSupabase,
  addUserInSupabase,
  assignBookingToTableInSupabase,
  deleteAreaInSupabase,
  deleteUserInSupabase,
  updateUserInSupabase,
  checkInBookingInSupabase,
  createBookingInSupabase,
  fetchSnapshot,
  getFloorLayoutLockInfoInSupabase,
  isSupabaseEnabled,
  loginWithSupabase,
  markNotificationReadInSupabase,
  markNotificationsReadBatchInSupabase,
  deleteTableInSupabase,
  deleteTablesInSupabase,
  deleteCustomersInSupabase,
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
} from "@/lib/supabase-store";
import { supabase } from "@/lib/supabase";
import {
  AppStateSnapshot,
  AppUser,
  BookingStatus,
  DiningTable,
  Role,
  TableStatus,
} from "@/lib/types";

const SESSION_KEY = "ganh_hao_booking_session_v1";

type CreateBookingInput = {
  customerName: string;
  customerPhone?: string;
  branchId: string;
  areaId?: string | null;
  tableId?: string | null;
  guestCount?: number;
  bookingAt: string;
  note?: string;
};

function resolveAutoTableStatus(bookingAtIso: string): TableStatus {
  const bookingAt = new Date(bookingAtIso).getTime();
  return Number.isFinite(bookingAt) && bookingAt > Date.now() ? "hold" : "occupied";
}

type ActionResult = { ok: boolean; message: string };

interface AppContextValue {
  state: AppStateSnapshot;
  currentUser: AppUser | null;
  filteredBranchIds: string[];
  isLoading: boolean;
  hasSupabase: boolean;
  login: (username: string, password: string) => Promise<AppUser | null>;
  logout: () => void;
  reload: () => Promise<void>;
  setActiveBranchId: (branchId: string) => void;
  updateBranch: (
    branchId: string,
    input: { name: string; address: string }
  ) => Promise<ActionResult>;
  createBooking: (input: CreateBookingInput) => Promise<ActionResult>;
  assignBookingToTable: (input: {
    bookingId: string;
    areaId: string;
    tableId: string;
    guestCount?: number;
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
 * Quản lý chi nhánh: one branch at a time — assigned branch if only one; otherwise the active
 * branch (switch via menu "Chọn chi nhánh" → /select-branch).
 */
function userScopeBranchIds(user: AppUser | null, activeBranchId?: string): string[] {
  if (!user) {
    return [];
  }
  if (user.role === "manager") {
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

export function AppContextProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppStateSnapshot>(initialState);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const storedSession = window.localStorage.getItem(SESSION_KEY);
    return storedSession ? (JSON.parse(storedSession) as AppUser) : null;
  });

  const hasSupabase = isSupabaseEnabled();

  const reload = useCallback(async () => {
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
    const snapshot = await fetchSnapshot();
    setState((prev) => ({
      ...snapshot,
      activeBranchId: mergeActive(prev, snapshot.activeBranchId),
    }));
  }, [hasSupabase, currentUser]);

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
    if (!hasSupabase || !supabase) {
      return;
    }

    let cancelled = false;
    const interval = setInterval(() => {
      if (cancelled) return;
      if (reloadInFlightRef.current) return;
      reloadInFlightRef.current = true;
      lastReloadAtRef.current = Date.now();
      Promise.resolve(reload()).finally(() => {
        reloadInFlightRef.current = false;
      });
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [hasSupabase, reload]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(currentUser));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [currentUser]);

  const filteredBranchIds = useMemo(
    () => userScopeBranchIds(currentUser, state.activeBranchId),
    [currentUser, state.activeBranchId]
  );

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

    setCurrentUser(user);
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
    return user;
  };

  const logout = () => {
    clearBranchPickRequired();
    setCurrentUser(null);
  };

  const setActiveBranchId = (branchId: string) => {
    if (currentUser) {
      if (shouldPickBranchOnLogin(currentUser.role)) {
        persistActiveBranch(currentUser, branchId);
      } else if (currentUser.role === "manager" && currentUser.branchIds.length > 1) {
        persistActiveBranch(currentUser, branchId);
      }
    }
    setState((prev) => ({ ...prev, activeBranchId: branchId }));
  };

  const updateBranch = async (branchId: string, input: { name: string; address: string }) => {
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

  const createBooking = async (input: CreateBookingInput) => {
    if (!currentUser) {
      return { ok: false, message: "Vui lòng đăng nhập." };
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
      const nextStatus = resolveAutoTableStatus(input.bookingAt);
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
            await reload();
          } finally {
            reloadInFlightRef.current = false;
          }
        } else {
          // If a poll reload is already in flight, skip; next tick/snapshot will include it.
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
    tableId: string;
    guestCount?: number;
  }) => {
    if (!hasSupabase) {
      return { ok: false, message: "Chưa kết nối Supabase." };
    }
    return assignBookingToTableInSupabase(input);
  };

  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    if (!hasSupabase) {
      return;
    }
    await updateBookingStatusInSupabase(bookingId, status);
  };

  const checkInBooking = async (bookingId: string) => {
    if (!hasSupabase) {
      return;
    }
    await checkInBookingInSupabase(bookingId);
  };

  const deleteCustomers = async (customerIds: string[]) => {
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
    if (!hasSupabase) {
      return;
    }
    await upsertTableInSupabase(table);
  };

  const upsertTablesBatch = async (tables: Array<Omit<DiningTable, "id"> & { id?: string }>) => {
    if (!hasSupabase || tables.length === 0) {
      return;
    }
    await upsertTablesBatchInSupabase(tables);
  };

  const updateTableStatus = async (tableId: string, status: TableStatus) => {
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
    if (!hasSupabase) {
      return;
    }
    await deleteTableInSupabase(tableId);
  };

  const deleteTables = async (tableIds: string[]) => {
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
    updateLocalTablePosition(tableId, x, y);
    if (!hasSupabase) {
      return;
    }
    await updateTablePositionInSupabase(tableId, x, y);
  };

  const addArea = async (branchId: string, name: string, capacity: number) => {
    if (!hasSupabase) {
      return;
    }
    await addAreaInSupabase(branchId, name, capacity);
  };

  const updateArea = async (
    areaId: string,
    input: { branchId?: string; name?: string; capacity?: number }
  ) => {
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
        await reload();
      }
    }
    return result;
  };

  const deleteArea = async (areaId: string) => {
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
  }, [filteredBranchIds, hasSupabase, state.notifications]);

  const saveAreaFloorGrid = useCallback(
    async (areaId: string, columns: number, rows: number, spacing: number) => {
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
    [hasSupabase]
  );

  const saveFloorLayout = useCallback(
    async (areaId: string, input: SaveFloorLayoutInput) => {
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
      await reload();
    },
    [hasSupabase, reload]
  );

  // Realtime subscriptions removed in favor of silent polling refresh.

  const acquireFloorLayoutEditLock = useCallback(
    async (areaId: string) => {
      if (!hasSupabase || !currentUser) {
        return { ok: true as const };
      }
      return tryAcquireFloorLayoutLockInSupabase(areaId, currentUser.id);
    },
    [hasSupabase, currentUser]
  );

  const renewFloorLayoutEditLock = useCallback(
    async (areaId: string) => {
      if (!hasSupabase || !currentUser) {
        return;
      }
      await renewFloorLayoutLockInSupabase(areaId, currentUser.id);
    },
    [hasSupabase, currentUser]
  );

  const releaseFloorLayoutEditLock = useCallback(
    async (areaId: string) => {
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
    createBooking,
    assignBookingToTable,
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
