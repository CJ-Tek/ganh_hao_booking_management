"use client";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  NumberInput,
  Radio,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { DatePickerInput, TimeInput } from "@mantine/dates";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Minimize2,
  Minus,
  MoreVertical,
  Plus,
  RotateCcw,
  Pencil,
  Save,
  Search,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { setFloorLayoutRealtimeReloadBlocked } from "@/lib/floor-layout-sync";
import { bookingStatusColor, bookingStatusLabel, tableStatusColor, tableStatusLabel } from "@/lib/display";
import { type DiningTable, type TableStatus } from "@/lib/types";
import classes from "./page.module.css";

const TABLE_STATUS_SURFACE_CLASS: Record<TableStatus, string> = {
  available: classes.statusSurface_available,
  hold: classes.statusSurface_hold,
  occupied: classes.statusSurface_occupied,
  locked: classes.statusSurface_locked,
};

const DEFAULT_GRID_COLUMNS = 12;
const DEFAULT_GRID_ROWS = 8;
const LEGACY_CELL_WIDTH = 100;
const LEGACY_CELL_HEIGHT = 70;
/** Low enough that large grids can shrink to fit small viewports; zoom controls use the same range. */
const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.1;
const DEFAULT_NODE_SPACING = 96;
const CANVAS_PADDING = 64;
const TOUCH_PINCH_FACTOR = 0.005;
/** Inset the fitted region slightly inside the viewport so edges are not flush with the frame. */
const FIT_VIEWPORT_MARGIN = 0.94;
/** World-space padding around the union of table blocks when fitting (px). */
const FIT_TABLE_BOUNDS_PADDING = 40;
/** Must match `.tableBlock` width and the positioning math in the canvas. */
const TABLE_BLOCK_WIDTH = 112;
/** Includes space for the edit-mode remove control. */
const TABLE_BLOCK_HEIGHT = 90;
const TABLE_STACK_OFFSET = 8;
/** Sentinel coordinates when a table is stored in the palette (off the grid). */
const STORAGE_OFF_GRID = -1;
const TAP_PLACE_THRESHOLD_PX = 14;
const PALETTE_DRAG_THRESHOLD_PX = 12;

function isTableBlockTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el?.closest) {
    return false;
  }
  return Boolean(
    el.closest("[data-table-block]") || el.closest("[data-register-panel]")
  );
}

function normalizeGridValue(value: number, max: number, legacyStep: number) {
  if (Number.isInteger(value) && value >= 0 && value < max) {
    return value;
  }
  const legacyMapped = Math.round(value / legacyStep);
  return Math.max(0, Math.min(max - 1, legacyMapped));
}

