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
import { initialState } from "@/lib/mock-data";
import {
  addAreaInSupabase,
  addUserInSupabase,
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
import { isFloorLayoutRealtimeReloadBlocked } from "@/lib/floor-layout-sync";
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
  customerPhone: string;
  branchId: string;
  areaId: string;
  tableId: string;
  guestCount: number;
  bookingAt: string;
  note?: string;
};

type ActionResult = { ok: boolean; message: string };

export type RealtimeConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

interface AppContextValue {
  state: AppStateSnapshot;
  currentUser: AppUser | null;
  filteredBranchIds: string[];
  isLoading: boolean;
  hasSupabase: boolean;
  realtimeStatus: RealtimeConnectionStatus;
  login: (username: string, password: string) => Promise<AppUser | null>;
  logout: () => void;
  reload: () => Promise<void>;
  setActiveBranchId: (branchId: string) => void;
  updateBranch: (
    branchId: string,
    input: { name: string; address: string }
  ) => Promise<ActionResult>;
  createBooking: (input: CreateBookingInput) => Promise<ActionResult>;
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
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionStatus>(() =>
    isSupabaseEnabled() ? "connecting" : "disconnected"
  );
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const storedSession = window.localStorage.getItem(SESSION_KEY);
    return storedSession ? (JSON.parse(storedSession) as AppUser) : null;
  });

  const hasSupabase = isSupabaseEnabled();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const update = () => {
      if (!hasSupabase) {
        setRealtimeStatus("disconnected");
        return;
      }
      setRealtimeStatus(window.navigator.onLine ? "connecting" : "disconnected");
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [hasSupabase]);

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
      return { ok: false, message: "Vui long dang nhap." };
    }

    if (!hasSupabase) {
      return { ok: false, message: "Chua ket noi Supabase. Vui long cau hinh .env.local." };
    }

    const result = await createBookingInSupabase({
      ...input,
      createdByUserId: currentUser.id,
    });
    return result;
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
      return { ok: true, message: "Khong co khach hang de xoa." };
    }

    const hasBooking = state.bookings.some((b) => ids.includes(b.customerId));
    if (hasBooking) {
      return { ok: false, message: "Khong the xoa: khach hang da co booking." };
    }

    if (!hasSupabase) {
      setState((prev) => ({
        ...prev,
        customers: prev.customers.filter((c) => !ids.includes(c.id)),
      }));
      return { ok: true, message: "Da xoa khach hang." };
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
    await updateTableStatusInSupabase(tableId, status);
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
      return { ok: false, message: "Chua ket noi Supabase." };
    }
    const result = await addUserInSupabase(payload);
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
    return result;
  };

  const markNotificationRead = async (id: string) => {
    if (!hasSupabase) {
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

  const saveAreaFloorGrid = useCallback(
    async (areaId: string, columns: number, rows: number, spacing: number) => {
      const floorGridColumns = Math.min(24, Math.max(4, Math.round(columns)));
      const floorGridRows = Math.min(18, Math.max(4, Math.round(rows)));
      const floorNodeSpacing = Math.min(160, Math.max(64, Math.round(spacing)));
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
      const floorNodeSpacing = Math.min(160, Math.max(64, Math.round(input.floorNodeSpacing)));
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

  const reloadDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hasSupabase || !supabase) {
      return;
    }
    const client = supabase;

    type RealtimeEvent = "INSERT" | "UPDATE" | "DELETE";
    type RealtimePayload = {
      eventType: RealtimeEvent;
      new: Record<string, unknown> | null;
      old: Record<string, unknown> | null;
    };

    const branchFilter =
      filteredBranchIds.length > 0
        ? `branch_id=in.(${filteredBranchIds.map((id) => `"${id}"`).join(",")})`
        : null;

    const upsertById = <T extends { id: string }>(list: T[], item: T) => {
      const index = list.findIndex((row) => row.id === item.id);
      if (index === -1) {
        return [item, ...list];
      }
      const next = [...list];
      next[index] = item;
      return next;
    };

    const removeById = <T extends { id: string }>(list: T[], id: string) =>
      list.filter((row) => row.id !== id);

    const scheduleReload = () => {
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current);
      }
      reloadDebounceRef.current = setTimeout(() => {
        reloadDebounceRef.current = null;
        void reload();
      }, 420);
    };

    const applyRealtimeMutation = (table: string, payload: RealtimePayload) => {
      const eventType = payload.eventType;
      const rowNew = payload.new;
      const rowOld = payload.old;

      // Avoid overwriting draft floor edits; previously we blocked realtime-triggered reloads.
      if (isFloorLayoutRealtimeReloadBlocked() && (table === "tables" || table === "areas")) {
        return;
      }

      setState((prev) => {
        const source =
          (eventType === "DELETE" ? rowOld : rowNew) as Record<string, unknown> | null;

        if (table === "tables") {
          const id = source?.id;
          if (typeof id !== "string") return prev;
          if (eventType === "DELETE") {
            return { ...prev, tables: removeById(prev.tables, id) };
          }
          const mapped: DiningTable = {
            id,
            branchId: String(source?.branch_id ?? ""),
            areaId: String(source?.area_id ?? ""),
            name: String(source?.name ?? ""),
            seats: Number(source?.seats ?? 0),
            status: (source?.status as TableStatus) ?? "available",
            positionX: Number(source?.position_x ?? 0),
            positionY: Number(source?.position_y ?? 0),
          };
          return { ...prev, tables: upsertById(prev.tables, mapped) };
        }

        if (table === "areas") {
          const id = source?.id;
          if (typeof id !== "string") return prev;
          if (eventType === "DELETE") {
            return { ...prev, areas: removeById(prev.areas, id) };
          }
          const mapped = {
            id,
            branchId: String(source?.branch_id ?? ""),
            name: String(source?.name ?? ""),
            capacity: Number(source?.capacity ?? 0),
            floorGridColumns:
              typeof source?.floor_grid_columns === "number" ? source.floor_grid_columns : 12,
            floorGridRows: typeof source?.floor_grid_rows === "number" ? source.floor_grid_rows : 8,
            floorNodeSpacing:
              typeof source?.floor_node_spacing === "number" ? source.floor_node_spacing : 96,
          };
          return { ...prev, areas: upsertById(prev.areas, mapped) };
        }

        if (table === "bookings") {
          const id = source?.id;
          if (typeof id !== "string") return prev;
          if (eventType === "DELETE") {
            return { ...prev, bookings: removeById(prev.bookings, id) };
          }
          const mapped = {
            id,
            customerId: String(source?.customer_id ?? ""),
            branchId: String(source?.branch_id ?? ""),
            areaId: String(source?.area_id ?? ""),
            tableId: String(source?.table_id ?? ""),
            guestCount: Number(source?.guest_count ?? 0),
            bookingAt: String(source?.booking_at ?? ""),
            note: source?.note ? String(source.note) : undefined,
            createdByUserId: String(source?.created_by_user_id ?? ""),
            status: (source?.status as BookingStatus) ?? "confirmed",
          };
          return { ...prev, bookings: upsertById(prev.bookings, mapped) };
        }

        if (table === "customers") {
          const id = source?.id;
          if (typeof id !== "string") return prev;
          if (eventType === "DELETE") {
            return { ...prev, customers: removeById(prev.customers, id) };
          }
          const mapped = {
            id,
            fullName: String(source?.full_name ?? ""),
            phone: String(source?.phone ?? ""),
            note: source?.note ? String(source.note) : undefined,
          };
          return { ...prev, customers: upsertById(prev.customers, mapped) };
        }

        if (table === "internal_notifications") {
          const id = source?.id;
          if (typeof id !== "string") return prev;
          if (eventType === "DELETE") {
            return { ...prev, notifications: removeById(prev.notifications, id) };
          }
          const mapped = {
            id,
            title: String(source?.title ?? ""),
            message: String(source?.message ?? ""),
            createdAt: String(source?.created_at ?? ""),
            isRead: Boolean(source?.is_read),
            branchId: source?.branch_id ? String(source.branch_id) : undefined,
          };
          // Newest first like fetchSnapshot ordering.
          const next = upsertById(prev.notifications, mapped).sort(
            (a, b) => new Date(b.createdAt).valueOf() - new Date(a.createdAt).valueOf()
          );
          return { ...prev, notifications: next };
        }

        if (table === "branches") {
          const id = source?.id;
          if (typeof id !== "string") return prev;
          if (eventType === "DELETE") {
            return { ...prev, branches: removeById(prev.branches, id) };
          }
          const mapped = {
            id,
            name: String(source?.name ?? ""),
            address: String(source?.address ?? ""),
          };
          return { ...prev, branches: upsertById(prev.branches, mapped) };
        }

        if (table === "app_users") {
          const id = source?.id;
          if (typeof id !== "string") return prev;
          if (eventType === "DELETE") {
            return { ...prev, users: removeById(prev.users, id) };
          }
          const mapped = {
            id,
            username: String(source?.username ?? ""),
            password: String(source?.password ?? ""),
            fullName: String(source?.full_name ?? ""),
            role: source?.role as Role,
            branchIds: (source?.branch_ids ?? []) as string[],
          };
          return { ...prev, users: upsertById(prev.users, mapped) };
        }

        return prev;
      });
    };

    const channel = client
      .channel("app-data-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tables", ...(branchFilter ? { filter: branchFilter } : {}) },
        (payload) => applyRealtimeMutation("tables", payload as unknown as RealtimePayload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "areas", ...(branchFilter ? { filter: branchFilter } : {}) },
        (payload) => applyRealtimeMutation("areas", payload as unknown as RealtimePayload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", ...(branchFilter ? { filter: branchFilter } : {}) },
        (payload) => applyRealtimeMutation("bookings", payload as unknown as RealtimePayload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        (payload) => applyRealtimeMutation("customers", payload as unknown as RealtimePayload)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "internal_notifications",
          ...(branchFilter ? { filter: branchFilter } : {}),
        },
        (payload) => applyRealtimeMutation("internal_notifications", payload as unknown as RealtimePayload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "branches" },
        (payload) => applyRealtimeMutation("branches", payload as unknown as RealtimePayload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_users" },
        (payload) => applyRealtimeMutation("app_users", payload as unknown as RealtimePayload)
      )
      .subscribe((status) => {
        // When reconnecting after a drop, pull a snapshot to avoid missing events.
        if (status === "SUBSCRIBED") {
          setRealtimeStatus("connected");
          scheduleReload();
          return;
        }
        if (status === "CHANNEL_ERROR") {
          setRealtimeStatus("error");
          return;
        }
        if (status === "TIMED_OUT" || status === "CLOSED") {
          setRealtimeStatus(typeof window !== "undefined" && !window.navigator.onLine ? "disconnected" : "connecting");
        }
      });
    return () => {
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current);
        reloadDebounceRef.current = null;
      }
      void client.removeChannel(channel);
    };
  }, [hasSupabase, reload, filteredBranchIds]);

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
    realtimeStatus,
    login,
    logout,
    reload,
    setActiveBranchId,
    updateBranch,
    createBooking,
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
    throw new Error("useAppContext phai dung trong AppContextProvider");
  }
  return context;
}
