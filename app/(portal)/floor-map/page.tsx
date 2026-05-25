"use client";

import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Divider,
  Flex,
  Group,
  Menu,
  Loader,
  Modal,
  MultiSelect,
  Radio,
  Select,
  SegmentedControl,
  Stack,
  Tabs,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from "@mantine/core";
import { DatePickerInput, TimeInput } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
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
import { GuestCountNumberInput } from "@/components/booking-management/guest-count-number-input";
import { EditableNumberInput } from "@/components/editable-number-input";
import { confirmDuplicateBookingSecond } from "@/components/booking-duplicate-confirm";
import {
  BookingCalendarPanel,
  type BookingCalendarPanelHandle,
} from "@/components/booking-calendar-panel";
import { CreateBookingModal } from "@/components/booking-management/create-booking-modal";
import { FloorTableBlockView } from "@/components/floor-map/floor-table-block-view";
import { RegisterPendingAssignTable } from "@/components/floor-map/register-pending-assign-table";
import { TableBlockDetailModal } from "@/components/floor-map/table-block-detail-modal";
import { VoiceBookingAssistant } from "@/components/voice-booking/VoiceBookingAssistant";
import { DUPLICATE_BOOKING_CODE } from "@/lib/booking-duplicate";
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
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { useAppContext } from "@/contexts/app-context";
import { bookingRowBusyStyle } from "@/lib/busy-row-style";
import { useBusyId } from "@/lib/use-busy-id";
import { usePortalCompact } from "@/lib/use-portal-compact";
import {
  clampFloorNodeSpacing,
  FLOOR_DEFAULT_NODE_SPACING_PX,
  FLOOR_NODE_SPACING_MAX_PX,
  FLOOR_NODE_SPACING_MIN_PX,
  FLOOR_TABLE_BLOCK_HEIGHT_PX,
  FLOOR_TABLE_BLOCK_WIDTH_PX,
  FLOOR_TABLE_PALETTE_SENTINEL,
  FLOOR_TABLE_STACK_OFFSET_PX,
} from "@/lib/floor-map-layout";
import {
  findMergeStripAnchorForMemberCells,
  findMergeStripAnchorForPlug,
  getMergeGroupStripCells,
  getMergeMemberPositionsAtAnchor,
  packMergeGroupTablePositions,
} from "@/lib/floor-map-merge-layout";
import { setFloorLayoutRealtimeReloadBlocked } from "@/lib/floor-layout-sync";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import {
  BOOKING_GUEST_TYPE_OPTIONS,
  displayCustomerPhone,
  findAssignableSlotConflictsAtTable,
  formatTableSlotConflictMessage,
  getAssignableCandidateTables,
  pickNonOverlappingBookingsForMergeGroup,
  pickNonOverlappingBookingsForTable,
  deriveMergeGroupStatusFromDayBookings,
  deriveTableStatusFromDayBookings,
  hasAssignableSlotConflictAtMergeGroup,
  mergeGroupHasBookingOnDay,
  mergeGroupPrimaryGuestHasArrived,
  pickPrimaryBookingOnMergeGroup,
  pickPrimaryBookingOnTable,
} from "@/lib/booking-meta";
import {
  formatTableGuestCapacityHint,
  getMergeGroupEffectiveGuestCapacity,
  getTableEffectiveGuestCapacity,
  tableFitsGuestCount,
} from "@/lib/table-capacity";
import {
  confirmWaitlistOfferInSupabase,
  getTableBlockStateInSupabase,
} from "@/lib/supabase-store";
import {
  type Booking,
  type Customer,
  type DiningTable,
  type TableBlockState,
  type TableMergeGroup,
  type TableStatus,
} from "@/lib/types";
import classes from "./page.module.css";

/** Reserved band above member table tops — must match mergeBBoxes yMin math. */
const MERGE_GROUP_HEADER_BASE_HEIGHT_PX = 28;
const MERGE_GROUP_HEADER_BOOKED_HEIGHT_PX = 54;
const MERGE_GROUP_HEADER_TABLE_GAP_PX = 6;
/** Calibrated offsets for merge-group dashed box (preview: top +44px, height −84px). */
const MERGE_GROUP_BBOX_TOP_OFFSET_PX = 44;
const MERGE_GROUP_BBOX_HEIGHT_ADJUST_PX = -84;

const MERGE_GROUP_STATUS_SURFACE_CLASS: Record<TableStatus, string> = {
  available: classes.statusSurface_available,
  hold: classes.statusSurface_hold,
  occupied: classes.statusSurface_occupied,
  locked: classes.statusSurface_locked,
};

function TableBlockBookingPeek(props: {
  tableId: string;
  bookings: readonly Booking[];
  customers: readonly Customer[];
  /** Palette blocks are tighter; omit top margin under the badge. */
  compact?: boolean;
}) {
  const displayBooking = pickPrimaryBookingOnTable(props.tableId, props.bookings);
  if (!displayBooking) {
    return null;
  }
  const cust = props.customers.find((item) => item.id === displayBooking.customerId);
  return (
    <Stack gap={2} mt={props.compact ? 0 : 4} style={{ pointerEvents: "none" }}>
      <Text size="xs" fw={600} lineClamp={2} lh={1.25}>
        {cust?.fullName ?? "—"}
      </Text>
      <Text size="xs" c="dimmed" lineClamp={1}>
        Đặt {dayjs(displayBooking.bookingAt).format("HH:mm · DD/MM")}
      </Text>
      {(displayBooking.status === "checked_in" ||
        displayBooking.status === "seated") &&
      displayBooking.checkedInAt ? (
        <Text size="xs" c="dimmed" lineClamp={1}>
          Check-in {dayjs(displayBooking.checkedInAt).format("HH:mm · DD/MM")}
        </Text>
      ) : null}
    </Stack>
  );
}

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
const CANVAS_PADDING = 64;
const TOUCH_PINCH_FACTOR = 0.005;
/** Inset the fitted region slightly inside the viewport so edges are not flush with the frame. */
const FIT_VIEWPORT_MARGIN = 0.94;
/** World-space padding around the union of table blocks when fitting (px). */
const FIT_TABLE_BOUNDS_PADDING = 40;
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
  const halfW = FLOOR_TABLE_BLOCK_WIDTH_PX / 2;
  const halfH = FLOOR_TABLE_BLOCK_HEIGHT_PX / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [, tablesAtNode] of grouped) {
    const stackMax = tablesAtNode.length - 1;
    const { row, col } = getTableGridPosition(tablesAtNode[0]!, gridColumns, gridRows);
    const gx = CANVAS_PADDING + col * nodeSpacing;
    const gy = CANVAS_PADDING + row * nodeSpacing;
    for (let k = 0; k <= stackMax; k++) {
      const cx = gx + k * FLOOR_TABLE_STACK_OFFSET_PX;
      const cy = gy + k * FLOOR_TABLE_STACK_OFFSET_PX;
      minX = Math.min(minX, cx - halfW);
      maxX = Math.max(maxX, cx + halfW);
      minY = Math.min(minY, cy - halfH);
      maxY = Math.max(maxY, cy + halfH);
    }
  }
  return { minX, minY, maxX, maxY };
}

type DragState = {
  pointerId: number;
  tableId: string;
  row: number;
  col: number;
};