function getTableGridPosition(table: DiningTable, gridColumns: number, gridRows: number) {
  return {
    col: normalizeGridValue(table.positionX, gridColumns, LEGACY_CELL_WIDTH),
    row: normalizeGridValue(table.positionY, gridRows, LEGACY_CELL_HEIGHT),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isTableInGrid(table: DiningTable, gridColumns: number, gridRows: number) {
  return (
    Number.isInteger(table.positionX) &&
    Number.isInteger(table.positionY) &&
    table.positionX >= 0 &&
    table.positionX < gridColumns &&
    table.positionY >= 0 &&
    table.positionY < gridRows
  );
}

/** Union of axis-aligned rects for rendered table blocks (same left/top math as the canvas). */
function getPlacedTableBounds(
  placedTables: DiningTable[],
  gridColumns: number,
  gridRows: number,
  nodeSpacing: number
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const grouped = new Map<string, DiningTable[]>();
  for (const table of placedTables) {
    const { row, col } = getTableGridPosition(table, gridColumns, gridRows);
    const key = `${row}-${col}`;
    const list = grouped.get(key) ?? [];
    list.push(table);
    grouped.set(key, list);
  }
  if (grouped.size === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [, tablesAtNode] of grouped) {
    const stackMax = tablesAtNode.length - 1;
    const { row, col } = getTableGridPosition(tablesAtNode[0]!, gridColumns, gridRows);
    const x = CANVAS_PADDING + col * nodeSpacing;
    const y = CANVAS_PADDING + row * nodeSpacing;
    const left = x - 56 + 0 * TABLE_STACK_OFFSET;
    const right = x - 56 + stackMax * TABLE_STACK_OFFSET + TABLE_BLOCK_WIDTH;
    const top = y - 28 + 0 * TABLE_STACK_OFFSET;
    const bottom = y - 28 + stackMax * TABLE_STACK_OFFSET + TABLE_BLOCK_HEIGHT;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }
  return { minX, minY, maxX, maxY };
}

type DragState = {
  pointerId: number;
  tableId: string;
  row: number;
  col: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type CanvasMode = "view" | "edit";

type FloorEditLayout = {
  gridColumns: number;
  gridRows: number;
  nodeSpacing: number;
  positions: Record<string, { x: number; y: number }>;
};

export default function FloorMapPage() {
  const {
    state,
    filteredBranchIds,
    updateTableStatus,
    createBooking,
    updateBookingStatus,
    checkInBooking,
    currentUser,
    isLoading,
    hasSupabase,
    saveAreaFloorGrid,
    saveFloorLayout,
    acquireFloorLayoutEditLock,
    renewFloorLayoutEditLock,
    releaseFloorLayoutEditLock,
    getFloorLayoutEditLockInfo,
    updateArea,
    deleteArea,
  } = useAppContext();
  const isCompact = usePortalCompact();
  const reserveManagerDock = currentUser?.role === "manager" && isCompact;
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("view");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [gridColumns, setGridColumns] = useState(DEFAULT_GRID_COLUMNS);
  const [gridRows, setGridRows] = useState(DEFAULT_GRID_ROWS);
  const [nodeSpacing, setNodeSpacing] = useState(DEFAULT_NODE_SPACING);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 24, y: 24 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [isTopToolbarOpen, setIsTopToolbarOpen] = useState(true);
  const [pendingPlacementTableId, setPendingPlacementTableId] = useState<string | null>(null);
  const [isTrimmingGrid, setIsTrimmingGrid] = useState(false);
  const [layoutLockHolderName, setLayoutLockHolderName] = useState<string | null>(null);
  const [areaEditOpen, setAreaEditOpen] = useState(false);
  const [areaEditBranchId, setAreaEditBranchId] = useState("");
  const [areaEditName, setAreaEditName] = useState("");
  const [areaEditCapacity, setAreaEditCapacity] = useState(30);
  const [areaEditSaving, setAreaEditSaving] = useState(false);
  const [areaDeleteOpen, setAreaDeleteOpen] = useState(false);
  const [areaDeleteLoading, setAreaDeleteLoading] = useState(false);
  const [editLayout, setEditLayout] = useState<FloorEditLayout | null>(null);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [registerTable, setRegisterTable] = useState<DiningTable | null>(null);
  /** Giữ chỗ = future slot (show datetime); Vào bàn ngay = now (hide datetime) */
  const [registerArrivalMode, setRegisterArrivalMode] = useState<"hold" | "immediate">(
    "immediate"
  );
  const [registerCustomerName, setRegisterCustomerName] = useState("");
  const [registerCustomerPhone, setRegisterCustomerPhone] = useState("");
  const [registerGuestCount, setRegisterGuestCount] = useState<number>(4);
  const [registerBookingDate, setRegisterBookingDate] = useState<string | null>(
    dayjs().format("YYYY-MM-DD")
  );
  const [registerBookingTime, setRegisterBookingTime] = useState<string>(
    dayjs().format("HH:mm")
  );
  const [registerNote, setRegisterNote] = useState("");
  const [registerSaving, setRegisterSaving] = useState(false);
  const [detailTable, setDetailTable] = useState<DiningTable | null>(null);
  const [detailBookingActionLoading, setDetailBookingActionLoading] = useState(false);
  /** Status menu uses portal — block canvas interaction while open */
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  const blockCanvasForOverlay = Boolean(registerTable || detailTable) || statusMenuOpen;
  const isEditMode = mode === "edit";
  const editBlockedByOther = Boolean(layoutLockHolderName);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<PanState | null>(null);
  const placementTapRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const paletteGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    tableId: string;
  } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    centerX: number;
    centerY: number;
    scale: number;
  } | null>(null);
  const gridSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const areaIdRef = useRef<string | null>(null);
  const modeRef = useRef<CanvasMode>("view");
  const fitCanvasToViewportRef = useRef<() => void>(() => {});
  const prevModeForViewportFitRef = useRef<CanvasMode>("view");
  const prevAreaIdForViewportFitRef = useRef<string | null>(null);
  const resyncEditLayoutAfterSaveRef = useRef(false);
  const prevAreaIdForLayoutRef = useRef<string | null>(null);
  const prevModeForLayoutRef = useRef<CanvasMode>("view");

  const availableAreas = useMemo(
    () => state.areas.filter((area) => filteredBranchIds.includes(area.branchId)),
    [filteredBranchIds, state.areas]
  );

  const branchSelectData = useMemo(
    () =>
      state.branches
        .filter((b) => filteredBranchIds.includes(b.id))
        .map((b) => ({ value: b.id, label: b.name })),
    [filteredBranchIds, state.branches]
  );

  const areaId = activeAreaId ?? availableAreas[0]?.id ?? null;

  const selectedAreaTableCount = useMemo(() => {
    if (!areaId) {
      return 0;
    }
    return state.tables.filter((t) => t.areaId === areaId).length;
  }, [areaId, state.tables]);

  const selectedAreaBookingCount = useMemo(() => {
    if (!areaId) {
      return 0;
    }
    return state.bookings.filter((b) => b.areaId === areaId).length;
  }, [areaId, state.bookings]);

  const activeBookingForDetailTable = useMemo(() => {
    if (!detailTable) {
      return null;
    }
    const candidates = state.bookings
      .filter((b) => b.tableId === detailTable.id && b.status !== "cancelled")
      .sort((a, b) => dayjs(b.bookingAt).valueOf() - dayjs(a.bookingAt).valueOf());
    return candidates[0] ?? null;
  }, [detailTable, state.bookings]);

  const activeBookingCustomerName = useMemo(() => {
    if (!activeBookingForDetailTable) {
      return "";
    }
    const customer = state.customers.find((c) => c.id === activeBookingForDetailTable.customerId);
    return customer?.fullName ?? "";
  }, [activeBookingForDetailTable, state.customers]);

  const closeDetailModal = () => {
    setDetailTable(null);
  };

  const handleDetailCheckIn = async () => {
    if (!activeBookingForDetailTable) {
      return;
    }
    if (activeBookingForDetailTable.status !== "confirmed") {
      return;
    }
    setDetailBookingActionLoading(true);
    try {
      await checkInBooking(activeBookingForDetailTable.id);
      closeDetailModal();
    } finally {
      setDetailBookingActionLoading(false);
    }
  };

  const handleDetailCancelOrComplete = async () => {
    if (!activeBookingForDetailTable) {
      return;
    }
    if (activeBookingForDetailTable.status === "cancelled") {
      return;
    }
    setDetailBookingActionLoading(true);
    try {
      // For "Vào bàn ngay" bookings, we treat "Hoàn thành" as the final step:
      // remove the booking from the active flow by setting it to cancelled.
      await updateBookingStatus(activeBookingForDetailTable.id, "cancelled");
      closeDetailModal();
    } finally {
      setDetailBookingActionLoading(false);
    }
  };

  useEffect(() => {
    if (activeAreaId && !availableAreas.some((a) => a.id === activeAreaId)) {
      setActiveAreaId(availableAreas[0]?.id ?? null);
    }
  }, [activeAreaId, availableAreas]);

  useEffect(() => {
    setAreaEditOpen(false);
    setAreaDeleteOpen(false);
  }, [areaId]);

  areaIdRef.current = areaId;
  modeRef.current = mode;

  useEffect(() => {
    if (!areaId || isLoading || mode !== "view") {
      return;
    }
    const area = state.areas.find((a) => a.id === areaId);
    if (!area) {
      return;
    }
    setGridColumns(area.floorGridColumns ?? DEFAULT_GRID_COLUMNS);
    setGridRows(area.floorGridRows ?? DEFAULT_GRID_ROWS);
    setNodeSpacing(area.floorNodeSpacing ?? DEFAULT_NODE_SPACING);
    // Resync view grid when area/mode/loading changes; avoid re-drafting on every snapshot.
  }, [areaId, isLoading, mode, state.areas]);

  useEffect(() => {
    setFloorLayoutRealtimeReloadBlocked(mode === "edit");
    return () => setFloorLayoutRealtimeReloadBlocked(false);
  }, [mode]);

  useEffect(() => {
    if (
      mode === "edit" &&
      prevAreaIdForLayoutRef.current &&
      prevAreaIdForLayoutRef.current !== areaId
    ) {
      const oldArea = prevAreaIdForLayoutRef.current;
      setMode("view");
      setEditLayout(null);
      void releaseFloorLayoutEditLock(oldArea);
      notifications.show({
        color: "blue",
        message: "Đã thoát chỉnh sửa khi chuyển khu vực.",
      });
      prevAreaIdForLayoutRef.current = areaId;
      prevModeForLayoutRef.current = "view";
      return;
    }

    prevAreaIdForLayoutRef.current = areaId;

    if (mode !== "edit" || !areaId) {
      if (mode !== "edit") {
        setEditLayout(null);
      }
      prevModeForLayoutRef.current = mode;
      return;
    }

    const enteredEdit = prevModeForLayoutRef.current !== "edit";
    prevModeForLayoutRef.current = mode;

    if (!enteredEdit) {
      return;
    }

    const area = state.areas.find((a) => a.id === areaId);
    const positions: Record<string, { x: number; y: number }> = {};
    for (const t of state.tables.filter((x) => x.areaId === areaId)) {
      positions[t.id] = { x: t.positionX, y: t.positionY };
    }
    setEditLayout({
      gridColumns: area?.floorGridColumns ?? DEFAULT_GRID_COLUMNS,
      gridRows: area?.floorGridRows ?? DEFAULT_GRID_ROWS,
      nodeSpacing: area?.floorNodeSpacing ?? DEFAULT_NODE_SPACING,
      positions,
    });
    // Draft snapshot only when entering edit; remote updates handled after save.
  }, [mode, areaId, state.areas, state.tables, releaseFloorLayoutEditLock]);

  useEffect(() => {
    if (!resyncEditLayoutAfterSaveRef.current || mode !== "edit" || !areaId) {
      return;
    }
    resyncEditLayoutAfterSaveRef.current = false;
    const area = state.areas.find((a) => a.id === areaId);
    const positions: Record<string, { x: number; y: number }> = {};
    for (const t of state.tables.filter((x) => x.areaId === areaId)) {
      positions[t.id] = { x: t.positionX, y: t.positionY };
    }
    setEditLayout({
      gridColumns: area?.floorGridColumns ?? DEFAULT_GRID_COLUMNS,
      gridRows: area?.floorGridRows ?? DEFAULT_GRID_ROWS,
      nodeSpacing: area?.floorNodeSpacing ?? DEFAULT_NODE_SPACING,
      positions,
    });
  }, [state.tables, state.areas, mode, areaId]);

  useEffect(() => {
    if (!areaId || isLoading || isEditMode) {
      return;
    }
    if (gridSaveTimerRef.current) {
      clearTimeout(gridSaveTimerRef.current);
    }
    gridSaveTimerRef.current = setTimeout(() => {
      void saveAreaFloorGrid(areaId, gridColumns, gridRows, nodeSpacing);
    }, 650);
    return () => {
      if (gridSaveTimerRef.current) {
        clearTimeout(gridSaveTimerRef.current);
      }
    };
  }, [areaId, gridColumns, gridRows, nodeSpacing, isLoading, saveAreaFloorGrid, isEditMode]);

  useEffect(() => {
    if (!areaId || !hasSupabase) {
      setLayoutLockHolderName(null);
      return;
    }
    const poll = async () => {
      const info = await getFloorLayoutEditLockInfo(areaId);
      if (!info || !currentUser) {
        setLayoutLockHolderName(null);
        return;
      }
      if (info.userId !== currentUser.id) {
        setLayoutLockHolderName(info.fullName);
        setMode((m) => {
          if (m === "edit") {
            notifications.show({
              color: "orange",
              message: `${info.fullName} đang chỉnh sửa sơ đồ. Chế độ của bạn chuyển sang xem.`,
            });
            return "view";
          }
          return m;
        });
      } else {
        setLayoutLockHolderName(null);
      }
    };
    void poll();
    const id = setInterval(() => void poll(), 4000);
    return () => clearInterval(id);
  }, [areaId, hasSupabase, currentUser, getFloorLayoutEditLockInfo]);

  useEffect(() => {
    if (!areaId || mode !== "edit" || !hasSupabase) {
      return;
    }
    const id = setInterval(() => {
      void renewFloorLayoutEditLock(areaId);
    }, 45_000);
    return () => clearInterval(id);
  }, [areaId, mode, hasSupabase, renewFloorLayoutEditLock]);

  useEffect(() => {
    return () => {
      if (modeRef.current === "edit" && areaId) {
        void releaseFloorLayoutEditLock(areaId);
      }
    };
  }, [areaId, releaseFloorLayoutEditLock]);

  const tablesInArea = useMemo(
    () => state.tables.filter((table) => table.areaId === areaId),
    [areaId, state.tables]
  );

  const layoutTablesInArea = useMemo(() => {
    if (!isEditMode || !editLayout) {
      return tablesInArea;
    }
    return tablesInArea.map((t) => {
      const p = editLayout.positions[t.id];
      if (!p) {
        return t;
      }
      return { ...t, positionX: p.x, positionY: p.y };
    });
  }, [isEditMode, editLayout, tablesInArea]);

  const effectiveGridColumns =
    isEditMode && editLayout ? editLayout.gridColumns : gridColumns;
  const effectiveGridRows = isEditMode && editLayout ? editLayout.gridRows : gridRows;
  const effectiveNodeSpacing = isEditMode && editLayout ? editLayout.nodeSpacing : nodeSpacing;

  const isLayoutDirty = useMemo(() => {
    if (!isEditMode || !editLayout || !areaId) {
      return false;
    }
    const area = state.areas.find((a) => a.id === areaId);
    if (!area) {
      return false;
    }
    if (
      editLayout.gridColumns !== (area.floorGridColumns ?? DEFAULT_GRID_COLUMNS) ||
      editLayout.gridRows !== (area.floorGridRows ?? DEFAULT_GRID_ROWS) ||
      editLayout.nodeSpacing !== (area.floorNodeSpacing ?? DEFAULT_NODE_SPACING)
    ) {
      return true;
    }
    for (const t of tablesInArea) {
      const p = editLayout.positions[t.id];
      if (!p || p.x !== t.positionX || p.y !== t.positionY) {
        return true;
      }
    }
    return false;
  }, [isEditMode, editLayout, areaId, state.areas, tablesInArea]);

  const visibleTables = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return layoutTablesInArea.filter((table) => {
      const hitKeyword = !keyword || table.name.toLowerCase().includes(keyword);
      const hitStatus = statusFilter === "all" || table.status === statusFilter;
      return hitKeyword && hitStatus;
    });
  }, [search, statusFilter, layoutTablesInArea]);

  const tableMap = useMemo(
    () => Object.fromEntries(visibleTables.map((table) => [table.id, table])),
    [visibleTables]
  );
  const placedTables = useMemo(
    () =>
      visibleTables.filter((table) =>
        isTableInGrid(table, effectiveGridColumns, effectiveGridRows)
      ),
    [effectiveGridColumns, effectiveGridRows, visibleTables]
  );
  const paletteTables = useMemo(
    () =>
      visibleTables
        .filter((table) => !isTableInGrid(table, effectiveGridColumns, effectiveGridRows))
        .sort((first, second) => first.name.localeCompare(second.name, "vi")),
    [effectiveGridColumns, effectiveGridRows, visibleTables]
  );

  const basePositionMap = useMemo(() => {
    const grouped = new Map<string, DiningTable[]>();
    for (const table of placedTables) {
      const mapped = getTableGridPosition(table, effectiveGridColumns, effectiveGridRows);
      const key = `${mapped.row}-${mapped.col}`;
      const current = grouped.get(key) ?? [];
      current.push(table);
      grouped.set(key, current);
    }
    return grouped;
  }, [effectiveGridColumns, effectiveGridRows, placedTables]);

  const tableByNode = useMemo(() => {
    const grouped = new Map<string, DiningTable[]>();
    for (const [key, tables] of basePositionMap.entries()) {
      grouped.set(key, [...tables]);
    }
    if (dragState) {
      for (const [key, tables] of grouped.entries()) {
        grouped.set(
          key,
          tables.filter((table) => table.id !== dragState.tableId)
        );
      }
      const previewKey = `${dragState.row}-${dragState.col}`;
      const targetTables = grouped.get(previewKey) ?? [];
      const movingTable = tableMap[dragState.tableId];
      if (movingTable) {
        grouped.set(previewKey, [...targetTables, movingTable]);
      }
    }
    return grouped;
  }, [basePositionMap, dragState, tableMap]);

  const commitDrop = (tableId: string, row: number, col: number) => {
    const source = tableMap[tableId];
    if (!source || !editLayout) {
      setDragState(null);
      return;
    }
    const current = getTableGridPosition(source, effectiveGridColumns, effectiveGridRows);
    if (current.row === row && current.col === col) {
      setDragState(null);
      return;
    }
    setEditLayout((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        positions: { ...prev.positions, [source.id]: { x: col, y: row } },
      };
    });
    setDragState(null);
  };

  const commitPlacement = (tableId: string, row: number, col: number) => {
    const source = state.tables.find((t) => t.id === tableId);
    if (!source || !editLayout) {
      return;
    }
    const current = getTableGridPosition(source, effectiveGridColumns, effectiveGridRows);
    if (
      isTableInGrid(source, effectiveGridColumns, effectiveGridRows) &&
      current.row === row &&
      current.col === col
    ) {
      return;
    }
    setEditLayout((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        positions: { ...prev.positions, [tableId]: { x: col, y: row } },
      };
    });
  };

  const removeTableToStorage = (table: DiningTable) => {
    if (!editLayout) {
      return;
    }
    setEditLayout((prev) => {
      if (!prev) {
        return prev;
      }
      return {
        ...prev,
        positions: {
          ...prev.positions,
          [table.id]: { x: STORAGE_OFF_GRID, y: STORAGE_OFF_GRID },
        },
      };
    });
  };

  const handleSaveFloorLayout = async () => {
    if (!areaId || !editLayout || !isLayoutDirty) {
      return;
    }
    setIsSavingLayout(true);
    try {
      const tablePositions = tablesInArea.map((t) => {
        const p = editLayout.positions[t.id];
        return {
          tableId: t.id,
          x: p?.x ?? t.positionX,
          y: p?.y ?? t.positionY,
        };
      });
      await saveFloorLayout(areaId, {
        floorGridColumns: editLayout.gridColumns,
        floorGridRows: editLayout.gridRows,
        floorNodeSpacing: editLayout.nodeSpacing,
        tablePositions,
      });
      resyncEditLayoutAfterSaveRef.current = true;
      notifications.show({ color: "green", message: "Đã lưu sơ đồ xuống máy chủ." });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không thể lưu sơ đồ.",
      });
    } finally {
      setIsSavingLayout(false);
    }
  };

  const handleStatusChange = async (table: DiningTable, next: TableStatus) => {
    if (table.status === next) {
      return;
    }
    try {
      await updateTableStatus(table.id, next);
      notifications.show({
        color: "green",
        message: `Đã đổi trạng thái ${table.name} thành ${tableStatusLabel[next]}.`,
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không thể cập nhật trạng thái.",
      });
    }
  };

  const closeRegistrationPanel = useCallback(() => {
    setRegisterTable(null);
    setRegisterCustomerName("");
    setRegisterCustomerPhone("");
    setRegisterGuestCount(4);
    setRegisterBookingDate(dayjs().format("YYYY-MM-DD"));
    setRegisterBookingTime(dayjs().format("HH:mm"));
    setRegisterNote("");
    setRegisterArrivalMode("immediate");
  }, []);

  const openRegistrationForTable = (table: DiningTable) => {
    panStateRef.current = null;
    placementTapRef.current = null;
    setDetailTable(null);
    setRegisterTable(table);
    setRegisterGuestCount(Math.max(1, table.seats || 1));
    setRegisterBookingDate(dayjs().format("YYYY-MM-DD"));
    setRegisterBookingTime(dayjs().format("HH:mm"));
    setRegisterNote("");
    setRegisterCustomerName("");
    setRegisterCustomerPhone("");
    setRegisterArrivalMode("immediate");
  };

  const handleViewOrRegisterForTable = (table: DiningTable) => {
    if (table.status === "available") {
      if (registerTable?.id === table.id) {
        closeRegistrationPanel();
        return;
      }
      openRegistrationForTable(table);
      return;
    }
    setRegisterTable(null);
    setDetailTable(table);
  };

  const handleRegisterCustomer = async () => {
    if (!registerTable || !registerCustomerName.trim() || !registerCustomerPhone.trim()) {
      notifications.show({
        color: "red",
        message: "Vui lòng nhập tên khách và số điện thoại.",
      });
      return;
    }
    const nextGuestCount = Math.max(1, Number(registerGuestCount || 1));
    if (registerTable.seats > 0 && nextGuestCount > registerTable.seats) {
      notifications.show({
        color: "red",
        message: `Số khách không được vượt quá sức chứa bàn (${registerTable.seats} ghế).`,
      });
      return;
    }
    if (registerArrivalMode === "hold" && (!registerBookingDate || !registerBookingTime)) {
      notifications.show({
        color: "red",
        message: "Vui lòng chọn ngày và giờ đến khi chọn Giữ chỗ.",
      });
      return;
    }
    let bookingAtIso: string;
    if (registerArrivalMode === "immediate") {
      bookingAtIso = dayjs().toISOString();
    } else {
      const [hour, minute] = registerBookingTime.split(":").map((value) => Number(value) || 0);
      const now = dayjs();
      let bookingAt = dayjs(registerBookingDate!, "YYYY-MM-DD")
        .hour(hour)
        .minute(minute)
        .second(0)
        .millisecond(0);

      // If the user picked "Giữ chỗ" within the current minute, the seconds=0
      // timestamp may fall slightly in the past (and would be marked as "Đã ngồi").
      // So: if it is the same minute, bump by 1 second; otherwise require a future time.
      if (!bookingAt.isAfter(now)) {
        if (bookingAt.isSame(now, "minute")) {
          bookingAt = now.add(1, "second");
        } else {
          notifications.show({
            color: "red",
            message: "Giữ chỗ cần thời gian đến sau thời điểm hiện tại.",
          });
          return;
        }
      }

      bookingAtIso = bookingAt.toISOString();
    }
    setRegisterSaving(true);
    try {
      const result = await createBooking({
        customerName: registerCustomerName.trim(),
        customerPhone: registerCustomerPhone.trim(),
        branchId: registerTable.branchId,
        areaId: registerTable.areaId,
        tableId: registerTable.id,
        guestCount: nextGuestCount,
        bookingAt: bookingAtIso,
        note: registerNote.trim() || undefined,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        closeRegistrationPanel();
      }
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không thể tạo booking.",
      });
    } finally {
      setRegisterSaving(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPendingPlacementTableId(null);
        closeRegistrationPanel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeRegistrationPanel]);

  const gridNodes = useMemo(
    () =>
      Array.from({ length: effectiveGridRows * effectiveGridColumns }, (_, index) => ({
        row: Math.floor(index / effectiveGridColumns),
        col: index % effectiveGridColumns,
      })),
    [effectiveGridColumns, effectiveGridRows]
  );

  const canvasWidth =
    CANVAS_PADDING * 2 + Math.max(0, effectiveGridColumns - 1) * effectiveNodeSpacing;
  const canvasHeight =
    CANVAS_PADDING * 2 + Math.max(0, effectiveGridRows - 1) * effectiveNodeSpacing;

  const fitCanvasToViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    if (vw <= 0 || vh <= 0) {
      return;
    }

    let contentW = canvasWidth;
    let contentH = canvasHeight;
    let centerX = canvasWidth / 2;
    let centerY = canvasHeight / 2;

    const tableBounds = getPlacedTableBounds(
      placedTables,
      effectiveGridColumns,
      effectiveGridRows,
      effectiveNodeSpacing
    );
    if (tableBounds) {
      const minX = tableBounds.minX - FIT_TABLE_BOUNDS_PADDING;
      const minY = tableBounds.minY - FIT_TABLE_BOUNDS_PADDING;
      const maxX = tableBounds.maxX + FIT_TABLE_BOUNDS_PADDING;
      const maxY = tableBounds.maxY + FIT_TABLE_BOUNDS_PADDING;
      const bw = maxX - minX;
      const bh = maxY - minY;
      if (bw > 0 && bh > 0) {
        contentW = bw;
        contentH = bh;
        centerX = (minX + maxX) / 2;
        centerY = (minY + maxY) / 2;
      }
    }

    const scaleX = (vw * FIT_VIEWPORT_MARGIN) / contentW;
    const scaleY = (vh * FIT_VIEWPORT_MARGIN) / contentH;
    const nextScale = clamp(Math.min(scaleX, scaleY), MIN_SCALE, MAX_SCALE);
    setScale(nextScale);
    setOffset({
      x: vw / 2 - centerX * nextScale,
      y: vh / 2 - centerY * nextScale,
    });
  }, [
    canvasHeight,
    canvasWidth,
    effectiveGridColumns,
    effectiveGridRows,
    effectiveNodeSpacing,
    placedTables,
  ]);

  useEffect(() => {
    fitCanvasToViewportRef.current = fitCanvasToViewport;
  }, [fitCanvasToViewport]);

  const trimRedundantGrid = useCallback(() => {
    if (!editLayout) {
      return;
    }
    const placed = layoutTablesInArea.filter((table) =>
      isTableInGrid(table, effectiveGridColumns, effectiveGridRows)
    );
    if (placed.length === 0) {
      notifications.show({
        color: "yellow",
        message: "Không có bàn trên lưới để thu gọn.",
      });
      return;
    }
    let minC = Infinity;
    let maxC = -Infinity;
    let minR = Infinity;
    let maxR = -Infinity;
    for (const table of placed) {
      minC = Math.min(minC, table.positionX);
      maxC = Math.max(maxC, table.positionX);
      minR = Math.min(minR, table.positionY);
      maxR = Math.max(maxR, table.positionY);
    }
    const spanC = maxC - minC + 1;
    const spanR = maxR - minR + 1;
    const newCols = clamp(Math.max(spanC, 4), 4, 24);
    const newRows = clamp(Math.max(spanR, 4), 4, 18);
    const alreadyTight =
      newCols === effectiveGridColumns &&
      newRows === effectiveGridRows &&
      minC === 0 &&
      minR === 0;
    if (alreadyTight) {
      notifications.show({
        color: "blue",
        message: "Lưới đã khớp phạm vi bàn — không còn hàng/cột thừa.",
      });
      return;
    }
    setIsTrimmingGrid(true);
    try {
      setEditLayout((prev) => {
        if (!prev) {
          return prev;
        }
        const nextPositions = { ...prev.positions };
        for (const table of placed) {
          const p = nextPositions[table.id];
          if (p) {
            nextPositions[table.id] = { x: p.x - minC, y: p.y - minR };
          }
        }
        return {
          ...prev,
          gridColumns: newCols,
          gridRows: newRows,
          positions: nextPositions,
        };
      });
      notifications.show({
        color: "green",
        message: `Đã thu lưới còn ${newCols} × ${newRows} (căn bàn về góc trên-trái). Chọn Lưu để ghi xuống máy chủ.`,
      });
    } finally {
      setIsTrimmingGrid(false);
    }
  }, [editLayout, layoutTablesInArea, effectiveGridColumns, effectiveGridRows]);

  const openAreaMetadataEdit = useCallback(() => {
    if (!areaId) {
      return;
    }
    const area = state.areas.find((a) => a.id === areaId);
    if (!area) {
      return;
    }
    setAreaEditBranchId(area.branchId);
    setAreaEditName(area.name);
    setAreaEditCapacity(area.capacity);
    setAreaEditOpen(true);
  }, [areaId, state.areas]);

  const handleSaveAreaMetadata = async () => {
    if (!areaId || !areaEditName.trim() || !areaEditBranchId) {
      notifications.show({ color: "red", message: "Vui lòng nhập đầy đủ thông tin." });
      return;
    }
    setAreaEditSaving(true);
    try {
      const result = await updateArea(areaId, {
        branchId: areaEditBranchId,
        name: areaEditName.trim(),
        capacity: areaEditCapacity,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setAreaEditOpen(false);
      }
    } finally {
      setAreaEditSaving(false);
    }
  };

  const handleConfirmDeleteArea = async () => {
    if (!areaId) {
      return;
    }
    setAreaDeleteLoading(true);
    try {
      const result = await deleteArea(areaId);
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setAreaDeleteOpen(false);
        setMode("view");
        setPendingPlacementTableId(null);
        setDragState(null);
        setIsToolsPanelOpen(false);
        setIsSearchPanelOpen(false);
        setActiveAreaId(null);
      }
    } finally {
      setAreaDeleteLoading(false);
    }
  };

  useLayoutEffect(() => {
    const prevMode = prevModeForViewportFitRef.current;
    const prevAreaId = prevAreaIdForViewportFitRef.current;

    // Only auto-fit when the user intentionally changes the view context.
    // This prevents unexpected zoom/jump when the app re-fetches/auto-updates data.
    const shouldFit =
      // first mount or area change
      (areaId && prevAreaId !== areaId) ||
      // entering view mode from edit mode
      (mode === "view" && prevMode === "edit");

    if (shouldFit) {
      fitCanvasToViewportRef.current();
    }

    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const observer = new ResizeObserver(() => {
      fitCanvasToViewportRef.current();
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [areaId, mode]); // do not depend on fitCanvasToViewport (would re-fit on every status refresh)

  // Remember last view context so we don't auto-fit on background data refresh.
  useLayoutEffect(() => {
    prevAreaIdForViewportFitRef.current = areaId;
    prevModeForViewportFitRef.current = mode;
  }, [areaId, mode]);

  const toWorldCoordinate = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return { x: 0, y: 0 };
    }
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale,
    };
  };

  const nearestNode = (x: number, y: number) => {
    const col = clamp(
      Math.round((x - CANVAS_PADDING) / effectiveNodeSpacing),
      0,
      effectiveGridColumns - 1
    );
    const row = clamp(
      Math.round((y - CANVAS_PADDING) / effectiveNodeSpacing),
      0,
      effectiveGridRows - 1
    );
    return { row, col };
  };

  const zoomAt = (nextScale: number, anchorX: number, anchorY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const safeScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const worldX = (anchorX - rect.left - offset.x) / scale;
    const worldY = (anchorY - rect.top - offset.y) / scale;
    setScale(safeScale);
    setOffset({
      x: anchorX - rect.left - worldX * safeScale,
      y: anchorY - rect.top - worldY * safeScale,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditMode && blockCanvasForOverlay) {
      return;
    }
    const placementTap = placementTapRef.current;
    if (placementTap && event.pointerId === placementTap.pointerId) {
      const dist = Math.hypot(
        event.clientX - placementTap.startX,
        event.clientY - placementTap.startY
      );
      if (dist > TAP_PLACE_THRESHOLD_PX) {
        setPendingPlacementTableId(null);
        panStateRef.current = {
          pointerId: event.pointerId,
          startX: placementTap.startX,
          startY: placementTap.startY,
          originX: placementTap.originX,
          originY: placementTap.originY,
        };
        placementTapRef.current = null;
        setOffset({
          x: placementTap.originX + (event.clientX - placementTap.startX),
          y: placementTap.originY + (event.clientY - placementTap.startY),
        });
      }
      return;
    }

    if (dragState && event.pointerId === dragState.pointerId) {
      const world = toWorldCoordinate(event.clientX, event.clientY);
      const snapped = nearestNode(world.x, world.y);
      if (snapped.row !== dragState.row || snapped.col !== dragState.col) {
        setDragState((prev) =>
          prev ? { ...prev, row: snapped.row, col: snapped.col } : prev
        );
      }
      return;
    }
    const panState = panStateRef.current;
    if (panState && event.pointerId === panState.pointerId) {
      setOffset({
        x: panState.originX + (event.clientX - panState.startX),
        y: panState.originY + (event.clientY - panState.startY),
      });
    }
  };

  const handleViewportPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (viewport?.hasPointerCapture?.(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    const placementTap = placementTapRef.current;
    if (placementTap && event.pointerId === placementTap.pointerId) {
      placementTapRef.current = null;
      const dist = Math.hypot(
        event.clientX - placementTap.startX,
        event.clientY - placementTap.startY
      );
      if (
        dist <= TAP_PLACE_THRESHOLD_PX &&
        pendingPlacementTableId &&
        isEditMode
      ) {
        const world = toWorldCoordinate(event.clientX, event.clientY);
        const snapped = nearestNode(world.x, world.y);
        void commitPlacement(pendingPlacementTableId, snapped.row, snapped.col);
        setPendingPlacementTableId(null);
      }
      return;
    }

    if (isEditMode && dragState && event.pointerId === dragState.pointerId) {
      void commitDrop(dragState.tableId, dragState.row, dragState.col);
      return;
    }
    if (panStateRef.current && event.pointerId === panStateRef.current.pointerId) {
      panStateRef.current = null;
    }
  };

  const handleViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditMode && blockCanvasForOverlay) {
      return;
    }
    if (isTableBlockTarget(event.target)) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    if (isEditMode && pendingPlacementTableId) {
      placementTapRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: offset.x,
        originY: offset.y,
      };
      viewport.setPointerCapture(event.pointerId);
      return;
    }

    viewport.setPointerCapture(event.pointerId);
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handleViewportLostPointerCapture = () => {
    panStateRef.current = null;
    placementTapRef.current = null;
    paletteGestureRef.current = null;
    setDragState(null);
  };

  const handleTablePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    table: DiningTable
  ) => {
    if (!isEditMode) {
      return;
    }
    if ((event.target as HTMLElement).closest("[data-table-remove]")) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const base = getTableGridPosition(table, effectiveGridColumns, effectiveGridRows);
    viewport.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      tableId: table.id,
      row: clamp(base.row, 0, effectiveGridRows - 1),
      col: clamp(base.col, 0, effectiveGridColumns - 1),
    });
  };

  const handlePalettePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    table: DiningTable
  ) => {
    if (!isEditMode || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    paletteGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      tableId: table.id,
    };
  };

  const handlePalettePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
    table: DiningTable
  ) => {
    const gesture = paletteGestureRef.current;
    if (
      !gesture ||
      gesture.tableId !== table.id ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }
    const dist = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (dist <= PALETTE_DRAG_THRESHOLD_PX) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    paletteGestureRef.current = null;
    viewport.setPointerCapture(event.pointerId);
    const centerWorldX = (viewport.clientWidth / 2 - offset.x) / scale;
    const centerWorldY = (viewport.clientHeight / 2 - offset.y) / scale;
    const centerNode = nearestNode(centerWorldX, centerWorldY);
    setDragState({
      pointerId: event.pointerId,
      tableId: table.id,
      row: centerNode.row,
      col: centerNode.col,
    });
  };

  const handlePalettePointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
    table: DiningTable
  ) => {
    const gesture = paletteGestureRef.current;
    if (
      !gesture ||
      gesture.tableId !== table.id ||
      gesture.pointerId !== event.pointerId
    ) {
      return;
    }
    paletteGestureRef.current = null;
    const dist = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (dist <= PALETTE_DRAG_THRESHOLD_PX) {
      setPendingPlacementTableId((current) => {
        if (current === table.id) {
          notifications.show({ color: "blue", message: "Đã bỏ chọn đặt bàn." });
          return null;
        }
        notifications.show({
          color: "blue",
          message: "Chạm vào ô trên sơ đồ để đặt bàn (hoặc kéo từ kho như trước).",
        });
        return table.id;
      });
    }
  };

  const handlePalettePointerCancel = (
    event: React.PointerEvent<HTMLDivElement>,
    table: DiningTable
  ) => {
    const gesture = paletteGestureRef.current;
    if (
      gesture &&
      gesture.tableId === table.id &&
      gesture.pointerId === event.pointerId
    ) {
      paletteGestureRef.current = null;
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!isEditMode && blockCanvasForOverlay) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    zoomAt(scale + delta, event.clientX, event.clientY);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!isEditMode && blockCanvasForOverlay) {
      return;
    }
    if (event.touches.length !== 2) {
      pinchRef.current = null;
      return;
    }
    event.preventDefault();
    const [first, second] = Array.from(event.touches);
    const dx = second.clientX - first.clientX;
    const dy = second.clientY - first.clientY;
    const distance = Math.hypot(dx, dy);
    const centerX = (first.clientX + second.clientX) / 2;
    const centerY = (first.clientY + second.clientY) / 2;
    if (!pinchRef.current) {
      pinchRef.current = { distance, centerX, centerY, scale };
      return;
    }
    const factor = distance - pinchRef.current.distance;
    zoomAt(pinchRef.current.scale + factor * TOUCH_PINCH_FACTOR, centerX, centerY);
  };

  return (
    <Stack
      className={classes.pageRoot}
      style={
        reserveManagerDock
          ? ({ ["--manager-dock-reserve" as string]: "58px" } as CSSProperties)
          : undefined
      }
    >
      <Group justify="space-between" align="end" wrap="wrap">
        <div style={{ minWidth: 0 }}>
          <PortalPageTitle order={isCompact ? 3 : 2}>Sơ đồ nhà hàng</PortalPageTitle>
          <Text c="dimmed" size={isCompact ? "xs" : "sm"}>
            {isEditMode
              ? "Chỉnh sơ đồ trên lưới, rồi bấm Lưu sơ đồ để ghi xuống máy chủ — người khác sẽ thấy ngay sau khi lưu. Cuộn/chụm để zoom."
              : "Chạm bàn để đổi trạng thái. Kéo nền để xem sơ đồ, cuộn/chụm để zoom."}
          </Text>
        </div>
        {isEditMode ? (
          <Group gap="xs">
            <Badge variant="light">
              Node Grid {effectiveGridColumns} × {effectiveGridRows}
            </Badge>
            {isLayoutDirty ? (
              <Badge color="orange" variant="light">
                Chưa lưu
              </Badge>
            ) : null}
          </Group>
        ) : null}
      </Group>

      {layoutLockHolderName ? (
        <Alert color="orange" variant="light" title="Sơ đồ đang được chỉnh sửa">
          <strong>{layoutLockHolderName}</strong> đang ở chế độ chỉnh sửa bố cục. Bạn chỉ có thể xem; nút Edit tạm khóa cho đến khi họ xong.
        </Alert>
      ) : null}

      {!hasSupabase ? (
        <Alert color="gray" variant="light">
          Chưa kết nối Supabase — kích thước lưới chỉ lưu trên máy bạn (mock). Kết nối database để đồng bộ sơ đồ cho mọi người.
        </Alert>
      ) : null}

      <PortalSectionCard>
        <div
          className={`${classes.canvasFrame} ${pendingPlacementTableId ? classes.canvasFramePendingPlacement : ""
            }`}
        >
          <div
            ref={viewportRef}
            className={classes.canvasViewport}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handleViewportPointerUp}
            onPointerCancel={handleViewportPointerUp}
            onLostPointerCapture={handleViewportLostPointerCapture}
            onWheel={handleWheel}
            onTouchMove={handleTouchMove}
          >
            <div
              className={classes.canvasContent}
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            >
              <svg className={classes.gridSvg} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
                {gridNodes.map((node) => {
                  const x = CANVAS_PADDING + node.col * effectiveNodeSpacing;
                  const y = CANVAS_PADDING + node.row * effectiveNodeSpacing;
                  return (
                    <circle
                      key={`${node.row}-${node.col}`}
                      className={classes.gridNode}
                      cx={x}
                      cy={y}
                      r={6}
                    />
                  );
                })}
              </svg>
              {gridNodes.map((node) => {
                const key = `${node.row}-${node.col}`;
                const tables = tableByNode.get(key) ?? [];
                const x = CANVAS_PADDING + node.col * effectiveNodeSpacing;
                const y = CANVAS_PADDING + node.row * effectiveNodeSpacing;
                return tables.map((table, stackIndex) => {
                  const stackKey = `${table.id}-${node.row}-${node.col}-${stackIndex}`;
                  const style = {
                    left: x - 56 + stackIndex * 8,
                    top: y - 28 + stackIndex * 8,
                  };
                  if (!isEditMode) {
                    return (
                      <div
                        key={stackKey}
                        className={classes.tableFloorAnchor}
                        style={style}
                      >
                        <div
                          data-table-block="true"
                          data-table-status={table.status}
                          className={`${classes.tableBlock} ${classes.tableBlockView} ${TABLE_STATUS_SURFACE_CLASS[table.status]} ${dragState?.tableId === table.id ? classes.tableBlockDragging : ""
                            }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleViewOrRegisterForTable(table);
                          }}
                        >
                          <Menu
                            withinPortal
                            position="bottom-end"
                            closeOnItemClick
                            onOpen={() => {
                              panStateRef.current = null;
                              placementTapRef.current = null;
                              setStatusMenuOpen(true);
                            }}
                            onClose={() => setStatusMenuOpen(false)}
                          >
                            <Menu.Target>
                              <ActionIcon
                                type="button"
                                variant="subtle"
                                color="gray"
                                size="sm"
                                className={classes.tableBlockStatusMenuBtn}
                                aria-label="Đổi trạng thái"
                                data-table-status-menu=""
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreVertical size={14} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                                  {(["available", "hold", "occupied", "locked"] as TableStatus[]).map(
                                (nextStatus) => (
                                  <Menu.Item
                                    key={nextStatus}
                                    disabled={table.status === nextStatus}
                                    onClick={() => void handleStatusChange(table, nextStatus)}
                                  >
                                    {tableStatusLabel[nextStatus]}
                                  </Menu.Item>
                                )
                              )}
                            </Menu.Dropdown>
                          </Menu>
                          <Text fw={600} size="sm" lineClamp={1}>
                            {table.name}
                          </Text>
                          <Text size="xs">{table.seats} ghế</Text>
                          <Badge
                            color={tableStatusColor[table.status]}
                            variant="light"
                            size="xs"
                          >
                            {tableStatusLabel[table.status]}
                          </Badge>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={stackKey}
                      data-table-block="true"
                      data-table-status={table.status}
                      className={`${classes.tableBlock} ${TABLE_STATUS_SURFACE_CLASS[table.status]} ${dragState?.tableId === table.id ? classes.tableBlockDragging : ""
                        }`}
                      style={style}
                      onPointerDown={(event) => handleTablePointerDown(event, table)}
                    >
                      <ActionIcon
                        type="button"
                        variant="subtle"
                        color="gray"
                        size="sm"
                        className={classes.tableBlockRemove}
                        data-table-remove="true"
                        aria-label={`Chuyển ${table.name} vào kho`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeTableToStorage(table);
                        }}
                      >
                        <X size={14} />
                      </ActionIcon>
                      <Text fw={600} size="sm" lineClamp={1}>
                        {table.name}
                      </Text>
                      <Text size="xs">{table.seats} ghế</Text>
                      <Badge color={tableStatusColor[table.status]} variant="light" size="xs">
                        {tableStatusLabel[table.status]}
                      </Badge>
                    </div>
                  );
                });
              })}
            </div>
          </div>
          <div className={classes.canvasOverlay}>
            {isTopToolbarOpen ? (
              <div className={classes.canvasTopToolbar}>
                <div className={classes.toolbarPopoverAnchor}>
                  <ActionIcon
                    variant={isSearchPanelOpen ? "filled" : "light"}
                    size="lg"
                    aria-label="Search filters"
                    onClick={() => {
                      setIsSearchPanelOpen((value) => !value);
                      setIsToolsPanelOpen(false);
                    }}
                  >
                    <Search size={16} />
                  </ActionIcon>
                  <div
                    className={`${classes.canvasPopoverPanel} ${isSearchPanelOpen ? classes.canvasPopoverPanelOpen : ""
                      } ${classes.toolbarPopoverLeft}`}
                    aria-hidden={!isSearchPanelOpen}
                  >
                    <Stack gap="sm">
                      <TextInput
                        label="Tìm bàn"
                        placeholder="Theo tên bàn"
                        value={search}
                        onChange={(event) => setSearch(event.currentTarget.value)}
                      />
                      <Select
                        label="Lọc trạng thái"
                        value={statusFilter}
                        onChange={(value) => setStatusFilter(value ?? "all")}
                        data={[
                          { value: "all", label: "Tất cả trạng thái" },
                          ...(["available", "hold", "occupied", "locked"] as TableStatus[]).map(
                            (status) => ({
                              value: status,
                              label: tableStatusLabel[status],
                            })
                          ),
                        ]}
                      />
                    </Stack>
                  </div>
                </div>

                {isEditMode ? (
                  <div className={classes.toolbarPopoverAnchor}>
                    <ActionIcon
                      variant={isToolsPanelOpen ? "filled" : "light"}
                      size="lg"
                      aria-label="Grid tools"
                      onClick={() => {
                        setIsToolsPanelOpen((value) => !value);
                        setIsSearchPanelOpen(false);
                      }}
                    >
                      <Wrench size={16} />
                    </ActionIcon>
                    <div
                      className={`${classes.canvasPopoverPanel} ${isToolsPanelOpen ? classes.canvasPopoverPanelOpen : ""
                        } ${classes.toolbarPopoverLeft}`}
                      aria-hidden={!isToolsPanelOpen}
                    >
                      <Stack gap="sm">
                        <Group align="end" gap="xs" wrap="nowrap">
                          <NumberInput
                            label="Cột"
                            value={editLayout?.gridColumns ?? gridColumns}
                            onChange={(value) =>
                              setEditLayout((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      gridColumns: clamp(
                                        Number(value) || DEFAULT_GRID_COLUMNS,
                                        4,
                                        24
                                      ),
                                    }
                                  : prev
                              )
                            }
                            min={4}
                            max={24}
                            clampBehavior="strict"
                            style={{ flex: 1 }}
                            disabled={!editLayout}
                          />
                          <NumberInput
                            label="Hàng"
                            value={editLayout?.gridRows ?? gridRows}
                            onChange={(value) =>
                              setEditLayout((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      gridRows: clamp(Number(value) || DEFAULT_GRID_ROWS, 4, 18),
                                    }
                                  : prev
                              )
                            }
                            min={4}
                            max={18}
                            clampBehavior="strict"
                            style={{ flex: 1 }}
                            disabled={!editLayout}
                          />
                        </Group>
                        <NumberInput
                          label="Khoảng cách node"
                          value={editLayout?.nodeSpacing ?? nodeSpacing}
                          onChange={(value) =>
                            setEditLayout((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    nodeSpacing: clamp(
                                      Number(value) || DEFAULT_NODE_SPACING,
                                      64,
                                      160
                                    ),
                                  }
                                : prev
                            )
                          }
                          min={64}
                          max={160}
                          step={4}
                          clampBehavior="strict"
                          disabled={!editLayout}
                        />
                        <Button
                          variant="light"
                          size="xs"
                          leftSection={<Minimize2 size={14} />}
                          loading={isTrimmingGrid}
                          onClick={() => trimRedundantGrid()}
                          disabled={!editLayout}
                        >
                          Thu gọn lưới thừa
                        </Button>
                        <ActionIcon
                          variant="light"
                          size="lg"
                          onClick={fitCanvasToViewport}
                          aria-label="Reset view"
                        >
                          <RotateCcw size={16} />
                        </ActionIcon>
                      </Stack>
                    </div>
                  </div>
                ) : null}

                {isEditMode ? (
                  <Button
                    size="sm"
                    leftSection={<Save size={16} />}
                    loading={isSavingLayout}
                    disabled={!editLayout || !isLayoutDirty}
                    onClick={() => void handleSaveFloorLayout()}
                  >
                    Lưu sơ đồ
                  </Button>
                ) : null}

                <SegmentedControl
                  value={mode}
                  onChange={(value) => {
                    const nextMode = value as CanvasMode;
                    if (nextMode === "edit") {
                      if (editBlockedByOther) {
                        notifications.show({
                          color: "yellow",
                          message: `${layoutLockHolderName ?? "Người khác"} đang chỉnh sửa sơ đồ. Chỉ xem được.`,
                        });
                        return;
                      }
                      if (!areaId) {
                        return;
                      }
                      void (async () => {
                        const acquired = await acquireFloorLayoutEditLock(areaId);
                        if (!acquired.ok) {
                          notifications.show({
                            color: "yellow",
                            message: `${acquired.holderFullName} đang chỉnh sửa sơ đồ. Thử lại sau.`,
                          });
                          return;
                        }
                        setMode("edit");
                        setPendingPlacementTableId(null);
                      })();
                      return;
                    }
                    if (mode === "edit" && isLayoutDirty) {
                      if (
                        typeof window !== "undefined" &&
                        !window.confirm("Bỏ các thay đổi sơ đồ chưa lưu?")
                      ) {
                        return;
                      }
                    }
                    setMode("view");
                    setPendingPlacementTableId(null);
                    setIsToolsPanelOpen(false);
                    setIsSearchPanelOpen(false);
                    setDragState(null);
                    if (areaId) {
                      void releaseFloorLayoutEditLock(areaId);
                    }
                  }}
                  data={[
                    { label: "View", value: "view" },
                    {
                      label: "Edit",
                      value: "edit",
                      disabled: editBlockedByOther,
                    },
                  ]}
                  className={classes.toolbarModeControl}
                />

                <div className={classes.toolbarAreaRow}>
                  <Select
                    label="Khu vực"
                    value={areaId}
                    onChange={setActiveAreaId}
                    data={availableAreas.map((area) => ({
                      value: area.id,
                      label: `${area.name} - ${state.branches.find((branch) => branch.id === area.branchId)?.name}`,
                    }))}
                    searchable
                    className={classes.toolbarAreaSelect}
                  />
                  <Group gap={4} className={classes.toolbarAreaActions} wrap="nowrap">
                    <ActionIcon
                      variant="light"
                      size="lg"
                      aria-label="Sửa khu vực"
                      disabled={!areaId || !hasSupabase}
                      onClick={openAreaMetadataEdit}
                    >
                      <Pencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="light"
                      color="red"
                      size="lg"
                      aria-label="Xóa khu vực"
                      disabled={!areaId || !hasSupabase}
                      onClick={() => setAreaDeleteOpen(true)}
                    >
                      <Trash2 size={16} />
                    </ActionIcon>
                  </Group>
                </div>
                <ActionIcon
                  variant="light"
                  size="lg"
                  className={classes.topToolbarCollapseBtn}
                  onClick={() => {
                    setIsTopToolbarOpen(false);
                    setIsSearchPanelOpen(false);
                    setIsToolsPanelOpen(false);
                  }}
                  aria-label="Ẩn thanh công cụ"
                >
                  <ChevronUp size={16} />
                </ActionIcon>
              </div>
            ) : (
              <div className={classes.topToolbarToggleDock}>
                <ActionIcon
                  variant="filled"
                  size="lg"
                  onClick={() => setIsTopToolbarOpen(true)}
                  aria-label="Hiện thanh công cụ"
                >
                  <ChevronDown size={16} />
                </ActionIcon>
              </div>
            )}

            <div
              className={`${classes.canvasZoomDock} ${isEditMode && isPaletteOpen ? classes.canvasZoomDockRaised : ""
                }`}
            >
              <ActionIcon
                variant="light"
                size="lg"
                onClick={() => setScale((current) => clamp(current - SCALE_STEP, MIN_SCALE, MAX_SCALE))}
                aria-label="Zoom out"
              >
                <Minus size={16} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                size="lg"
                onClick={() => setScale((current) => clamp(current + SCALE_STEP, MIN_SCALE, MAX_SCALE))}
                aria-label="Zoom in"
              >
                <Plus size={16} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                size="lg"
                onClick={fitCanvasToViewport}
                aria-label="Center view"
              >
                <Crosshair size={16} />
              </ActionIcon>
              <Text size="xs" c="dimmed" ta="center">
                {Math.round(scale * 100)}%
              </Text>
            </div>
            {isEditMode ? (
              isPaletteOpen ? (
                <div className={classes.tablePalette}>
                  <Stack gap={8}>
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Text size="sm" fw={600}>
                        Bàn khả dụng
                      </Text>
                      <ActionIcon
                        variant="light"
                        size="sm"
                        onClick={() => setIsPaletteOpen(false)}
                        aria-label="Ẩn kho bàn"
                      >
                        <ChevronDown size={14} />
                      </ActionIcon>
                    </Group>
                    <div className={classes.tablePaletteList}>
                      {paletteTables.length === 0 ? (
                        <Text size="sm" c="dimmed">
                          Trống - tất cả bàn đã có trên lưới.
                        </Text>
                      ) : (
                        paletteTables.map((table) => (
                          <div
                            key={`palette-${table.id}`}
                            data-table-status={table.status}
                            className={`${classes.paletteTableBlock} ${TABLE_STATUS_SURFACE_CLASS[table.status]} ${pendingPlacementTableId === table.id
                              ? classes.paletteTableBlockPending
                              : ""
                              }`}
                            onPointerDown={(event) => handlePalettePointerDown(event, table)}
                            onPointerMove={(event) => handlePalettePointerMove(event, table)}
                            onPointerUp={(event) => handlePalettePointerUp(event, table)}
                            onPointerCancel={(event) => handlePalettePointerCancel(event, table)}
                          >
                            <Text size="sm" fw={600} lineClamp={1}>
                              {table.name}
                            </Text>
                            <Group justify="space-between" gap={6}>
                              <Badge
                                color={tableStatusColor[table.status]}
                                variant="light"
                                size="xs"
                              >
                                {tableStatusLabel[table.status]}
                              </Badge>
                              <Text size="xs">{table.seats} ghế</Text>
                            </Group>
                          </div>
                        ))
                      )}
                    </div>
                  </Stack>
                </div>
              ) : (
                <div className={classes.tablePaletteToggleDock}>
                  <ActionIcon
                    variant="filled"
                    size="lg"
                    onClick={() => setIsPaletteOpen(true)}
                    aria-label="Hiện kho bàn"
                  >
                    <ChevronUp size={16} />
                  </ActionIcon>
                </div>
              )
            ) : null}
          </div>
        </div>
      </PortalSectionCard>

      <Modal
        opened={Boolean(registerTable)}
        onClose={closeRegistrationPanel}
        title={registerTable ? `Đăng ký - ${registerTable.name}` : "Đăng ký"}
        size="sm"
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
      >
        {registerTable ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {registerTable.seats} ghế · {tableStatusLabel[registerTable.status]}
            </Text>
            <Radio.Group
              label="Đặt bàn"
              value={registerArrivalMode}
              onChange={(value) =>
                setRegisterArrivalMode(value === "hold" ? "hold" : "immediate")
              }
            >
              <Stack gap={6} mt={4}>
                <Radio value="hold" label="Giữ chỗ" />
                <Radio value="immediate" label="Vào bàn ngay" />
              </Stack>
            </Radio.Group>
            {registerArrivalMode === "hold" ? (
              <Group grow align="end">
                <DatePickerInput
                  label="Ngày đến"
                  value={registerBookingDate}
                  onChange={setRegisterBookingDate}
                  valueFormat="YYYY-MM-DD"
                />
                <TimeInput
                  label="Giờ đến"
                  value={registerBookingTime}
                  onChange={(event) => setRegisterBookingTime(event.currentTarget.value)}
                  withSeconds={false}
                />
              </Group>
            ) : null}
            <TextInput
              label="Tên khách"
              placeholder="Họ và tên"
              value={registerCustomerName}
              onChange={(event) => setRegisterCustomerName(event.currentTarget.value)}
            />
            <TextInput
              label="Số điện thoại"
              placeholder="09..."
              inputMode="tel"
              value={registerCustomerPhone}
              onChange={(event) => setRegisterCustomerPhone(event.currentTarget.value)}
            />
            <NumberInput
              label="Số khách"
              value={registerGuestCount}
              onChange={(value) => setRegisterGuestCount(Number(value || 1))}
              min={1}
              max={registerTable.seats || undefined}
            />
            <Textarea
              label="Ghi chú"
              placeholder="Tùy chọn"
              value={registerNote}
              onChange={(event) => setRegisterNote(event.currentTarget.value)}
              autosize
              minRows={2}
            />
            <Group justify="flex-end" gap={8}>
              <Button variant="default" onClick={closeRegistrationPanel}>
                Hủy
              </Button>
              <Button
                loading={registerSaving}
                disabled={!hasSupabase || isLoading}
                onClick={() => void handleRegisterCustomer()}
              >
                Tạo booking
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Modal>

      <Modal
        opened={Boolean(detailTable)}
        onClose={closeDetailModal}
        title={detailTable ? `Thông tin booking - ${detailTable.name}` : "Thông tin booking"}
        size="sm"
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
      >
        {detailTable && activeBookingForDetailTable ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              {detailTable.seats} ghế · {tableStatusLabel[detailTable.status]}
            </Text>
            <Text fw={600} size="sm">
              Khách: {activeBookingCustomerName || "—"}
            </Text>
            <Text size="sm">
              Giờ đến:{" "}
              {dayjs(activeBookingForDetailTable.bookingAt).format("HH:mm DD/MM/YYYY")}
            </Text>
            <Text size="sm">Số khách: {activeBookingForDetailTable.guestCount}</Text>
            {activeBookingForDetailTable.note ? (
              <Text size="sm" c="dimmed">
                Ghi chú: {activeBookingForDetailTable.note}
              </Text>
            ) : null}
            <Badge
              color={bookingStatusColor[activeBookingForDetailTable.status]}
              variant="light"
              w="fit-content"
            >
              {bookingStatusLabel[activeBookingForDetailTable.status]}
            </Badge>
            <Group justify="flex-end" gap="xs" mt="xs">
              {detailTable.status !== "occupied" ? (
                <Button
                  size="xs"
                  variant="light"
                  color="green"
                  disabled={activeBookingForDetailTable.status !== "confirmed"}
                  loading={detailBookingActionLoading}
                  onClick={() => void handleDetailCheckIn()}
                >
                  Check-in
                </Button>
              ) : null}
              <Button
                size="xs"
                variant={activeBookingForDetailTable.status === "checked_in" ? "filled" : "light"}
                color={
                  activeBookingForDetailTable.status === "checked_in" ? "green" : "red"
                }
                disabled={activeBookingForDetailTable.status === "cancelled"}
                loading={detailBookingActionLoading}
                onClick={() => void handleDetailCancelOrComplete()}
              >
                {activeBookingForDetailTable.status === "checked_in"
                  ? "Hoàn thành"
                  : "Hủy booking"}
              </Button>
            </Group>
          </Stack>
        ) : detailTable ? (
          <Text size="sm" c="dimmed">
            Chưa tìm thấy booking nào đang hoạt động cho bàn này.
          </Text>
        ) : null}
      </Modal>

      <Modal
        opened={areaEditOpen}
        onClose={() => setAreaEditOpen(false)}
        title="Sửa khu vực"
        size="md"
      >
        <Stack gap="sm">
          <Select
            label="Chi nhánh"
            value={areaEditBranchId}
            onChange={(value) => setAreaEditBranchId(value ?? "")}
            data={branchSelectData}
          />
          <TextInput
            label="Tên khu vực"
            value={areaEditName}
            onChange={(event) => setAreaEditName(event.currentTarget.value)}
          />
          <NumberInput
            label="Sức chứa"
            value={areaEditCapacity}
            onChange={(value) => setAreaEditCapacity(Number(value || 1))}
            min={1}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setAreaEditOpen(false)}>
              Hủy
            </Button>
            <Button loading={areaEditSaving} onClick={() => void handleSaveAreaMetadata()}>
              Lưu
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={areaDeleteOpen}
        onClose={() => setAreaDeleteOpen(false)}
        title="Xóa khu vực"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Xóa khu vực này? Chỉ xóa được khi không còn bàn và không còn đặt bàn (hiện:{" "}
            {selectedAreaTableCount} bàn, {selectedAreaBookingCount} đặt bàn).
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAreaDeleteOpen(false)}>
              Hủy
            </Button>
            <Button color="red" loading={areaDeleteLoading} onClick={() => void handleConfirmDeleteArea()}>
              Xóa
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
