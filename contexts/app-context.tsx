"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { initialState } from "@/lib/mock-data";
import {
  addAreaInSupabase,
  addUserInSupabase,
  checkInBookingInSupabase,
  createBookingInSupabase,
  fetchSnapshot,
  isSupabaseEnabled,
  loginWithSupabase,
  markNotificationReadInSupabase,
  setFloorBackgroundInSupabase,
  updateBookingStatusInSupabase,
  updateTablePositionInSupabase,
  updateTableStatusInSupabase,
  upsertTableInSupabase,
} from "@/lib/supabase-store";
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

interface AppContextValue {
  state: AppStateSnapshot;
  currentUser: AppUser | null;
  filteredBranchIds: string[];
  isLoading: boolean;
  hasSupabase: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  reload: () => Promise<void>;
  setActiveBranchId: (branchId: string) => void;
  createBooking: (input: CreateBookingInput) => Promise<ActionResult>;
  updateBookingStatus: (bookingId: string, status: BookingStatus) => Promise<void>;
  checkInBooking: (bookingId: string) => Promise<void>;
  upsertTable: (table: Omit<DiningTable, "id"> & { id?: string }) => Promise<void>;
  updateTableStatus: (tableId: string, status: TableStatus) => Promise<void>;
  moveTable: (tableId: string, x: number, y: number) => void;
  persistTablePosition: (tableId: string) => Promise<void>;
  setFloorBackground: (areaId: string, imageDataUrl: string) => Promise<void>;
  addArea: (branchId: string, name: string, capacity: number) => Promise<void>;
  addUser: (payload: {
    username: string;
    password: string;
    fullName: string;
    role: Role;
    branchIds: string[];
  }) => Promise<ActionResult>;
  markNotificationRead: (id: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function userScopeBranchIds(user: AppUser | null, activeBranchId?: string): string[] {
  if (!user) {
    return [];
  }
  if (user.role === "manager") {
    return user.branchIds;
  }
  return activeBranchId ? [activeBranchId] : user.branchIds;
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
    if (!hasSupabase) {
      setState(initialState);
      return;
    }
    const snapshot = await fetchSnapshot();
    setState((prev) => ({
      ...snapshot,
      activeBranchId: prev.activeBranchId ?? snapshot.activeBranchId,
    }));
  }, [hasSupabase]);

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
      return false;
    }

    setCurrentUser(user);
    setState((prev) => ({
      ...prev,
      activeBranchId:
        user.role === "manager" ? user.branchIds[0] : prev.activeBranchId ?? user.branchIds[0],
    }));
    return true;
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const setActiveBranchId = (branchId: string) => {
    setState((prev) => ({ ...prev, activeBranchId: branchId }));
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
    await reload();
    return result;
  };

  const updateBookingStatus = async (bookingId: string, status: BookingStatus) => {
    if (!hasSupabase) {
      return;
    }
    await updateBookingStatusInSupabase(bookingId, status);
    await reload();
  };

  const checkInBooking = async (bookingId: string) => {
    if (!hasSupabase) {
      return;
    }
    await checkInBookingInSupabase(bookingId);
    await reload();
  };

  const upsertTable = async (table: Omit<DiningTable, "id"> & { id?: string }) => {
    if (!hasSupabase) {
      return;
    }
    await upsertTableInSupabase(table);
    await reload();
  };

  const updateTableStatus = async (tableId: string, status: TableStatus) => {
    if (!hasSupabase) {
      return;
    }
    await updateTableStatusInSupabase(tableId, status);
    await reload();
  };

  const moveTable = (tableId: string, x: number, y: number) => {
    setState((prev) => ({
      ...prev,
      tables: prev.tables.map((table) =>
        table.id === tableId ? { ...table, positionX: x, positionY: y } : table
      ),
    }));
  };

  const persistTablePosition = async (tableId: string) => {
    if (!hasSupabase) {
      return;
    }
    const table = state.tables.find((item) => item.id === tableId);
    if (!table) {
      return;
    }
    await updateTablePositionInSupabase(tableId, table.positionX, table.positionY);
  };

  const setFloorBackground = async (areaId: string, imageDataUrl: string) => {
    if (!currentUser || !hasSupabase) {
      return;
    }
    await setFloorBackgroundInSupabase(currentUser.id, areaId, imageDataUrl);
    await reload();
  };

  const addArea = async (branchId: string, name: string, capacity: number) => {
    if (!hasSupabase) {
      return;
    }
    await addAreaInSupabase(branchId, name, capacity);
    await reload();
  };

  const addUser = async (payload: {
    username: string;
    password: string;
    fullName: string;
    role: Role;
    branchIds: string[];
  }) => {
    if (!hasSupabase) {
      return { ok: false, message: "Chua ket noi Supabase." };
    }
    const result = await addUserInSupabase(payload);
    await reload();
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
    createBooking,
    updateBookingStatus,
    checkInBooking,
    upsertTable,
    updateTableStatus,
    moveTable,
    persistTablePosition,
    setFloorBackground,
    addArea,
    addUser,
    markNotificationRead,
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