type MergeGroupDragState = {
  pointerId: number;
  groupId: string;
  anchorRow: number;
  anchorCol: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type CanvasMode = "view" | "edit";

type FloorEditMergeAdd = { groupId: string; tableId: string };
type FloorEditMergeRemove = { groupId: string; tableId: string };

type FloorEditLayout = {
  gridColumns: number;
  gridRows: number;
  nodeSpacing: number;
  positions: Record<string, { x: number; y: number }>;
  /** Merge membership changes applied on save (not before). */
  pendingMergeAdds: FloorEditMergeAdd[];
  pendingMergeRemoves: FloorEditMergeRemove[];
};

function applyEditMergeDraft(
  groups: TableMergeGroup[],
  adds: FloorEditMergeAdd[],
  removes: FloorEditMergeRemove[],
  tableById: Record<string, DiningTable>
): TableMergeGroup[] {
  return groups
    .map((group) => {
      let tableIds = [...group.tableIds];
      for (const remove of removes) {
        if (remove.groupId === group.id) {
          tableIds = tableIds.filter((id) => id !== remove.tableId);
        }
      }
      for (const add of adds) {
        if (add.groupId === group.id && !tableIds.includes(add.tableId)) {
          tableIds.push(add.tableId);
        }
      }
      const totalCapacity = tableIds.reduce((sum, id) => {
        const table = tableById[id];
        return sum + Math.max(1, table?.seats ?? 1);
      }, 0);
      return { ...group, tableIds, totalCapacity };
    })
    .filter((group) => group.tableIds.length > 0);
}

function buildAreaTablesForMergePack(
  tables: DiningTable[],
  positions: Record<string, { x: number; y: number }>
): Array<Pick<DiningTable, "id" | "positionX" | "positionY">> {
  return tables.map((table) => {
    const p = positions[table.id];
    return {
      id: table.id,
      positionX: p?.x ?? table.positionX,
      positionY: p?.y ?? table.positionY,
    };
  });
}

function mergeMemberIdsForEdit(
  group: TableMergeGroup,
  adds: FloorEditMergeAdd[],
  removes: FloorEditMergeRemove[]
): string[] {
  let tableIds = [...group.tableIds];
  for (const remove of removes) {
    if (remove.groupId === group.id) {
      tableIds = tableIds.filter((id) => id !== remove.tableId);
    }
  }
  for (const add of adds) {
    if (add.groupId === group.id && !tableIds.includes(add.tableId)) {
      tableIds.push(add.tableId);
    }
  }
  return tableIds;
}

function applyMergePackToEditLayout(
  layout: FloorEditLayout,
  memberTableIds: string[],
  tablesInArea: DiningTable[],
  preferredAnchor?: { row: number; col: number }
): FloorEditLayout {
  if (memberTableIds.length === 0) {
    return layout;
  }
  const pack = packMergeGroupTablePositions({
    memberTableIds,
    areaTables: buildAreaTablesForMergePack(tablesInArea, layout.positions),
    gridColumns: layout.gridColumns,
    gridRows: layout.gridRows,
    preferredAnchor,
  });
  if (!pack) {
    return layout;
  }
  const nextPositions = { ...layout.positions };
  for (const [tableId, pos] of pack.positionUpdates) {
    nextPositions[tableId] = { x: pos.col, y: pos.row };
  }
  return {
    ...layout,
    positions: nextPositions,
    gridRows: Math.max(layout.gridRows, pack.gridRows),
  };
}

export default function FloorMapPage() {
  const {
    state,
    filteredBranchIds,
    updateTableStatus,
    createBooking,
    assignBookingToTable,
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
    reload,
    createTableMergeGroup,
    addTableToMergeGroup,
    removeTableFromMergeGroup,
    releaseTableMergeGroup,
  } = useAppContext();
  const router = useRouter();
  const isCompact = usePortalCompact();
  const reserveManagerDock =
    (currentUser?.role === "manager" || currentUser?.role === "employee") && isCompact;
  const isEmployee = currentUser?.role === "employee";
  const isBranchManager = currentUser?.role === "manager";
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("view");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [gridColumns, setGridColumns] = useState(DEFAULT_GRID_COLUMNS);
  const [gridRows, setGridRows] = useState(DEFAULT_GRID_ROWS);
  const [nodeSpacing, setNodeSpacing] = useState(FLOOR_DEFAULT_NODE_SPACING_PX);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 24, y: 24 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [mergeGroupDragState, setMergeGroupDragState] = useState<MergeGroupDragState | null>(
    null
  );
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
  const [registerGuestType, setRegisterGuestType] = useState<string | null>("Khách thường");
  const [registerPendingSelected, setRegisterPendingSelected] = useState<Booking[]>([]);
  const [registerModalTab, setRegisterModalTab] = useState<"book" | "assign">("book");
  const [registerSaving, setRegisterSaving] = useState(false);
  const { isBusy: isTableStatusBusy, run: runTableStatusAction } = useBusyId();
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  /** Modal multi-select of tables to merge (view-mode "Gộp bàn" flow). */
  const [mergeSelectedTableIds, setMergeSelectedTableIds] = useState<string[]>([]);
  const [mergeSaving, setMergeSaving] = useState(false);
  /** Edit-mode shift-click selection: a set of table ids highlighted for the "Gộp đã chọn" toolbar action. */
  const [editSelectedTableIds, setEditSelectedTableIds] = useState<string[]>([]);
  /** Bbox detail panel: when set, shows members + active bookings + release control for a merge group. */
  const [openedMergeGroupId, setOpenedMergeGroupId] = useState<string | null>(null);
  const [releaseMergeGroupId, setReleaseMergeGroupId] = useState<string | null>(null);
  const [detailTable, setDetailTable] = useState<DiningTable | null>(null);
  const [detailMergeGroup, setDetailMergeGroup] = useState<TableMergeGroup | null>(null);
  const [registerMergeGroup, setRegisterMergeGroup] = useState<TableMergeGroup | null>(null);
  const [detailTableBlockState, setDetailTableBlockState] = useState<TableBlockState | null>(
    null
  );
  const [detailTableBlockLoading, setDetailTableBlockLoading] = useState(false);
  const [detailWaitlistActionId, setDetailWaitlistActionId] = useState<string | null>(null);
  const [detailBookingActionLoading, setDetailBookingActionLoading] = useState(false);
  /** Status menu uses portal — block canvas interaction while open */
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [floorMapSelectedDate, setFloorMapSelectedDate] = useState(() => dayjs());
  const [createBookingModalOpened, setCreateBookingModalOpened] = useState(false);

  const blockCanvasForOverlay =
    Boolean(registerTable || registerMergeGroup || detailTable || detailMergeGroup) ||
    statusMenuOpen;
  const isEditMode = mode === "edit";
  const editBlockedByOther = Boolean(layoutLockHolderName);

  // #region agent log
  const inRenderPhaseRef = useRef(false);
  inRenderPhaseRef.current = true;
  useLayoutEffect(() => {
    inRenderPhaseRef.current = false;
  });
  // #endregion

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const calendarPanelRef = useRef<BookingCalendarPanelHandle | null>(null);
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

  /** Stable order so the default/fallback area does not jump when snapshot polling refreshes. */
  const availableAreas = useMemo(
    () =>
      [...state.areas.filter((area) => filteredBranchIds.includes(area.branchId))].sort(
        (a, b) => a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id)
      ),
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
  const activeArea = useMemo(
    () => (areaId ? state.areas.find((area) => area.id === areaId) ?? null : null),
    [areaId, state.areas]
  );
  const activeAreaBranchId = activeArea?.branchId ?? null;

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

  const floorMapDayBookings = useMemo(
    () =>
      state.bookings.filter(
        (booking) =>
          filteredBranchIds.includes(booking.branchId) &&
          dayjs(booking.bookingAt).isSame(floorMapSelectedDate, "day")
      ),
    [filteredBranchIds, floorMapSelectedDate, state.bookings]
  );

  const bookingsForFloorTableDisplay = isEmployee ? state.bookings : floorMapDayBookings;

  const activeBookingForDetail = useMemo((): Booking | null => {
    if (detailMergeGroup) {
      return pickPrimaryBookingOnMergeGroup(
        detailMergeGroup.id,
        bookingsForFloorTableDisplay
      );
    }
    if (!detailTable) {
      return null;
    }
    return pickPrimaryBookingOnTable(detailTable.id, bookingsForFloorTableDisplay);
  }, [bookingsForFloorTableDisplay, detailMergeGroup, detailTable]);

  const activeBookingCustomerName = useMemo(() => {
    if (!activeBookingForDetail) {
      return "";
    }
    const customer = state.customers.find((c) => c.id === activeBookingForDetail.customerId);
    return customer?.fullName ?? "";
  }, [activeBookingForDetail, state.customers]);

  const detailMergeGroupStatus = useMemo((): TableStatus => {
    if (!detailMergeGroup) {
      return "available";
    }
    return deriveMergeGroupStatusFromDayBookings(
      detailMergeGroup.id,
      floorMapDayBookings
    );
  }, [detailMergeGroup, floorMapDayBookings]);

  const registerTableBranch = useMemo(() => {
    if (!registerTable) {
      return null;
    }
    const branch = state.branches.find((item) => item.id === registerTable.branchId);
    return branch ? { id: branch.id, name: branch.name } : null;
  }, [registerTable, state.branches]);

  const registerVoiceAreas = useMemo(() => {
    if (!registerTable) {
      return [];
    }
    return state.areas
      .filter(
        (area) =>
          area.branchId === registerTable.branchId && filteredBranchIds.includes(area.branchId)
      )
      .map((area) => ({ id: area.id, name: area.name }));
  }, [filteredBranchIds, registerTable, state.areas]);

  const registerVoiceTables = useMemo(() => {
    if (!registerTable) {
      return [];
    }
    return state.tables
      .filter(
        (table) =>
          table.branchId === registerTable.branchId && filteredBranchIds.includes(table.branchId)
      )
      .map((table) => ({
        id: table.id,
        name: table.name,
        seats: table.seats,
        areaId: table.areaId,
        status: table.status,
      }));
  }, [filteredBranchIds, registerTable, state.tables]);

  const registerBookingCandidate = useMemo((): Booking | null => {
    if (!registerTable) {
      return null;
    }
    let startIso: string | null = null;
    if (registerArrivalMode === "immediate") {
      startIso = dayjs().toISOString();
    } else if (registerBookingDate && registerBookingTime) {
      const [hour, minute] = registerBookingTime.split(":").map((value) => Number(value) || 0);
      startIso = dayjs(registerBookingDate, "YYYY-MM-DD")
        .hour(hour)
        .minute(minute)
        .second(0)
        .millisecond(0)
        .toISOString();
    }
    if (!startIso) {
      return null;
    }
    const endIso = dayjs(startIso)
      .add(state.bookingRuntimeSettings.standardTurnaroundMinutes, "minute")
      .toISOString();
    return {
      id: "__floor_register__",
      customerId: "",
      branchId: registerTable.branchId,
      areaId: registerTable.areaId,
      tableId: registerTable.id,
      guestCount: Math.max(1, Number(registerGuestCount || 1)),
      bookingAt: startIso,
      startTime: startIso,
      endTime: endIso,
      status: registerArrivalMode === "immediate" ? "seated" : "confirmed",
      createdByUserId: "",
    };
  }, [
    registerArrivalMode,
    registerBookingDate,
    registerBookingTime,
    registerGuestCount,
    registerTable,
    state.bookingRuntimeSettings.standardTurnaroundMinutes,
  ]);

  const registerTableSlotConflicts = useMemo(() => {
    if (!registerBookingCandidate?.tableId) {
      return [];
    }
    return findAssignableSlotConflictsAtTable(
      registerBookingCandidate,
      registerBookingCandidate.tableId,
      state.bookings
    );
  }, [registerBookingCandidate, state.bookings]);

  const registerTableConflictMessage = useMemo(() => {
    if (!registerTable || registerTableSlotConflicts.length === 0) {
      return null;
    }
    const conflictCustomer = state.customers.find(
      (item) => item.id === registerTableSlotConflicts[0]?.customerId
    )?.fullName;
    return formatTableSlotConflictMessage(registerTableSlotConflicts, {
      tableName: registerTable.name,
      customerName: conflictCustomer,
    });
  }, [registerTable, registerTableSlotConflicts, state.customers]);

  const registerImmediateBlocked =
    registerTable?.status === "occupied" && registerArrivalMode === "immediate";

  const pendingBookings = useMemo(
    () =>
      state.bookings
        .filter((b) => filteredBranchIds.includes(b.branchId))
        .filter((b) => b.status === "pending")
        .sort((a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()),
    [filteredBranchIds, state.bookings]
  );
  /** Active groups across all areas — used to exclude already-merged tables from new-merge candidates. */
  const allActiveMergedTableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of state.mergeGroups) {
      if (group.status !== "active") {
        continue;
      }
      for (const tableId of group.tableIds) {
        ids.add(tableId);
      }
    }
    return ids;
  }, [state.mergeGroups]);

  const mergeCandidateTables = useMemo(() => {
    if (!areaId) {
      return [];
    }
    return state.tables
      .filter(
        (table) =>
          table.areaId === areaId &&
          table.status !== "locked" &&
          !allActiveMergedTableIds.has(table.id)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [allActiveMergedTableIds, areaId, state.tables]);

  const mergeTableOptions = useMemo(
    () =>
      mergeCandidateTables.map((table) => ({
        value: table.id,
        label: `${table.name} · ${table.seats} ghế`,
      })),
    [mergeCandidateTables]
  );

  /** Active merge groups inside the currently selected area (snapshot-derived, no extra fetch). */
  const mergeGroupsInArea = useMemo<TableMergeGroup[]>(() => {
    if (!areaId || !activeAreaBranchId) {
      return [];
    }
    return state.mergeGroups.filter(
      (group) =>
        group.status === "active" &&
        group.branchId === activeAreaBranchId &&
        group.areaId === areaId
    );
  }, [activeAreaBranchId, areaId, state.mergeGroups]);

  const editMergeGroupsInArea = useMemo<TableMergeGroup[]>(() => {
    if (!isEditMode || !editLayout || !areaId) {
      return mergeGroupsInArea;
    }
    const tableById: Record<string, DiningTable> = {};
    for (const table of state.tables) {
      if (table.areaId === areaId) {
        tableById[table.id] = table;
      }
    }
    return applyEditMergeDraft(
      mergeGroupsInArea,
      editLayout.pendingMergeAdds,
      editLayout.pendingMergeRemoves,
      tableById
    );
  }, [areaId, editLayout, isEditMode, mergeGroupsInArea, state.tables]);

  const effectiveMergeGroups = isEditMode ? editMergeGroupsInArea : mergeGroupsInArea;

  /** All ids of tables currently belonging to an active group in this area — used for bbox layout + edit constraints. */
  const tablesInActiveGroupInArea = useMemo(() => {
    const ids = new Set<string>();
    for (const group of effectiveMergeGroups) {
      for (const tableId of group.tableIds) {
        ids.add(tableId);
      }
    }
    return ids;
  }, [effectiveMergeGroups]);

  /** Quick lookup: tableId → groupId for the active area (used by bbox highlight + commitDrop checks). */
  const tableToMergeGroupId = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of effectiveMergeGroups) {
      for (const tableId of group.tableIds) {
        map.set(tableId, group.id);
      }
    }
    return map;
  }, [effectiveMergeGroups]);

  // Auto-close the bbox detail panel when its group disappears from the snapshot.
  useEffect(() => {
    if (!openedMergeGroupId) {
      return;
    }
    if (!effectiveMergeGroups.some((group) => group.id === openedMergeGroupId)) {
      setOpenedMergeGroupId(null);
    }
  }, [effectiveMergeGroups, openedMergeGroupId]);

  // Reset edit-mode selection when leaving edit mode or switching areas.
  useEffect(() => {
    if (!isEditMode) {
      setEditSelectedTableIds([]);
      setMergeGroupDragState(null);
      setDragState(null);
    }
  }, [isEditMode]);

  // Search/filter is view-only; clear when entering layout edit.
  useEffect(() => {
    if (isEditMode) {
      setSearch("");
      setStatusFilter("all");
      setIsSearchPanelOpen(false);
    }
  }, [isEditMode]);
  useEffect(() => {
    setEditSelectedTableIds([]);
  }, [areaId]);

  const closeDetailModal = () => {
    setDetailTable(null);
    setDetailMergeGroup(null);
    setDetailTableBlockState(null);
    setDetailTableBlockLoading(false);
    setDetailWaitlistActionId(null);
  };

  useEffect(() => {
    const detailTarget = detailMergeGroup
      ? { mergeGroupId: detailMergeGroup.id }
      : detailTable
        ? { tableId: detailTable.id }
        : null;
    if (!detailTarget || !hasSupabase) {
      setDetailTableBlockState(null);
      setDetailTableBlockLoading(false);
      return;
    }

    const primaryBooking = detailMergeGroup
      ? pickPrimaryBookingOnMergeGroup(
          detailMergeGroup.id,
          bookingsForFloorTableDisplay
        )
      : pickPrimaryBookingOnTable(detailTable!.id, bookingsForFloorTableDisplay);
    const slotStart =
      primaryBooking?.startTime ?? primaryBooking?.bookingAt ?? dayjs().toISOString();
    const slotEnd = primaryBooking?.endTime;

    let cancelled = false;
    setDetailTableBlockLoading(true);
    void getTableBlockStateInSupabase({
      ...detailTarget,
      slotStartTime: slotStart,
      slotEndTime: slotEnd,
      waitlistScope: "all",
    })
      .then((blockState) => {
        if (!cancelled) {
          setDetailTableBlockState(blockState);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailTableBlockState(null);
          notifications.show({
            color: "red",
            message:
              error instanceof Error ? error.message : "Không tải được lịch và hàng chờ bàn.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailTableBlockLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookingsForFloorTableDisplay, detailMergeGroup, detailTable, hasSupabase]);

  const handleConfirmWaitlistOffer = async (entryId: string) => {
    if (!hasSupabase || isEmployee) {
      return;
    }
    setDetailWaitlistActionId(entryId);
    try {
      const result = await confirmWaitlistOfferInSupabase(entryId);
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok && (detailTable || detailMergeGroup)) {
        await reload({ scope: "floor" });
        const blockState = await getTableBlockStateInSupabase({
          ...(detailMergeGroup
            ? { mergeGroupId: detailMergeGroup.id }
            : { tableId: detailTable!.id }),
          slotStartTime: detailTableBlockState?.slotStartTime ?? dayjs().toISOString(),
          slotEndTime: detailTableBlockState?.slotEndTime,
          waitlistScope: "all",
        });
        setDetailTableBlockState(blockState);
      }
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không xác nhận được suất hàng chờ.",
      });
    } finally {
      setDetailWaitlistActionId(null);
    }
  };

  const openDetailCancelBookingConfirm = () => {
    const b = activeBookingForDetail;
    if (
      !b ||
      b.status === "cancelled" ||
      b.status === "completed" ||
      b.status === "no_show" ||
      b.status === "seated" ||
      b.status === "checked_in"
    ) {
      return;
    }
    modals.openConfirmModal({
      title: "Xác nhận hủy booking",
      children: (
        <Text size="sm">Hủy booking này trên bàn? Thao tác không hoàn tác.</Text>
      ),
      labels: { cancel: "Quay lại", confirm: "Hủy booking" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        if (!hasSupabase) {
          notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
          return;
        }
        setDetailBookingActionLoading(true);
        try {
          await updateBookingStatus(b.id, "cancelled");
          notifications.show({ color: "green", message: "Đã hủy booking." });
          closeDetailModal();
        } catch (error) {
          notifications.show({
            color: "red",
            message: error instanceof Error ? error.message : "Không hủy được booking.",
          });
        } finally {
          setDetailBookingActionLoading(false);
        }
      },
    });
  };

  const handleDetailCheckIn = async () => {
    if (!activeBookingForDetail) {
      return;
    }
    if (activeBookingForDetail.status !== "confirmed") {
      return;
    }
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    setDetailBookingActionLoading(true);
    try {
      await checkInBooking(activeBookingForDetail.id);
      notifications.show({ color: "green", message: "Đã check-in." });
      closeDetailModal();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Check-in thất bại.",
      });
    } finally {
      setDetailBookingActionLoading(false);
    }
  };

  const handleDetailComplete = async () => {
    if (!activeBookingForDetail) {
      return;
    }
    if (
      activeBookingForDetail.status !== "checked_in" &&
      activeBookingForDetail.status !== "seated"
    ) {
      return;
    }
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    setDetailBookingActionLoading(true);
    try {
      await updateBookingStatus(activeBookingForDetail.id, "completed");
      notifications.show({ color: "green", message: "Đã hoàn thành booking." });
      closeDetailModal();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không hoàn thành được booking.",
      });
    } finally {
      setDetailBookingActionLoading(false);
    }
  };

  /** Keep a concrete area id in state so the location Select does not follow unstable `areas[0]` on each reload. */
  useEffect(() => {
    if (availableAreas.length === 0) {
      setActiveAreaId(null);
      return;
    }
    if (activeAreaId !== null && !availableAreas.some((a) => a.id === activeAreaId)) {
      setActiveAreaId(availableAreas[0]!.id);
      return;
    }
    if (activeAreaId === null) {
      setActiveAreaId(availableAreas[0]!.id);
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
    setNodeSpacing(clampFloorNodeSpacing(area.floorNodeSpacing ?? FLOOR_DEFAULT_NODE_SPACING_PX));
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
      nodeSpacing: clampFloorNodeSpacing(area?.floorNodeSpacing ?? FLOOR_DEFAULT_NODE_SPACING_PX),
      positions,
      pendingMergeAdds: [],
      pendingMergeRemoves: [],
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
      nodeSpacing: clampFloorNodeSpacing(area?.floorNodeSpacing ?? FLOOR_DEFAULT_NODE_SPACING_PX),
      positions,
      pendingMergeAdds: [],
      pendingMergeRemoves: [],
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
    let cancelled = false;
    const realtime = getSupabaseBrowserClient();
    const syncLockInfo = async () => {
      if (cancelled) {
        return;
      }
      let info: Awaited<ReturnType<typeof getFloorLayoutEditLockInfo>>;
      try {
        info = await getFloorLayoutEditLockInfo(areaId);
      } catch {
        return;
      }
      if (!info || !currentUser) {
        setLayoutLockHolderName(null);
        return;
      }
      if (info.userId !== currentUser.id) {
        setLayoutLockHolderName(info.fullName);
        // #region agent log
        fetch("http://127.0.0.1:7775/ingest/6dbf37ec-2333-468e-bf97-62fad053dd9f", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "7f6736",
          },
          body: JSON.stringify({
            sessionId: "7f6736",
            runId: "pre-fix",
            hypothesisId: "A",
            location: "floor-map/page.tsx:syncLockInfo",
            message: "syncLockInfo foreign lock before setMode",
            data: { modeRef: modeRef.current, inRender: inRenderPhaseRef.current },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setMode((m) => {
          if (m === "edit") {
            // #region agent log
            fetch("http://127.0.0.1:7775/ingest/6dbf37ec-2333-468e-bf97-62fad053dd9f", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Debug-Session-Id": "7f6736",
              },
              body: JSON.stringify({
                sessionId: "7f6736",
                runId: "pre-fix",
                hypothesisId: "A",
                location: "floor-map/page.tsx:setMode-updater",
                message: "setMode updater calling notifications.show",
                data: { prevMode: m, inRender: inRenderPhaseRef.current },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
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
    void syncLockInfo();
    const fallbackId = setInterval(() => void syncLockInfo(), 30_000);
    const lockChannel = realtime
      ?.channel(`floor-layout-locks:${areaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "floor_layout_edit_locks",
          filter: `area_id=eq.${areaId}`,
        },
        () => void syncLockInfo()
      )
      .subscribe((status) => {
        if (
          status === "SUBSCRIBED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          void syncLockInfo();
        }
      });
    return () => {
      cancelled = true;
      clearInterval(fallbackId);
      if (realtime && lockChannel) {
        void realtime.removeChannel(lockChannel);
      }
    };
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

  const floorMapDisplayTables = useMemo(() => {
    const tableToMergeGroup = new Map<string, string>();
    for (const group of effectiveMergeGroups) {
      for (const tableId of group.tableIds) {
        tableToMergeGroup.set(tableId, group.id);
      }
    }
    return layoutTablesInArea.map((table) => {
      let status = deriveTableStatusFromDayBookings(table, floorMapDayBookings);
      const mergeGroupId = tableToMergeGroup.get(table.id);
      if (mergeGroupId) {
        const mergeStatus = deriveMergeGroupStatusFromDayBookings(
          mergeGroupId,
          floorMapDayBookings
        );
        if (
          mergeStatus !== "available" &&
          mergeGroupPrimaryGuestHasArrived(mergeGroupId, floorMapDayBookings)
        ) {
          status = mergeStatus;
        }
      }
      return { ...table, status };
    });
  }, [effectiveMergeGroups, floorMapDayBookings, layoutTablesInArea]);

  const tablesForFloorView = isEditMode ? layoutTablesInArea : floorMapDisplayTables;

  const customerById = useMemo(
    () => new Map(state.customers.map((customer) => [customer.id, customer])),
    [state.customers]
  );

  const primaryBookingByTableId = useMemo(() => {
    const map = new Map<string, Booking | null>();
    for (const table of tablesForFloorView) {
      map.set(
        table.id,
        pickPrimaryBookingOnTable(table.id, bookingsForFloorTableDisplay)
      );
    }
    return map;
  }, [bookingsForFloorTableDisplay, tablesForFloorView]);

  const primaryBookingByMergeGroupId = useMemo(() => {
    const map = new Map<string, Booking | null>();
    for (const group of effectiveMergeGroups) {
      map.set(
        group.id,
        pickPrimaryBookingOnMergeGroup(group.id, bookingsForFloorTableDisplay)
      );
    }
    return map;
  }, [bookingsForFloorTableDisplay, effectiveMergeGroups]);

  const mergeGroupStatusById = useMemo(() => {
    const map = new Map<string, TableStatus>();
    for (const group of effectiveMergeGroups) {
      map.set(
        group.id,
        deriveMergeGroupStatusFromDayBookings(group.id, floorMapDayBookings)
      );
    }
    return map;
  }, [floorMapDayBookings, effectiveMergeGroups]);

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
      editLayout.nodeSpacing !==
      clampFloorNodeSpacing(area.floorNodeSpacing ?? FLOOR_DEFAULT_NODE_SPACING_PX)
    ) {
      return true;
    }
    for (const t of tablesInArea) {
      const p = editLayout.positions[t.id];
      if (!p || p.x !== t.positionX || p.y !== t.positionY) {
        return true;
      }
    }
    if (editLayout.pendingMergeAdds.length > 0 || editLayout.pendingMergeRemoves.length > 0) {
      return true;
    }
    return false;
  }, [isEditMode, editLayout, areaId, state.areas, tablesInArea]);

  const visibleTables = useMemo(() => {
    if (isEditMode) {
      return tablesForFloorView;
    }
    const keyword = search.trim().toLowerCase();
    return tablesForFloorView.filter((table) => {
      const displayBooking = primaryBookingByTableId.get(table.id) ?? null;
      const customer = displayBooking
        ? customerById.get(displayBooking.customerId)
        : undefined;
      const haystackParts = [
        table.name,
        String(table.seats),
        customer?.fullName ?? "",
        displayCustomerPhone(customer?.phone),
      ];
      if (displayBooking) {
        haystackParts.push(
          dayjs(displayBooking.bookingAt).format("HH:mm DD/MM/YYYY"),
          dayjs(displayBooking.bookingAt).format("DD/MM/YYYY HH:mm"),
          dayjs(displayBooking.bookingAt).format("HH:mm"),
          "check-in",
          "checkin",
        );
        if (displayBooking.checkedInAt) {
          haystackParts.push(
            dayjs(displayBooking.checkedInAt).format("HH:mm DD/MM/YYYY"),
            dayjs(displayBooking.checkedInAt).format("DD/MM/YYYY HH:mm"),
            dayjs(displayBooking.checkedInAt).format("HH:mm"),
          );
        }
      }
      const haystack = haystackParts.join(" ").toLowerCase();
      const hitKeyword = !keyword || haystack.includes(keyword);
      const hitStatus = statusFilter === "all" || table.status === statusFilter;
      return hitKeyword && hitStatus;
    });
  }, [
    customerById,
    isEditMode,
    primaryBookingByTableId,
    search,
    statusFilter,
    tablesForFloorView,
  ]);

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

  /**
   * Effective row/col of each visible table on the canvas — accounts for in-progress table or merge-group drags.
   */
  const effectiveTablePositions = useMemo(() => {
    const result = new Map<string, { row: number; col: number }>();
    for (const table of placedTables) {
      const mapped = getTableGridPosition(table, effectiveGridColumns, effectiveGridRows);
      result.set(table.id, { row: mapped.row, col: mapped.col });
    }
    if (dragState) {
      result.set(dragState.tableId, { row: dragState.row, col: dragState.col });
    }
    if (mergeGroupDragState && editLayout) {
      const group = effectiveMergeGroups.find(
        (candidate) => candidate.id === mergeGroupDragState.groupId
      );
      if (group) {
        const memberIds = mergeMemberIdsForEdit(
          group,
          editLayout.pendingMergeAdds,
          editLayout.pendingMergeRemoves
        );
        const preview = getMergeMemberPositionsAtAnchor(
          memberIds,
          mergeGroupDragState.anchorRow,
          mergeGroupDragState.anchorCol,
          effectiveGridColumns,
          effectiveGridRows
        );
        if (preview) {
          for (const [tableId, pos] of preview) {
            result.set(tableId, pos);
          }
        }
      }
    }
    return result;
  }, [
    dragState,
    editLayout,
    effectiveGridColumns,
    effectiveGridRows,
    effectiveMergeGroups,
    mergeGroupDragState,
    placedTables,
  ]);

  const tableByNode = useMemo(() => {
    const grouped = new Map<string, DiningTable[]>();
    for (const table of placedTables) {
      const pos = effectiveTablePositions.get(table.id);
      if (!pos) {
        continue;
      }
      const key = `${pos.row}-${pos.col}`;
      const current = grouped.get(key) ?? [];
      current.push(table);
      grouped.set(key, current);
    }
    return grouped;
  }, [effectiveTablePositions, placedTables]);

  /**
   * Geometry for each active merge-group bbox in the current area.
   * Computed once per (groups, layout, drag) change; pixel coords are relative to the canvas content layer.
   */
  const mergeBBoxes = useMemo(() => {
    if (effectiveMergeGroups.length === 0) {
      return [];
    }
    const halfW = FLOOR_TABLE_BLOCK_WIDTH_PX / 2;
    const halfH = FLOOR_TABLE_BLOCK_HEIGHT_PX / 2;
    const marginX = 10;
    const marginY = MERGE_GROUP_HEADER_TABLE_GAP_PX;
    const rects: Array<{
      groupId: string;
      mergedName: string;
      totalCapacity: number;
      memberCount: number;
      tableIds: string[];
      x: number;
      y: number;
      width: number;
      height: number;
      headerHeight: number;
      plugSlot: { left: number; top: number; row: number; col: number } | null;
    }> = [];
    for (const group of effectiveMergeGroups) {
      const strip = getMergeGroupStripCells(
        group.tableIds,
        effectiveTablePositions,
        effectiveGridColumns,
        effectiveGridRows
      );
      if (!strip) {
        continue;
      }
      let memberCount = 0;
      let minRow = Number.POSITIVE_INFINITY;
      let maxRow = Number.NEGATIVE_INFINITY;
      let minCol = Number.POSITIVE_INFINITY;
      let maxCol = Number.NEGATIVE_INFINITY;
      for (const tableId of group.tableIds) {
        const pos = effectiveTablePositions.get(tableId);
        if (!pos) {
          continue;
        }
        memberCount += 1;
        minRow = Math.min(minRow, pos.row);
        maxRow = Math.max(maxRow, pos.row);
        minCol = Math.min(minCol, pos.col);
        maxCol = Math.max(maxCol, pos.col);
      }
      if (memberCount === 0) {
        continue;
      }
      minRow = Math.min(minRow, strip.plugRow);
      maxRow = Math.max(maxRow, strip.plugRow);
      minCol = Math.min(minCol, strip.plugCol);
      maxCol = Math.max(maxCol, strip.plugCol);
      const tableXMin = CANVAS_PADDING + minCol * effectiveNodeSpacing - halfW;
      const tableXMax = CANVAS_PADDING + maxCol * effectiveNodeSpacing + halfW;
      const tableYMin = CANVAS_PADDING + minRow * effectiveNodeSpacing - halfH;
      const tableYMax = CANVAS_PADDING + maxRow * effectiveNodeSpacing + halfH;
      const xMin = tableXMin - marginX;
      const xMax = tableXMax + marginX;
      const headerHeight =
        isEditMode || !mergeGroupHasBookingOnDay(group.id, floorMapDayBookings)
          ? MERGE_GROUP_HEADER_BASE_HEIGHT_PX
          : MERGE_GROUP_HEADER_BOOKED_HEIGHT_PX;
      const yMin = tableYMin - headerHeight - marginY;
      const yMax = tableYMax + marginY;
      rects.push({
        groupId: group.id,
        mergedName: group.mergedName,
        totalCapacity: group.totalCapacity,
        memberCount,
        tableIds: group.tableIds,
        x: xMin,
        y: yMin + MERGE_GROUP_BBOX_TOP_OFFSET_PX,
        width: Math.max(0, xMax - xMin),
        height: Math.max(
          headerHeight,
          yMax - yMin + MERGE_GROUP_BBOX_HEIGHT_ADJUST_PX
        ),
        headerHeight,
        plugSlot: {
          left: CANVAS_PADDING + strip.plugCol * effectiveNodeSpacing,
          top: CANVAS_PADDING + strip.plugRow * effectiveNodeSpacing,
          row: strip.plugRow,
          col: strip.plugCol,
        },
      });
    }
    return rects;
  }, [
    effectiveGridColumns,
    effectiveGridRows,
    effectiveNodeSpacing,
    effectiveTablePositions,
    effectiveMergeGroups,
    floorMapDayBookings,
    isEditMode,
    mergeGroupDragState,
  ]);

  const commitMergeGroupDrop = (groupId: string, anchorRow: number, anchorCol: number) => {
    if (!editLayout) {
      setMergeGroupDragState(null);
      return;
    }
    const group = effectiveMergeGroups.find((candidate) => candidate.id === groupId);
    if (!group) {
      setMergeGroupDragState(null);
      return;
    }
    const layoutPositions = new Map<string, { row: number; col: number }>();
    for (const table of tablesInArea) {
      const p = editLayout.positions[table.id];
      layoutPositions.set(table.id, {
        row: p?.y ?? table.positionY,
        col: p?.x ?? table.positionX,
      });
    }
    const memberIds = mergeMemberIdsForEdit(
      group,
      editLayout.pendingMergeAdds,
      editLayout.pendingMergeRemoves
    );
    const currentAnchor = findMergeStripAnchorForMemberCells(
      memberIds,
      layoutPositions,
      effectiveGridColumns,
      effectiveGridRows
    );
    if (
      currentAnchor &&
      currentAnchor.row === anchorRow &&
      currentAnchor.col === anchorCol
    ) {
      setMergeGroupDragState(null);
      return;
    }

    setEditLayout((prev) => {
      if (!prev) {
        return prev;
      }
      const memberIds = mergeMemberIdsForEdit(
        group,
        prev.pendingMergeAdds,
        prev.pendingMergeRemoves
      );
      if (memberIds.length === 0) {
        return prev;
      }
      return applyMergePackToEditLayout(prev, memberIds, tablesInArea, {
        row: anchorRow,
        col: anchorCol,
      });
    });
    setMergeGroupDragState(null);
  };

  const commitDrop = (tableId: string, row: number, col: number) => {
    const source = tableMap[tableId];
    if (!source || !editLayout) {
      setDragState(null);
      return;
    }
    if (tableToMergeGroupId.has(tableId)) {
      setDragState(null);
      return;
    }
    const current = getTableGridPosition(source, effectiveGridColumns, effectiveGridRows);
    if (current.row === row && current.col === col) {
      setDragState(null);
      return;
    }
    const dropKey = `${row}-${col}`;
    const currentGroupId = tableToMergeGroupId.get(tableId) ?? null;

    setEditLayout((prev) => {
      if (!prev) {
        return prev;
      }
      let next: FloorEditLayout = {
        ...prev,
        positions: { ...prev.positions, [source.id]: { x: col, y: row } },
      };

      if (effectiveMergeGroups.length === 0) {
        return next;
      }

      if (!currentGroupId) {
        for (const group of effectiveMergeGroups) {
          const positionsForStrip = new Map(effectiveTablePositions);
          positionsForStrip.set(tableId, { row, col });
          const strip = getMergeGroupStripCells(
            group.tableIds,
            positionsForStrip,
            next.gridColumns,
            next.gridRows
          );
          if (!strip) {
            continue;
          }
          if (row !== strip.plugRow || col !== strip.plugCol) {
            continue;
          }
          const pendingMergeRemoves = next.pendingMergeRemoves.filter(
            (item) => !(item.groupId === group.id && item.tableId === tableId)
          );
          const alreadyPending = next.pendingMergeAdds.some(
            (item) => item.groupId === group.id && item.tableId === tableId
          );
          const pendingMergeAdds = alreadyPending
            ? next.pendingMergeAdds
            : [...next.pendingMergeAdds, { groupId: group.id, tableId }];
          next = { ...next, pendingMergeAdds, pendingMergeRemoves };
          const memberIds = mergeMemberIdsForEdit(group, pendingMergeAdds, pendingMergeRemoves);
          const preferredAnchor =
            findMergeStripAnchorForPlug(
              row,
              col,
              memberIds.length + 1,
              next.gridColumns,
              next.gridRows
            ) ?? undefined;
          next = applyMergePackToEditLayout(
            next,
            memberIds,
            tablesInArea,
            preferredAnchor
          );
          break;
        }
        return next;
      }

      const currentGroup = effectiveMergeGroups.find((group) => group.id === currentGroupId);
      if (!currentGroup) {
        return next;
      }
      const positionsForStrip = new Map(effectiveTablePositions);
      positionsForStrip.set(tableId, { row, col });
      const strip = getMergeGroupStripCells(
        currentGroup.tableIds,
        positionsForStrip,
        next.gridColumns,
        next.gridRows
      );
      if (!strip) {
        return next;
      }
      const stillOnStrip =
        strip.memberCells.has(dropKey) || (row === strip.plugRow && col === strip.plugCol);
      if (stillOnStrip) {
        return next;
      }

      const pendingMergeAdds = next.pendingMergeAdds.filter(
        (item) => !(item.groupId === currentGroupId && item.tableId === tableId)
      );
      const alreadyPending = next.pendingMergeRemoves.some(
        (item) => item.groupId === currentGroupId && item.tableId === tableId
      );
      const pendingMergeRemoves = alreadyPending
        ? next.pendingMergeRemoves
        : [...next.pendingMergeRemoves, { groupId: currentGroupId, tableId }];
      next = { ...next, pendingMergeAdds, pendingMergeRemoves };
      const memberIds = mergeMemberIdsForEdit(
        currentGroup,
        pendingMergeAdds,
        pendingMergeRemoves
      );
      if (memberIds.length >= 2) {
        next = applyMergePackToEditLayout(next, memberIds, tablesInArea);
      }
      return next;
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
    if (tableToMergeGroupId.has(table.id)) {
      notifications.show({
        color: "yellow",
        message: `${table.name} đang trong cụm gộp — bỏ gộp hoặc tách bàn trước khi chuyển vào kho.`,
      });
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
          [table.id]: { x: FLOOR_TABLE_PALETTE_SENTINEL, y: FLOOR_TABLE_PALETTE_SENTINEL },
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

      for (const remove of editLayout.pendingMergeRemoves) {
        const result = await removeTableFromMergeGroup({
          groupId: remove.groupId,
          tableId: remove.tableId,
          repackFloor: false,
        });
        if (!result.ok) {
          throw new Error(result.message);
        }
      }
      for (const add of editLayout.pendingMergeAdds) {
        const result = await addTableToMergeGroup({
          groupId: add.groupId,
          tableId: add.tableId,
          repackFloor: false,
        });
        if (!result.ok) {
          throw new Error(result.message);
        }
      }

      resyncEditLayoutAfterSaveRef.current = true;
      const mergeChangeCount =
        editLayout.pendingMergeAdds.length + editLayout.pendingMergeRemoves.length;
      notifications.show({
        color: "green",
        message:
          mergeChangeCount > 0
            ? "Đã lưu sơ đồ và thay đổi bàn gộp xuống máy chủ."
            : "Đã lưu sơ đồ xuống máy chủ.",
      });
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
    if (table.status === next || isTableStatusBusy(table.id)) {
      return;
    }
    await runTableStatusAction(table.id, async () => {
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
    });
  };

  const closeRegistrationPanel = useCallback(() => {
    setRegisterTable(null);
    setRegisterMergeGroup(null);
    setRegisterCustomerName("");
    setRegisterCustomerPhone("");
    setRegisterGuestCount(4);
    setRegisterBookingDate(dayjs().format("YYYY-MM-DD"));
    setRegisterBookingTime(dayjs().format("HH:mm"));
    setRegisterNote("");
    setRegisterGuestType("Khách thường");
    setRegisterPendingSelected([]);
    setRegisterArrivalMode("immediate");
    setRegisterModalTab("book");
  }, []);

  const openAssignPendingForTable = (table: DiningTable) => {
    panStateRef.current = null;
    placementTapRef.current = null;
    setDetailTable(null);
    setDetailMergeGroup(null);
    setDetailTableBlockState(null);
    setDetailTableBlockLoading(false);
    setDetailWaitlistActionId(null);
    setRegisterMergeGroup(null);
    setRegisterTable(table);
    setRegisterPendingSelected([]);
    setRegisterModalTab("assign");
  };

  const openAssignPendingForMergeGroup = (group: TableMergeGroup) => {
    panStateRef.current = null;
    placementTapRef.current = null;
    setDetailTable(null);
    setDetailMergeGroup(null);
    setDetailTableBlockState(null);
    setDetailTableBlockLoading(false);
    setDetailWaitlistActionId(null);
    setRegisterTable(null);
    setRegisterMergeGroup(group);
    setRegisterPendingSelected([]);
    setRegisterModalTab("assign");
  };

  const confirmNavigateToDayBookingList = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const visitLabel = dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY");
      modals.openConfirmModal({
        title: "Mở Danh sách booking",
        children: (
          <Text size="sm">
            Chuyển đến trang Đặt bàn · Danh sách booking (suất {visitLabel}
            {customer?.fullName ? ` · ${customer.fullName}` : ""})? Form gán bàn sẽ đóng.
          </Text>
        ),
        labels: { cancel: "Ở lại", confirm: "Mở danh sách" },
        onConfirm: () => {
          closeRegistrationPanel();
          closeDetailModal();
          const params = new URLSearchParams({
            tab: "list",
            focusBooking: booking.id,
          });
          router.push(`/bookings?${params.toString()}`);
        },
      });
    },
    [closeRegistrationPanel, router, state.customers]
  );

  const openRegistrationForMergeGroup = (
    group: TableMergeGroup,
    options?: { preferHoldAfterOccupied?: boolean }
  ) => {
    panStateRef.current = null;
    placementTapRef.current = null;
    setDetailTable(null);
    setDetailMergeGroup(null);
    setRegisterTable(null);
    setRegisterMergeGroup(group);
    setRegisterGuestCount(
      Math.max(1, getMergeGroupEffectiveGuestCapacity(group.totalCapacity))
    );
    setRegisterNote("");
    setRegisterGuestType("Khách thường");
    setRegisterCustomerName("");
    setRegisterCustomerPhone("");
    setRegisterPendingSelected([]);
    setRegisterModalTab("book");

    const status = mergeGroupStatusById.get(group.id) ?? "available";
    const preferHold =
      options?.preferHoldAfterOccupied && (status === "occupied" || status === "hold");
    if (preferHold) {
      const primaryBooking = pickPrimaryBookingOnMergeGroup(group.id, state.bookings);
      const afterEnd = primaryBooking?.endTime
        ? dayjs(primaryBooking.endTime).add(1, "minute")
        : dayjs().add(1, "hour");
      setRegisterArrivalMode("hold");
      setRegisterBookingDate(afterEnd.format("YYYY-MM-DD"));
      setRegisterBookingTime(afterEnd.format("HH:mm"));
    } else {
      setRegisterArrivalMode("immediate");
      setRegisterBookingDate(dayjs().format("YYYY-MM-DD"));
      setRegisterBookingTime(dayjs().format("HH:mm"));
    }
  };

  const openRegistrationForTable = (table: DiningTable, options?: { preferHoldAfterOccupied?: boolean }) => {
    panStateRef.current = null;
    placementTapRef.current = null;
    setDetailTable(null);
    setDetailMergeGroup(null);
    setRegisterMergeGroup(null);
    setRegisterTable(table);
    setRegisterGuestCount(Math.max(1, table.seats || 1));
    setRegisterNote("");
    setRegisterGuestType("Khách thường");
    setRegisterCustomerName("");
    setRegisterCustomerPhone("");
    setRegisterPendingSelected([]);
    setRegisterModalTab("book");

    const preferHold =
      options?.preferHoldAfterOccupied && (table.status === "occupied" || table.status === "hold");
    if (preferHold) {
      const primaryBooking = pickPrimaryBookingOnTable(table.id, state.bookings);
      const afterEnd = primaryBooking?.endTime
        ? dayjs(primaryBooking.endTime).add(1, "minute")
        : dayjs().add(1, "hour");
      setRegisterArrivalMode("hold");
      setRegisterBookingDate(afterEnd.format("YYYY-MM-DD"));
      setRegisterBookingTime(afterEnd.format("HH:mm"));
    } else {
      setRegisterArrivalMode("immediate");
      setRegisterBookingDate(dayjs().format("YYYY-MM-DD"));
      setRegisterBookingTime(dayjs().format("HH:mm"));
    }
  };

  const openNewBookingForTable = (table: DiningTable) => {
    if (registerTable?.id === table.id) {
      closeRegistrationPanel();
      return;
    }
    closeDetailModal();
    openRegistrationForTable(table, { preferHoldAfterOccupied: true });
  };

  const openNewBookingForMergeGroup = (group: TableMergeGroup) => {
    if (registerMergeGroup?.id === group.id) {
      closeRegistrationPanel();
      return;
    }
    closeDetailModal();
    openRegistrationForMergeGroup(group, { preferHoldAfterOccupied: true });
  };

  const openDetailForTable = (table: DiningTable) => {
    panStateRef.current = null;
    placementTapRef.current = null;
    setRegisterTable(null);
    setRegisterMergeGroup(null);
    setDetailMergeGroup(null);
    setDetailTable(table);
  };

  const openDetailForMergeGroup = (group: TableMergeGroup) => {
    panStateRef.current = null;
    placementTapRef.current = null;
    setRegisterTable(null);
    setRegisterMergeGroup(null);
    setDetailTable(null);
    setOpenedMergeGroupId(null);
    setDetailMergeGroup(group);
  };

  const handleViewOrRegisterForTable = (table: DiningTable) => {
    const memberMergeGroupId = tableToMergeGroupId.get(table.id);
    const memberMergeGroup = memberMergeGroupId
      ? effectiveMergeGroups.find((group) => group.id === memberMergeGroupId)
      : undefined;
    const mergeGuestArrived =
      memberMergeGroupId != null &&
      mergeGroupPrimaryGuestHasArrived(memberMergeGroupId, bookingsForFloorTableDisplay);
    if (memberMergeGroup && mergeGuestArrived) {
      handleViewOrRegisterForMergeGroup(memberMergeGroup);
      return;
    }
    if (isEmployee) {
      if (table.status !== "occupied") {
        notifications.show({
          color: "yellow",
          message: "Nhân viên chỉ xử lý bàn đang ở trạng thái Đã ngồi.",
        });
        return;
      }
      openDetailForTable(table);
      return;
    }
    if (table.status === "occupied" || table.status === "hold") {
      if (detailTable?.id === table.id) {
        closeDetailModal();
        return;
      }
      openDetailForTable(table);
      return;
    }
    if (table.status === "available") {
      if (registerTable?.id === table.id) {
        closeRegistrationPanel();
        return;
      }
      openRegistrationForTable(table);
      return;
    }
    openDetailForTable(table);
  };

  const handleViewOrRegisterForMergeGroup = (group: TableMergeGroup) => {
    const status = mergeGroupStatusById.get(group.id) ?? "available";
    if (isEmployee) {
      if (status !== "occupied") {
        notifications.show({
          color: "yellow",
          message: "Nhân viên chỉ xử lý cụm gộp đang có khách ngồi.",
        });
        return;
      }
      openDetailForMergeGroup(group);
      return;
    }
    if (status === "occupied" || status === "hold") {
      if (detailMergeGroup?.id === group.id) {
        closeDetailModal();
        return;
      }
      openDetailForMergeGroup(group);
      return;
    }
    if (status === "available") {
      if (registerMergeGroup?.id === group.id) {
        closeRegistrationPanel();
        return;
      }
      openRegistrationForMergeGroup(group);
      return;
    }
    openDetailForMergeGroup(group);
  };

  const handleRegisterCustomer = async () => {
    const registerTarget = registerMergeGroup ?? registerTable;
    if (!registerTarget || !registerCustomerName.trim() || !registerCustomerPhone.trim()) {
      notifications.show({
        color: "red",
        message: "Vui lòng nhập tên khách và số điện thoại.",
      });
      return;
    }
    const nextGuestCount = Math.max(1, Number(registerGuestCount || 1));
    if (registerMergeGroup) {
      const maxGuests = getMergeGroupEffectiveGuestCapacity(registerMergeGroup.totalCapacity);
      if (nextGuestCount > maxGuests) {
        notifications.show({
          color: "red",
          message: `Số khách không được vượt quá sức chứa cụm (${maxGuests} khách).`,
        });
        return;
      }
    } else if (
      registerTable!.seats > 0 &&
      !tableFitsGuestCount(registerTable!.seats, nextGuestCount)
    ) {
      notifications.show({
        color: "red",
        message: `Số khách không được vượt quá sức chứa bàn (${formatTableGuestCapacityHint(registerTable!.seats)}).`,
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
    const registerStatus = registerMergeGroup
      ? (mergeGroupStatusById.get(registerMergeGroup.id) ?? "available")
      : registerTable!.status;
    if (registerStatus === "occupied" && registerArrivalMode === "immediate") {
      notifications.show({
        color: "red",
        message: registerMergeGroup
          ? "Cụm đang có khách — chọn Giữ chỗ và đặt khung giờ sau khi cụm trống."
          : "Bàn đang có khách — chọn Giữ chỗ và đặt khung giờ sau khi bàn trống.",
      });
      return;
    }
    if (registerMergeGroup) {
      const candidateBooking = {
        id: "__register_candidate__",
        customerId: "",
        branchId: registerMergeGroup.branchId,
        areaId: registerMergeGroup.areaId,
        tableId: null,
        mergeGroupId: registerMergeGroup.id,
        guestCount: nextGuestCount,
        bookingAt: dayjs().toISOString(),
        startTime: dayjs().toISOString(),
        endTime: dayjs().add(90, "minute").toISOString(),
        status: "confirmed" as const,
        createdByUserId: "",
      };
      if (
        hasAssignableSlotConflictAtMergeGroup(
          candidateBooking,
          registerMergeGroup,
          state.bookings
        )
      ) {
        notifications.show({
          color: "red",
          message: "Khung giờ trùng với booking khác trên cụm gộp hoặc bàn thành viên.",
        });
        return;
      }
    } else if (registerTableSlotConflicts.length > 0) {
      notifications.show({
        color: "red",
        message: registerTableConflictMessage ?? "Khung giờ trùng với booking khác trên bàn này.",
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
    const runCreate = async (allowDuplicate?: boolean) => {
      const result = await createBooking({
        customerName: registerCustomerName.trim(),
        customerPhone: registerCustomerPhone.trim(),
        branchId: registerTarget.branchId,
        areaId: registerTarget.areaId,
        tableId: registerMergeGroup ? null : registerTable!.id,
        mergeGroupId: registerMergeGroup?.id ?? null,
        guestCount: nextGuestCount,
        bookingAt: bookingAtIso,
        note: registerNote.trim() || undefined,
        guestType: registerGuestType,
        allowDuplicate,
      });
      if (!result.ok && result.code === DUPLICATE_BOOKING_CODE && result.duplicates?.length) {
        notifications.show({ color: "orange", message: result.message });
        confirmDuplicateBookingSecond(result.duplicates, () => {
          void runCreate(true);
        });
        return;
      }
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        closeRegistrationPanel();
      }
    };

    setRegisterSaving(true);
    try {
      await runCreate();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không thể tạo booking.",
      });
    } finally {
      setRegisterSaving(false);
    }
  };

  const registerPendingAssignPlan = useMemo(() => {
    if (registerMergeGroup) {
      return pickNonOverlappingBookingsForMergeGroup(
        registerPendingSelected,
        registerMergeGroup,
        state.bookings
      );
    }
    if (!registerTable) {
      return null;
    }
    return pickNonOverlappingBookingsForTable(
      registerPendingSelected,
      registerTable.id,
      state.bookings,
      {
        maxSeats:
          registerTable.seats > 0
            ? getTableEffectiveGuestCapacity(registerTable.seats)
            : undefined,
      }
    );
  }, [registerMergeGroup, registerPendingSelected, registerTable, state.bookings]);

  const handleAssignPendingBookings = async () => {
    if ((!registerTable && !registerMergeGroup) || registerPendingSelected.length === 0) {
      notifications.show({
        color: "red",
        message: "Vui lòng chọn ít nhất một booking chờ để gán.",
      });
      return;
    }
    const plan = registerPendingAssignPlan;
    if (!plan || plan.assignable.length === 0) {
      notifications.show({
        color: "red",
        message: registerMergeGroup
          ? "Không có booking nào trong lựa chọn có thể gán (trùng giờ hoặc vượt sức chứa cụm)."
          : "Không có booking nào trong lựa chọn có thể gán (trùng giờ hoặc vượt sức chứa bàn).",
      });
      return;
    }
    setRegisterSaving(true);
    try {
      let successCount = 0;
      const failureMessages: string[] = [];
      for (const booking of plan.assignable) {
        const result = await assignBookingToTable({
          bookingId: booking.id,
          areaId: registerMergeGroup?.areaId ?? registerTable!.areaId,
          tableId: registerMergeGroup ? null : registerTable!.id,
          mergeGroupId: registerMergeGroup?.id ?? null,
          guestCount: booking.guestCount,
        });
        if (result.ok) {
          successCount += 1;
        } else {
          failureMessages.push(result.message);
        }
      }
      const skippedCount =
        plan.skippedSelectionOverlap.length +
        plan.skippedTableConflict.length +
        plan.skippedOverCapacity.length;
      if (successCount > 0) {
        const base =
          successCount === 1
            ? "Đã gán 1 booking vào bàn."
            : `Đã gán ${successCount} booking vào bàn.`;
        const skipNote =
          skippedCount > 0 ? ` Bỏ qua ${skippedCount} booking không hợp lệ trong lựa chọn.` : "";
        const failNote =
          failureMessages.length > 0
            ? ` ${failureMessages.length} booking không gán được: ${failureMessages[0]}`
            : "";
        notifications.show({
          color: failureMessages.length > 0 ? "yellow" : "green",
          message: `${base}${skipNote}${failNote}`,
        });
        if (failureMessages.length === 0) {
          closeRegistrationPanel();
        } else {
          const assignedIds = new Set(
            plan.assignable.slice(0, successCount).map((booking) => booking.id)
          );
          setRegisterPendingSelected((current) =>
            current.filter((booking) => !assignedIds.has(booking.id))
          );
        }
      } else {
        notifications.show({
          color: "red",
          message: failureMessages[0] ?? "Không thể gán booking chờ.",
        });
      }
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không thể gán booking chờ.",
      });
    } finally {
      setRegisterSaving(false);
    }
  };

  const handleCreateMergeGroup = async (tableIds: string[]) => {
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    if (!activeAreaBranchId || !areaId) {
      notifications.show({ color: "red", message: "Vui lòng chọn khu vực trước khi gộp bàn." });
      return;
    }
    const uniqueIds = Array.from(new Set(tableIds)).filter(Boolean);
    if (uniqueIds.length < 2) {
      notifications.show({ color: "red", message: "Cần chọn ít nhất 2 bàn để gộp." });
      return;
    }
    setMergeSaving(true);
    try {
      const result = await createTableMergeGroup({
        branchId: activeAreaBranchId,
        areaId,
        tableIds: uniqueIds,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setMergeModalOpen(false);
        setMergeSelectedTableIds([]);
        setEditSelectedTableIds([]);
      }
    } finally {
      setMergeSaving(false);
    }
  };

  const handleReleaseMergeGroup = async (groupId: string) => {
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    setMergeSaving(true);
    try {
      const result = await releaseTableMergeGroup({ groupId });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setReleaseMergeGroupId(null);
        if (openedMergeGroupId === groupId) {
          setOpenedMergeGroupId(null);
        }
        if (detailMergeGroup?.id === groupId) {
          closeDetailModal();
        }
      }
    } finally {
      setMergeSaving(false);
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

    if (mergeGroupDragState && event.pointerId === mergeGroupDragState.pointerId) {
      const world = toWorldCoordinate(event.clientX, event.clientY);
      const snapped = nearestNode(world.x, world.y);
      if (
        snapped.row !== mergeGroupDragState.anchorRow ||
        snapped.col !== mergeGroupDragState.anchorCol
      ) {
        setMergeGroupDragState((prev) =>
          prev
            ? { ...prev, anchorRow: snapped.row, anchorCol: snapped.col }
            : prev
        );
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

    if (
      isEditMode &&
      mergeGroupDragState &&
      event.pointerId === mergeGroupDragState.pointerId
    ) {
      commitMergeGroupDrop(
        mergeGroupDragState.groupId,
        mergeGroupDragState.anchorRow,
        mergeGroupDragState.anchorCol
      );
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
    setMergeGroupDragState(null);
  };

  const handleMergeGroupPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    groupId: string
  ) => {
    if (!isEditMode || !editLayout || event.button !== 0) {
      return;
    }
    if ((event.target as HTMLElement).closest("[data-merge-no-drag]")) {
      return;
    }
    const group = effectiveMergeGroups.find((candidate) => candidate.id === groupId);
    if (!group) {
      return;
    }
    const memberIds = mergeMemberIdsForEdit(
      group,
      editLayout.pendingMergeAdds,
      editLayout.pendingMergeRemoves
    );
    if (memberIds.length === 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const anchor =
      findMergeStripAnchorForMemberCells(
        memberIds,
        effectiveTablePositions,
        effectiveGridColumns,
        effectiveGridRows
      ) ??
      (() => {
        const firstId = memberIds[0]!;
        const pos = effectiveTablePositions.get(firstId);
        return pos
          ? { row: pos.row, col: pos.col }
          : { row: 0, col: 0 };
      })();
    viewport.setPointerCapture(event.pointerId);
    setMergeGroupDragState({
      pointerId: event.pointerId,
      groupId,
      anchorRow: clamp(anchor.row, 0, effectiveGridRows - 1),
      anchorCol: clamp(anchor.col, 0, effectiveGridColumns - 1),
    });
    setDragState(null);
  };

  const handleTablePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    table: DiningTable
  ) => {
    if (!isEditMode) {
      return;
    }
    if (tableToMergeGroupId.has(table.id)) {
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
      // #region agent log
      fetch("http://127.0.0.1:7775/ingest/6dbf37ec-2333-468e-bf97-62fad053dd9f", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "7f6736",
        },
        body: JSON.stringify({
          sessionId: "7f6736",
          runId: "pre-fix",
          hypothesisId: "B",
          location: "floor-map/page.tsx:handlePalettePointerUp",
          message: "palette tap before setPendingPlacementTableId",
          data: { tableId: table.id, inRender: inRenderPhaseRef.current },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setPendingPlacementTableId((current) => {
        if (current === table.id) {
          // #region agent log
          fetch("http://127.0.0.1:7775/ingest/6dbf37ec-2333-468e-bf97-62fad053dd9f", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Debug-Session-Id": "7f6736",
            },
            body: JSON.stringify({
              sessionId: "7f6736",
              runId: "pre-fix",
              hypothesisId: "B",
              location: "floor-map/page.tsx:setPendingPlacement-updater",
              message: "setPendingPlacement updater calling notifications.show (deselect)",
              data: { current, inRender: inRenderPhaseRef.current },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          notifications.show({ color: "blue", message: "Đã bỏ chọn đặt bàn." });
          return null;
        }
        // #region agent log
        fetch("http://127.0.0.1:7775/ingest/6dbf37ec-2333-468e-bf97-62fad053dd9f", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Debug-Session-Id": "7f6736",
          },
          body: JSON.stringify({
            sessionId: "7f6736",
            runId: "pre-fix",
            hypothesisId: "B",
            location: "floor-map/page.tsx:setPendingPlacement-updater",
            message: "setPendingPlacement updater calling notifications.show (select)",
            data: { current, nextId: table.id, inRender: inRenderPhaseRef.current },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
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
            {isEmployee
              ? "Chạm bàn Đã ngồi để mở chi tiết, rồi bấm Hoàn thành khi khách ra về. Kéo nền để xem sơ đồ, cuộn/chụm để zoom."
              : isEditMode
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
            <Button
              size={isCompact ? "sm" : "compact-sm"}
              variant="light"
              onClick={() => {
                setMergeSelectedTableIds(editSelectedTableIds);
                setMergeModalOpen(true);
              }}
              disabled={!activeAreaBranchId}
            >
              Thêm bàn gộp
            </Button>
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

      {!isEmployee ? (
        <Accordion
          variant="separated"
          defaultValue="floor-map-calendar"
          className={classes.floorMapCalendarAccordion}
        >
          <Accordion.Item value="floor-map-calendar">
            <Accordion.Control>
              <Group justify="space-between" wrap="nowrap" gap="sm" pr="xs" style={{ width: "100%" }}>
                <Text fw={600} size={isCompact ? "sm" : "md"}>
                  {isCompact ? "Lịch booking" : "Lịch booking theo sơ đồ"}
                </Text>
                <Text size={isCompact ? "xs" : "sm"} c="dimmed" style={{ flexShrink: 0 }}>
                  {floorMapSelectedDate.format("DD/MM/YYYY")}
                </Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <BookingCalendarPanel
                ref={calendarPanelRef}
                title="Lịch booking theo sơ đồ"
                compactTitle="Lịch booking"
                showHeader={false}
                embedded
                interaction="select-day-only"
                showDayListButton={false}
                selectedDate={floorMapSelectedDate}
                onSelectedDateChange={setFloorMapSelectedDate}
              />
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
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
              {mergeBBoxes.map((bbox) => {
                const mergeGroup = effectiveMergeGroups.find(
                  (candidate) => candidate.id === bbox.groupId
                );
                if (!mergeGroup) {
                  return null;
                }
                const mergeActive =
                  (isEditMode && openedMergeGroupId === bbox.groupId) ||
                  (!isEditMode && detailMergeGroup?.id === bbox.groupId);
                const viewMergeStatus = !isEditMode
                  ? (mergeGroupStatusById.get(bbox.groupId) ?? "available")
                  : null;
                const viewMergeBooking = !isEditMode
                  ? (primaryBookingByMergeGroupId.get(bbox.groupId) ?? null)
                  : null;
                const viewMergeCustomer = viewMergeBooking
                  ? customerById.get(viewMergeBooking.customerId)
                  : undefined;
                const mergeStatusSurfaceClass = !isEditMode
                  ? MERGE_GROUP_STATUS_SURFACE_CLASS[viewMergeStatus ?? "available"]
                  : "";
                return (
                  <div
                    key={`merge-group-${bbox.groupId}`}
                    className={`${classes.mergeGroupContainer} ${mergeStatusSurfaceClass} ${
                      mergeActive ? classes.mergeGroupContainerActive : ""
                    } ${
                      mergeGroupDragState?.groupId === bbox.groupId
                        ? classes.mergeGroupContainerDragging
                        : ""
                    }`}
                    style={{
                      left: bbox.x,
                      top: bbox.y,
                      width: bbox.width,
                      height: bbox.height,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    {isEditMode ? (
                      <div
                        className={`${classes.mergeGroupContainerHeader} ${classes.mergeGroupContainerHeaderDraggable}`}
                        style={{ height: bbox.headerHeight }}
                        data-merge-group-header="true"
                        onPointerDown={(event) => {
                          handleMergeGroupPointerDown(event, bbox.groupId);
                        }}
                      >
                        <button
                          type="button"
                          className={classes.mergeGroupContainerTitle}
                          data-merge-no-drag="true"
                          onClick={(event) => {
                            event.stopPropagation();
                            setOpenedMergeGroupId(bbox.groupId);
                          }}
                        >
                          {bbox.mergedName}
                        </button>
                        <div className={classes.mergeGroupContainerHeaderMeta}>
                          <span
                            className={classes.mergeGroupContainerCapacity}
                            data-merge-no-drag="true"
                          >
                            Tổng: {bbox.totalCapacity} chỗ
                          </span>
                          <Tooltip label="Bỏ gộp" withArrow>
                            <ActionIcon
                              type="button"
                              size="sm"
                              variant="subtle"
                              color="red"
                              className={classes.mergeGroupReleaseBtn}
                              data-merge-no-drag="true"
                              aria-label={`Bỏ gộp ${bbox.mergedName}`}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => {
                                event.stopPropagation();
                                setReleaseMergeGroupId(bbox.groupId);
                              }}
                            >
                              <X size={14} />
                            </ActionIcon>
                          </Tooltip>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={`${classes.mergeGroupContainerHeader} ${classes.mergeGroupContainerHeaderClickable} ${
                          viewMergeBooking ? classes.mergeGroupContainerHeaderStacked : ""
                        }`}
                        style={{ minHeight: bbox.headerHeight, maxHeight: bbox.headerHeight }}
                        data-merge-group-header="true"
                        aria-label={`${bbox.mergedName}, tổng ${bbox.totalCapacity} chỗ`}
                        onClick={(event) => {
                          event.stopPropagation();
                          handleViewOrRegisterForMergeGroup(mergeGroup);
                        }}
                      >
                        <span className={classes.mergeGroupContainerHeaderPrimary}>
                          <span className={classes.mergeGroupContainerHeaderTitleRow}>
                            <span className={classes.mergeGroupContainerTitle}>
                              {bbox.mergedName}
                            </span>
                            {viewMergeStatus && viewMergeStatus !== "available" ? (
                              <Badge
                                color={tableStatusColor[viewMergeStatus]}
                                variant="light"
                                size="xs"
                              >
                                {tableStatusLabel[viewMergeStatus]}
                              </Badge>
                            ) : null}
                          </span>
                          <span className={classes.mergeGroupContainerCapacity}>
                            Tổng: {bbox.totalCapacity} chỗ
                          </span>
                        </span>
                        {viewMergeBooking ? (
                          <span className={classes.mergeGroupContainerBookingPeek}>
                            <Text
                              component="span"
                              size="xs"
                              fw={600}
                              className={classes.mergeGroupContainerBookingCustomer}
                            >
                              {viewMergeCustomer?.fullName ?? "—"}
                            </Text>
                            <Text
                              component="span"
                              size="xs"
                              c="dimmed"
                              className={classes.mergeGroupContainerBookingTimes}
                            >
                              {dayjs(
                                viewMergeBooking.startTime ?? viewMergeBooking.bookingAt
                              ).format("HH:mm")}
                              {viewMergeBooking.endTime
                                ? `–${dayjs(viewMergeBooking.endTime).format("HH:mm")}`
                                : ""}{" "}
                              ·{" "}
                              {dayjs(
                                viewMergeBooking.startTime ?? viewMergeBooking.bookingAt
                              ).format("DD/MM")}
                            </Text>
                          </span>
                        ) : null}
                      </button>
                    )}
                    <div
                      className={classes.mergeGroupContainerBody}
                      style={{ top: bbox.headerHeight }}
                    />
                  </div>
                );
              })}
              {mergeBBoxes.map((bbox) =>
                bbox.plugSlot && isEditMode ? (
                  <div
                    key={`merge-plug-${bbox.groupId}`}
                    className={classes.mergeGroupPlugSlot}
                    style={{
                      left: bbox.plugSlot.left,
                      top: bbox.plugSlot.top,
                      transform: "translate(-50%, -50%)",
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    title="Kéo bàn vào đây để gộp"
                  >
                    <Plus size={28} strokeWidth={2} />
                  </div>
                ) : null
              )}
              {gridNodes.map((node) => {
                const key = `${node.row}-${node.col}`;
                const tables = tableByNode.get(key) ?? [];
                const x = CANVAS_PADDING + node.col * effectiveNodeSpacing;
                const y = CANVAS_PADDING + node.row * effectiveNodeSpacing;
                return tables.map((table, stackIndex) => {
                  const stackKey = `${table.id}-${node.row}-${node.col}-${stackIndex}`;
                  const style = {
                    left: x + stackIndex * FLOOR_TABLE_STACK_OFFSET_PX,
                    top: y + stackIndex * FLOOR_TABLE_STACK_OFFSET_PX,
                    transform: "translate(-50%, -50%)",
                  };
                  const mergeGroupId = tableToMergeGroupId.get(table.id) ?? null;
                  const isMergeMember = Boolean(mergeGroupId);
                  const mergeGroupBooking =
                    mergeGroupId != null
                      ? (primaryBookingByMergeGroupId.get(mergeGroupId) ?? null)
                      : null;
                  const mergeGuestArrived =
                    mergeGroupId != null &&
                    mergeGroupPrimaryGuestHasArrived(mergeGroupId, floorMapDayBookings);
                  if (!isEditMode) {
                    const tableBooking = primaryBookingByTableId.get(table.id) ?? null;
                    const displayBooking =
                      isMergeMember && mergeGroupBooking && mergeGuestArrived
                        ? null
                        : tableBooking;
                    const peekCustomer = displayBooking
                      ? customerById.get(displayBooking.customerId)
                      : undefined;
                    return (
                      <FloorTableBlockView
                        key={stackKey}
                        table={table}
                        style={style}
                        isMergeMember={isMergeMember}
                        displayBooking={displayBooking}
                        customerName={peekCustomer?.fullName ?? ""}
                        isEmployee={isEmployee}
                        isBusy={isTableStatusBusy(table.id)}
                        isDragging={dragState?.tableId === table.id}
                        onOpenTable={() => handleViewOrRegisterForTable(table)}
                        onOpenDetail={() => openDetailForTable(table)}
                        onStatusChange={(nextStatus) => void handleStatusChange(table, nextStatus)}
                        onStatusMenuOpen={() => {
                          panStateRef.current = null;
                          placementTapRef.current = null;
                          setStatusMenuOpen(true);
                        }}
                        onStatusMenuClose={() => setStatusMenuOpen(false)}
                      />
                    );
                  }
                  const isMergeSelected = editSelectedTableIds.includes(table.id);
                  return (
                    <div
                      key={stackKey}
                      data-table-block="true"
                      data-table-status={table.status}
                      className={`${classes.tableBlock} ${classes.tableBlockEdit} ${dragState?.tableId === table.id ? classes.tableBlockDragging : ""
                        } ${isMergeMember ? classes.tableBlockMergeMember : ""} ${
                          isMergeSelected ? classes.tableBlockMergeSelected : ""
                        } ${isMergeMember ? classes.tableBlockMergeMemberLocked : ""}`}
                      style={style}
                      onPointerDown={(event) => {
                        if (isMergeMember && !event.shiftKey) {
                          event.stopPropagation();
                          return;
                        }
                        // Shift-click toggles a merge-pick selection without starting a drag.
                        if (event.shiftKey) {
                          event.stopPropagation();
                          event.preventDefault();
                          if (allActiveMergedTableIds.has(table.id)) {
                            notifications.show({
                              color: "yellow",
                              message: `${table.name} đã thuộc một cụm gộp khác.`,
                            });
                            return;
                          }
                          setEditSelectedTableIds((prev) =>
                            prev.includes(table.id)
                              ? prev.filter((id) => id !== table.id)
                              : [...prev, table.id]
                          );
                          return;
                        }
                        handleTablePointerDown(event, table);
                      }}
                    >
                      {!isMergeMember ? (
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
                      ) : null}
                      <Text fw={600} size="sm" lineClamp={1}>
                        {table.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {table.seats} ghế
                      </Text>
                    </div>
                  );
                });
              })}
            </div>
          </div>
          {isEditMode && editSelectedTableIds.length >= 2 ? (
            <div className={classes.mergeSelectionDock}>
              <Text size="sm" fw={600}>
                Đã chọn {editSelectedTableIds.length} bàn
              </Text>
              <Group gap="xs">
                <Button
                  variant="default"
                  size="xs"
                  onClick={() => setEditSelectedTableIds([])}
                  disabled={mergeSaving}
                >
                  Xoá chọn
                </Button>
                <Button
                  size="xs"
                  loading={mergeSaving}
                  onClick={() => void handleCreateMergeGroup(editSelectedTableIds)}
                >
                  Gộp đã chọn ({editSelectedTableIds.length})
                </Button>
              </Group>
            </div>
          ) : null}
          <div className={classes.canvasOverlay}>
            {isTopToolbarOpen ? (
              <div className={classes.canvasTopToolbar}>
                {!isEditMode ? (
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
                        <TextInputWithVoice
                          label="Tìm bàn"
                          placeholder="Tên bàn, khách, SĐT, giờ đặt, giờ check-in…"
                          value={search}
                          onChange={(event) => setSearch(event.currentTarget.value)}
                          size="sm"
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
                ) : null}

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
                          <EditableNumberInput
                            label="Cột"
                            required
                            value={editLayout?.gridColumns ?? gridColumns}
                            onChange={(value) =>
                              setEditLayout((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      gridColumns: clamp(
                                        value ?? DEFAULT_GRID_COLUMNS,
                                        4,
                                        24
                                      ),
                                    }
                                  : prev
                              )
                            }
                            min={4}
                            max={24}
                            style={{ flex: 1 }}
                            disabled={!editLayout}
                          />
                          <EditableNumberInput
                            label="Hàng"
                            required
                            value={editLayout?.gridRows ?? gridRows}
                            onChange={(value) =>
                              setEditLayout((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      gridRows: clamp(value ?? DEFAULT_GRID_ROWS, 4, 18),
                                    }
                                  : prev
                              )
                            }
                            min={4}
                            max={18}
                            style={{ flex: 1 }}
                            disabled={!editLayout}
                          />
                        </Group>
                        <EditableNumberInput
                          label="Khoảng cách node"
                          required
                          value={editLayout?.nodeSpacing ?? nodeSpacing}
                          onChange={(value) =>
                            setEditLayout((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    nodeSpacing: clampFloorNodeSpacing(
                                      value ?? FLOOR_DEFAULT_NODE_SPACING_PX
                                    ),
                                  }
                                : prev
                            )
                          }
                          min={FLOOR_NODE_SPACING_MIN_PX}
                          max={FLOOR_NODE_SPACING_MAX_PX}
                          step={4}
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

                {!isEmployee ? (
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
                ) : null}

                <div className={classes.toolbarAreaRow}>
                  <Select
                    value={areaId}
                    onChange={setActiveAreaId}
                    data={availableAreas.map((area) => ({
                      value: area.id,
                      label: `${area.name} - ${state.branches.find((branch) => branch.id === area.branchId)?.name}`,
                    }))}
                    searchable
                    className={classes.toolbarAreaSelect}
                    comboboxProps={{ withinPortal: true }}
                  />
                  {!isEmployee ? (
                    <div className={classes.toolbarAreaSecondary}>
                      <Group
                        gap={isCompact ? 8 : 4}
                        wrap="nowrap"
                        className={classes.toolbarAreaPrimaryBtns}
                      >
                        <Button
                          color="brand"
                          size={isCompact ? "sm" : "compact-sm"}
                          className={classes.toolbarDayListBtn}
                          onClick={() => setCreateBookingModalOpened(true)}
                        >
                          Tạo mới
                        </Button>
                        <Button
                          size={isCompact ? "sm" : "compact-sm"}
                          variant="filled"
                          className={classes.toolbarDayListBtn}
                          onClick={() => calendarPanelRef.current?.openDayListModal()}
                        >
                          Danh sách booking
                        </Button>
                        {!isEditMode ? (
                          <Button
                            size={isCompact ? "sm" : "compact-sm"}
                            variant="light"
                            className={classes.toolbarDayListBtn}
                            onClick={() => setMergeModalOpen(true)}
                            disabled={!activeAreaBranchId}
                          >
                            Gộp bàn
                          </Button>
                        ) : null}
                      </Group>
                      {!isBranchManager ? (
                        <Group
                          gap={isCompact ? 8 : 4}
                          className={classes.toolbarAreaActions}
                          wrap="nowrap"
                        >
                          <ActionIcon
                            variant="light"
                            size={isCompact ? "input-md" : "lg"}
                            className={classes.toolbarAreaActionBtn}
                            aria-label="Sửa khu vực"
                            disabled={!areaId || !hasSupabase}
                            onClick={openAreaMetadataEdit}
                          >
                            <Pencil size={16} />
                          </ActionIcon>
                          <ActionIcon
                            variant="light"
                            color="red"
                            size={isCompact ? "input-md" : "lg"}
                            className={classes.toolbarAreaActionBtn}
                            aria-label="Xóa khu vực"
                            disabled={!areaId || !hasSupabase}
                            onClick={() => setAreaDeleteOpen(true)}
                          >
                            <Trash2 size={16} />
                          </ActionIcon>
                        </Group>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <ActionIcon
                  variant="transparent"
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
                        variant="transparent"
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
                            <Stack gap={4} style={{ width: "100%" }}>
                              <Text size="sm" fw={600} lineClamp={1}>
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
                              <TableBlockBookingPeek
                                compact
                                tableId={table.id}
                                bookings={bookingsForFloorTableDisplay}
                                customers={state.customers}
                              />
                            </Stack>
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
        opened={Boolean(registerTable || registerMergeGroup)}
        onClose={() => {
          if (!registerSaving) {
            closeRegistrationPanel();
          }
        }}
        closeOnClickOutside={!registerSaving}
        closeOnEscape={!registerSaving}
        title={
          registerMergeGroup
            ? `Đăng ký - ${registerMergeGroup.mergedName}`
            : registerTable
              ? `Đăng ký - ${registerTable.name}`
              : "Đăng ký"
        }
        size={registerModalTab === "assign" ? "xl" : "md"}
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
      >
        {registerTable || registerMergeGroup ? (
          <Stack gap="sm">
            <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
              <Text size="sm" c="dimmed">
                {registerMergeGroup
                  ? `Tổng ${registerMergeGroup.totalCapacity} chỗ · ${tableStatusLabel[mergeGroupStatusById.get(registerMergeGroup.id) ?? "available"]}`
                  : `${formatTableGuestCapacityHint(registerTable!.seats)} · ${tableStatusLabel[registerTable!.status]}`}
              </Text>
              {registerMergeGroup ? (
                (mergeGroupStatusById.get(registerMergeGroup.id) === "occupied" ||
                  mergeGroupStatusById.get(registerMergeGroup.id) === "hold") ? (
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    onClick={() => openDetailForMergeGroup(registerMergeGroup)}
                  >
                    Lịch sử booking & hàng chờ
                  </Button>
                ) : null
              ) : registerTable!.status === "occupied" || registerTable!.status === "hold" ? (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  onClick={() => openDetailForTable(registerTable!)}
                >
                  Lịch sử booking & hàng chờ
                </Button>
              ) : null}
            </Group>
            <Tabs
              value={registerModalTab}
              onChange={(value) =>
                setRegisterModalTab(value === "assign" ? "assign" : "book")
              }
            >
              <Tabs.List grow>
                <Tabs.Tab value="book">Đặt bàn</Tabs.Tab>
                <Tabs.Tab value="assign">Gán bàn đang chờ</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="book" pt="sm">
                <Stack gap="sm">
                  {registerMergeGroup ? null : registerTableBranch ? (
                    <Group justify="flex-start">
                      <VoiceBookingAssistant
                        branch={registerTableBranch}
                        areas={registerVoiceAreas}
                        tables={registerVoiceTables}
                        onCreateBooking={async (input) => {
                          if (!registerTable) {
                            return { ok: false, message: "Không có bàn được chọn." };
                          }
                          const bookingAtIso = dayjs(input.bookingAt).toISOString();
                          const candidate: Booking = {
                            id: "__floor_voice__",
                            customerId: "",
                            branchId: registerTable.branchId,
                            areaId: registerTable.areaId,
                            tableId: registerTable.id,
                            guestCount:
                              typeof input.guestCount === "number" && Number.isFinite(input.guestCount)
                                ? Math.max(1, Math.round(input.guestCount))
                                : 1,
                            bookingAt: bookingAtIso,
                            startTime: bookingAtIso,
                            endTime: dayjs(bookingAtIso)
                              .add(
                                state.bookingRuntimeSettings.standardTurnaroundMinutes,
                                "minute"
                              )
                              .toISOString(),
                            status: "confirmed",
                            createdByUserId: "",
                          };
                          const conflicts = findAssignableSlotConflictsAtTable(
                            candidate,
                            registerTable.id,
                            state.bookings
                          );
                          if (conflicts.length > 0) {
                            const conflictCustomer = state.customers.find(
                              (item) => item.id === conflicts[0]?.customerId
                            )?.fullName;
                            return {
                              ok: false,
                              message:
                                formatTableSlotConflictMessage(conflicts, {
                                  tableName: registerTable.name,
                                  customerName: conflictCustomer,
                                }) ?? "Khung giờ trùng với booking khác trên bàn này.",
                            };
                          }
                          if (
                            registerTable.status === "occupied" &&
                            dayjs(bookingAtIso).isBefore(dayjs().add(1, "minute"))
                          ) {
                            return {
                              ok: false,
                              message:
                                "Bàn đang có khách — chọn khung giờ sau khi bàn trống.",
                            };
                          }
                          const result = await createBooking({
                            ...input,
                            branchId: registerTable.branchId,
                            areaId: registerTable.areaId,
                            tableId: registerTable.id,
                          });
                          if (result.ok) {
                            closeRegistrationPanel();
                          }
                          return result;
                        }}
                      />
                    </Group>
                  ) : null}
                  <Radio.Group
                    label="Đặt bàn"
                    value={registerArrivalMode}
                    disabled={registerSaving}
                    onChange={(value) =>
                      setRegisterArrivalMode(value === "hold" ? "hold" : "immediate")
                    }
                  >
                    <Stack gap={6} mt={4}>
                      <Radio value="hold" label="Giữ chỗ" />
                      <Radio
                        value="immediate"
                        label="Vào bàn ngay"
                        disabled={
                          registerMergeGroup
                            ? (mergeGroupStatusById.get(registerMergeGroup.id) ?? "available") ===
                              "occupied"
                            : registerTable!.status === "occupied"
                        }
                      />
                    </Stack>
                  </Radio.Group>
                  {registerMergeGroup ? (
                    (mergeGroupStatusById.get(registerMergeGroup.id) ?? "available") ===
                    "occupied" ? (
                      <Text size="xs" c="dimmed">
                        Cụm đang có khách — chỉ đặt thêm booking ở khung giờ không trùng lịch hiện
                        tại.
                      </Text>
                    ) : null
                  ) : registerTable!.status === "occupied" ? (
                    <Text size="xs" c="dimmed">
                      Bàn đang có khách — chỉ đặt thêm booking ở khung giờ không trùng lịch hiện tại.
                    </Text>
                  ) : null}
                  {!registerMergeGroup && registerTableConflictMessage ? (
                    <Alert color="red" variant="light" title="Trùng khung giờ trên bàn">
                      {registerTableConflictMessage}
                    </Alert>
                  ) : null}
                  {registerArrivalMode === "hold" ? (
                    <Flex
                      direction={{ base: "column", sm: "row" }}
                      gap="sm"
                      align={{ base: "stretch", sm: "flex-end" }}
                    >
                      <DatePickerInput
                        style={{ flex: "1 1 0", minWidth: 0 }}
                        label="Ngày đến"
                        value={registerBookingDate}
                        onChange={setRegisterBookingDate}
                        valueFormat="YYYY-MM-DD"
                        disabled={registerSaving}
                      />
                      <TimeInput
                        style={{ flex: "1 1 0", minWidth: 0 }}
                        label="Giờ đến"
                        value={registerBookingTime}
                        onChange={(event) => setRegisterBookingTime(event.currentTarget.value)}
                        withSeconds={false}
                        disabled={registerSaving}
                      />
                    </Flex>
                  ) : null}
                  <TextInput
                    label="Tên khách"
                    placeholder="Họ và tên"
                    value={registerCustomerName}
                    onChange={(event) => setRegisterCustomerName(event.currentTarget.value)}
                    disabled={registerSaving}
                  />
                  <TextInput
                    label="Số điện thoại"
                    placeholder="09..."
                    inputMode="tel"
                    value={registerCustomerPhone}
                    onChange={(event) => setRegisterCustomerPhone(event.currentTarget.value)}
                    disabled={registerSaving}
                  />
                  <GuestCountNumberInput
                    label="Số khách"
                    required
                    value={registerGuestCount}
                    onChange={(value) => setRegisterGuestCount(value ?? 1)}
                    max={
                      registerMergeGroup
                        ? getMergeGroupEffectiveGuestCapacity(registerMergeGroup.totalCapacity)
                        : registerTable!.seats > 0
                          ? getTableEffectiveGuestCapacity(registerTable!.seats)
                          : undefined
                    }
                    disabled={registerSaving}
                  />
                  <Select
                    label="Loại khách"
                    placeholder="Chọn loại khách"
                    data={BOOKING_GUEST_TYPE_OPTIONS.map((label) => ({ value: label, label }))}
                    value={registerGuestType}
                    onChange={setRegisterGuestType}
                    allowDeselect={false}
                    disabled={registerSaving}
                  />
                  <Textarea
                    label="Ghi chú"
                    placeholder="Tùy chọn"
                    value={registerNote}
                    onChange={(event) => setRegisterNote(event.currentTarget.value)}
                    autosize
                    minRows={2}
                    disabled={registerSaving}
                  />
                  <Group justify="flex-end" gap={8}>
                    <Button variant="default" disabled={registerSaving} onClick={closeRegistrationPanel}>
                      Hủy
                    </Button>
                    <Button
                      loading={registerSaving}
                      disabled={
                        registerSaving ||
                        !hasSupabase ||
                        isLoading ||
                        registerImmediateBlocked ||
                        (!registerMergeGroup && registerTableSlotConflicts.length > 0)
                      }
                      onClick={() => void handleRegisterCustomer()}
                    >
                      Tạo booking
                    </Button>
                  </Group>
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="assign" pt="sm">
                <Stack gap="sm">
                  {registerMergeGroup &&
                  (mergeGroupStatusById.get(registerMergeGroup.id) ?? "available") ===
                    "hold" &&
                  !mergeGroupPrimaryGuestHasArrived(
                    registerMergeGroup.id,
                    bookingsForFloorTableDisplay
                  ) ? (
                    <Text size="xs" c="dimmed">
                      Khách cụm chưa đến — có thể gán booking chờ vào từng bàn thành viên trên sơ
                      đồ, hoặc gán vào cả cụm bên dưới.
                    </Text>
                  ) : null}
                  <RegisterPendingAssignTable
                    records={pendingBookings}
                    tableId={registerMergeGroup ? undefined : registerTable!.id}
                    tableSeats={
                      registerMergeGroup
                        ? undefined
                        : getTableEffectiveGuestCapacity(registerTable!.seats)
                    }
                    mergeGroup={registerMergeGroup ?? undefined}
                    selectedBookings={registerPendingSelected}
                    onSelectedBookingsChange={setRegisterPendingSelected}
                    onNavigateToBookingList={confirmNavigateToDayBookingList}
                    disabled={registerSaving}
                  />
                  <Group justify="flex-end" gap={8}>
                    <Button
                      variant="default"
                      disabled={registerSaving}
                      onClick={closeRegistrationPanel}
                    >
                      Hủy
                    </Button>
                    <Button
                      variant="light"
                      loading={registerSaving}
                      disabled={
                        registerSaving ||
                        !hasSupabase ||
                        isLoading ||
                        (registerPendingAssignPlan?.assignable.length ?? 0) === 0
                      }
                      onClick={() => void handleAssignPendingBookings()}
                    >
                      {(registerPendingAssignPlan?.assignable.length ?? 0) > 1
                        ? `Gán ${registerPendingAssignPlan?.assignable.length} booking`
                        : "Gán booking chờ"}
                    </Button>
                  </Group>
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        ) : null}
      </Modal>

      <TableBlockDetailModal
        opened={Boolean(detailTable || detailMergeGroup)}
        onClose={closeDetailModal}
        table={detailTable}
        mergeGroup={detailMergeGroup}
        mergeStatus={detailMergeGroupStatus}
        blockState={detailTableBlockState}
        blockLoading={detailTableBlockLoading}
        activeBooking={activeBookingForDetail}
        activeBookingCustomerName={activeBookingCustomerName}
        isEmployee={isEmployee}
        bookingActionLoading={detailBookingActionLoading}
        waitlistConfirmLoadingId={detailWaitlistActionId}
        onNewBooking={() => {
          if (detailMergeGroup) {
            openNewBookingForMergeGroup(detailMergeGroup);
          } else if (detailTable) {
            openNewBookingForTable(detailTable);
          }
        }}
        onAssignPending={() => {
          if (detailMergeGroup) {
            openAssignPendingForMergeGroup(detailMergeGroup);
          } else if (detailTable) {
            openAssignPendingForTable(detailTable);
          }
        }}
        onCheckIn={() => void handleDetailCheckIn()}
        onComplete={() => void handleDetailComplete()}
        onCancelBooking={openDetailCancelBookingConfirm}
        onConfirmWaitlistOffer={(entryId: string) => void handleConfirmWaitlistOffer(entryId)}
      />

      <Modal
        opened={mergeModalOpen}
        onClose={() => setMergeModalOpen(false)}
        title="Gộp bàn"
        size="md"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Chọn ít nhất 2 bàn trong cùng khu vực. Hệ thống tự đặt tên là &quot;Bàn gộp N&quot; theo
            thứ tự nhỏ nhất chưa dùng trong khu vực.
          </Text>
          <MultiSelect
            label="Bàn thành viên"
            data={mergeTableOptions}
            value={mergeSelectedTableIds}
            onChange={setMergeSelectedTableIds}
            searchable
            hidePickedOptions
            placeholder="Chọn từ 2 bàn trở lên"
          />
          {mergeSelectedTableIds.length > 0 ? (
            <Text size="xs" c="dimmed">
              Tổng sức chứa dự kiến:{" "}
              {mergeCandidateTables
                .filter((table) => mergeSelectedTableIds.includes(table.id))
                .reduce((sum, table) => sum + table.seats, 0)}{" "}
              chỗ.
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setMergeModalOpen(false)}>
              Hủy
            </Button>
            <Button
              loading={mergeSaving}
              disabled={mergeSelectedTableIds.length < 2}
              onClick={() => void handleCreateMergeGroup(mergeSelectedTableIds)}
            >
              Tạo cụm gộp
            </Button>
          </Group>
        </Stack>
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
          <GuestCountNumberInput
            label="Sức chứa"
            required
            value={areaEditCapacity}
            onChange={(value) => setAreaEditCapacity(value ?? 1)}
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

      <MergeGroupDetailModal
        groupId={openedMergeGroupId}
        mergeGroups={effectiveMergeGroups}
        tables={state.tables}
        bookings={state.bookings}
        customers={state.customers}
        pendingBookings={pendingBookings}
        currentUserId={currentUser?.id}
        isEditMode={isEditMode}
        onClose={() => setOpenedMergeGroupId(null)}
        onRequestRelease={(groupId) => setReleaseMergeGroupId(groupId)}
        onRequestRemoveMember={async (groupId, tableId) => {
          const result = await removeTableFromMergeGroup({ groupId, tableId });
          notifications.show({
            color: result.ok ? "green" : "red",
            message: result.message,
          });
        }}
        onAssignPendingBooking={async (booking, group) => {
          const result = await assignBookingToTable({
            bookingId: booking.id,
            areaId: group.areaId,
            tableId: null,
            mergeGroupId: group.id,
            guestCount: booking.guestCount,
          });
          notifications.show({
            color: result.ok ? "green" : "red",
            message: result.message,
          });
        }}
      />

      <CreateBookingModal
        opened={createBookingModalOpened}
        onClose={() => setCreateBookingModalOpened(false)}
        onFocusExistingBooking={(booking) => {
          calendarPanelRef.current?.openDayListModalForBooking(booking);
        }}
      />

      <Modal
        opened={releaseMergeGroupId !== null}
        onClose={() => setReleaseMergeGroupId(null)}
        title="Bỏ gộp bàn"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Hệ thống sẽ cố gắng chuyển các booking đang giữ cụm này về bàn lẻ phù hợp. Nếu có booking
            vượt quá sức chứa của mọi bàn thành viên (over-exceed) và chưa kết thúc / huỷ / no-show,
            thao tác sẽ bị chặn.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setReleaseMergeGroupId(null)}>
              Huỷ
            </Button>
            <Button
              color="red"
              loading={mergeSaving}
              onClick={() => {
                if (releaseMergeGroupId) {
                  void handleReleaseMergeGroup(releaseMergeGroupId);
                }
              }}
            >
              Bỏ gộp
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}

interface MergeGroupDetailModalProps {
  groupId: string | null;
  mergeGroups: TableMergeGroup[];
  tables: DiningTable[];
  bookings: Booking[];
  customers: Customer[];
  pendingBookings: Booking[];
  currentUserId?: string | null;
  isEditMode: boolean;
  onClose: () => void;
  onRequestRelease: (groupId: string) => void;
  onRequestRemoveMember: (groupId: string, tableId: string) => Promise<void>;
  onAssignPendingBooking: (booking: Booking, group: TableMergeGroup) => Promise<void>;
}

function MergeGroupDetailModal({
  groupId,
  mergeGroups,
  tables,
  bookings,
  customers,
  pendingBookings,
  currentUserId: _currentUserId,
  isEditMode,
  onClose,
  onRequestRelease,
  onRequestRemoveMember,
  onAssignPendingBooking,
}: MergeGroupDetailModalProps) {
  const group = useMemo(
    () => mergeGroups.find((candidate) => candidate.id === groupId) ?? null,
    [mergeGroups, groupId]
  );
  const memberTables = useMemo(() => {
    if (!group) {
      return [];
    }
    return group.tableIds
      .map((tableId) => tables.find((table) => table.id === tableId))
      .filter((table): table is DiningTable => Boolean(table));
  }, [group, tables]);
  const groupBookings = useMemo(() => {
    if (!group) {
      return [];
    }
    return bookings
      .filter(
        (booking) =>
          booking.mergeGroupId === group.id &&
          !["completed", "cancelled", "no_show"].includes(booking.status)
      )
      .sort((a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf());
  }, [bookings, group]);
  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of customers) {
      map.set(customer.id, customer);
    }
    return map;
  }, [customers]);
  const [removingTableId, setRemovingTableId] = useState<string | null>(null);
  if (!group) {
    return null;
  }
  return (
    <Modal opened={Boolean(groupId)} onClose={onClose} title={group.mergedName} size="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            <Text size="sm" c="dimmed">
              Tổng sức chứa
            </Text>
            <Text fw={600}>{group.totalCapacity} chỗ</Text>
          </Stack>
          {isEditMode ? (
            <Button color="red" variant="light" onClick={() => onRequestRelease(group.id)}>
              Bỏ gộp
            </Button>
          ) : null}
        </Group>
        <Divider label="Bàn thành viên" labelPosition="left" />
        <Stack gap="xs">
          {memberTables.map((table) => (
            <Group key={table.id} justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text size="sm" fw={500}>
                  {table.name}
                </Text>
                <Text size="xs" c="dimmed">
                  {table.seats} ghế
                </Text>
              </Stack>
              <Tooltip
                label={
                  memberTables.length <= 2
                    ? "Cụm cần ít nhất 2 bàn — bỏ tiếp sẽ tự huỷ cụm."
                    : "Tách bàn khỏi cụm"
                }
              >
                <ActionIcon
                  variant="subtle"
                  color="red"
                  loading={removingTableId === table.id}
                  onClick={async () => {
                    setRemovingTableId(table.id);
                    try {
                      await onRequestRemoveMember(group.id, table.id);
                    } finally {
                      setRemovingTableId(null);
                    }
                  }}
                >
                  <X size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ))}
        </Stack>
        <Divider label={`Booking đang giữ (${groupBookings.length})`} labelPosition="left" />
        {groupBookings.length === 0 ? (
          <Text size="sm" c="dimmed">
            Hiện không có booking nào đang dùng cụm này.
          </Text>
        ) : (
          <Stack gap="xs">
            {groupBookings.map((booking) => {
              const customer = booking.customerId ? customerMap.get(booking.customerId) : undefined;
              return (
                <Group key={booking.id} justify="space-between" wrap="nowrap">
                  <Stack gap={0}>
                    <Text size="sm" fw={500}>
                      {customer?.fullName ?? "Khách lẻ"}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {dayjs(booking.bookingAt).format("DD/MM HH:mm")} · {booking.guestCount} khách
                    </Text>
                  </Stack>
                  <Badge variant="light">{booking.status}</Badge>
                </Group>
              );
            })}
          </Stack>
        )}
        <MergeGroupAssignablePending
          group={group}
          pendingBookings={pendingBookings}
          customers={customers}
          onAssign={onAssignPendingBooking}
        />
      </Stack>
    </Modal>
  );
}

function MergeGroupAssignablePending({
  group,
  pendingBookings,
  customers,
  onAssign,
}: {
  group: TableMergeGroup;
  pendingBookings: Booking[];
  customers: Customer[];
  onAssign: (booking: Booking, group: TableMergeGroup) => Promise<void>;
}) {
  const candidates = useMemo(
    () =>
      pendingBookings
        .filter(
          (booking) =>
            booking.branchId === group.branchId &&
            (booking.areaId === group.areaId || !booking.areaId) &&
            booking.guestCount <= getMergeGroupEffectiveGuestCapacity(group.totalCapacity)
        )
        .slice(0, 8),
    [group, pendingBookings]
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  if (candidates.length === 0) {
    return null;
  }
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  return (
    <>
      <Divider
        label={`Booking pending phù hợp (${candidates.length})`}
        labelPosition="left"
      />
      <Stack gap="xs">
        {candidates.map((booking) => {
          const customer = booking.customerId ? customerMap.get(booking.customerId) : undefined;
          return (
            <Group key={booking.id} justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text size="sm" fw={500}>
                  {customer?.fullName ?? "Khách lẻ"}
                </Text>
                <Text size="xs" c="dimmed">
                  {dayjs(booking.bookingAt).format("DD/MM HH:mm")} · {booking.guestCount} khách
                </Text>
              </Stack>
              <Button
                size="xs"
                variant="light"
                loading={busyId === booking.id}
                onClick={async () => {
                  setBusyId(booking.id);
                  try {
                    await onAssign(booking, group);
                  } finally {
                    setBusyId(null);
                  }
                }}
              >
                Gán vào cụm
              </Button>
            </Group>
          );
        })}
      </Stack>
    </>
  );
}
