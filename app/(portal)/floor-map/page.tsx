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
import { DatePickerInput } from "@mantine/dates";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import dayjs from "dayjs";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Calendar,
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
  BookingDayListModal,
  type BookingDayListModalHandle,
} from "@/components/booking-management/booking-day-list-modal";
import { BookingOrderDetailModal } from "@/components/booking-management/booking-order-detail-modal";
import {
  BookingCreatedNextStepModal,
  type BookingCreatedNextStepPayload,
} from "@/components/booking-management/booking-created-next-step-modal";
import { CreateBookingModal } from "@/components/booking-management/create-booking-modal";
import { useBookingManagement } from "@/components/booking-management/use-booking-management";
import { MergeGroupsPanel } from "@/components/merge-groups/merge-groups-panel";
import { ChangeBookingTableModal } from "@/components/floor-map/change-booking-table-modal";
import { FloorLayoutTemplatesModal } from "@/components/floor-map/floor-layout-templates-modal";
import { FloorMapGrid } from "@/components/floor-map/floor-map-grid";
import { FloorTableBlockView } from "@/components/floor-map/floor-table-block-view";
import { RegisterPendingAssignTable } from "@/components/floor-map/register-pending-assign-table";
import { TableBlockDetailModal } from "@/components/floor-map/table-block-detail-modal";
import {
  VoiceBookingAssistant,
  type VoiceBookingFormFields,
} from "@/components/voice-booking/VoiceBookingAssistant";
import {
  DUPLICATE_BOOKING_CODE,
  isPlausibleVietnamPhone,
  normalizeVietnamPhone,
} from "@/lib/booking-duplicate";
import { formatVietnamesePersonName } from "@/lib/voice-booking/format";

const emptyRegisterVoiceFields = (): VoiceBookingFormFields => ({
  customerName: "",
  customerPhone: "",
  guestCount: null,
  bookingAt: dayjs().add(1, "hour").format("YYYY-MM-DDTHH:mm"),
  areaId: null,
  tableId: null,
  mergeGroupId: null,
  note: "",
  guestType: "Khách thường",
});
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { PortalSectionCard } from "@/components/portal-page";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { useAppContext } from "@/contexts/app-context";
import { bookingRowBusyStyle } from "@/lib/busy-row-style";
import { useBusyId } from "@/lib/use-busy-id";
import { usePortalCompact } from "@/lib/use-portal-compact";
import {
  clampFloorNodeSpacing,
  estimateFloorTableBlockHeightPx,
  FLOOR_DEFAULT_NODE_SPACING_PX,
  FLOOR_NODE_SPACING_MAX_PX,
  FLOOR_NODE_SPACING_MIN_PX,
  FLOOR_TABLE_BLOCK_EDIT_HEIGHT_PX,
  FLOOR_TABLE_BLOCK_HEIGHT_PX,
  FLOOR_TABLE_BLOCK_WIDTH_PX,
  FLOOR_TABLE_PALETTE_SENTINEL,
} from "@/lib/floor-map-layout";
import {
  buildFloorMapRglGridConfig,
  floorMapTablesToRglLayout,
  gridCellCenterPx,
  nearestGridCellFromWorldPx,
} from "@/lib/floor-map-rgl";
import { computeMergeGroupBboxes } from "@/lib/floor-map-merge-bbox";
import type { EventCallback, Layout, LayoutItem } from "react-grid-layout";
import {
  findMergeStripAnchorForMemberCells,
  packMergeGroupTablePositions,
  resolveMergeGroupLayoutAtAnchor,
  resolveTableDropAtCell,
} from "@/lib/floor-map-merge-layout";
import {
  isFloorLayoutRealtimeReloadBlocked,
  setFloorLayoutRealtimeReloadBlocked,
} from "@/lib/floor-layout-sync";
import {
  buildFloorMapHref,
  FLOOR_MAP_DATE_PARAM,
  FLOOR_MAP_FOCUS_BOOKING_PARAM,
  parseFloorMapDateParam,
} from "@/lib/floor-map-routes";
import { openPortalConfirmModal } from "@/lib/portal-confirm-modal";
import {
  applySnapshotToTablesInArea,
  floorLayoutDayKey,
  type AreaFloorLayoutByDate,
} from "@/lib/floor-layout-snapshot";
import {
  resolveFloorLayoutForDate,
  resolvedLayoutToSnapshot,
} from "@/lib/floor-layout-resolve";
import {
  filterBookingsForFloorLayoutDate,
  floorDayBookingsSnapshotEqual,
  floorMapDayBookingsCacheKey,
  mergeFloorDayBookingsWithGlobal,
  patchFloorDayBookingInSlice,
  patchFloorDayBookingsFromRealtime,
  pruneFloorMapDayCacheRecord,
} from "@/lib/floor-map-day-bookings";
import { normalizeRealtimePayload } from "@/lib/realtime-booking-row";
import { getSupabaseBrowserClient, isSupabaseRealtimeConfigured } from "@/lib/supabase";
import {
  bookingStatusColor,
  bookingStatusLabel,
  tableStatusColor,
  tableStatusLabel,
} from "@/lib/display";
import {
  BOOKING_GUEST_TYPE_OPTIONS,
  displayCustomerPhone,
  findAssignableSlotConflictsAtTable,
  formatTableSlotConflictMessage,
  getAssignableCandidateTables,
  pickNonOverlappingBookingsForMergeGroup,
  pickNonOverlappingBookingsForTable,
  deriveMergeGroupStatusFromDayBookings,
  deriveMergeMemberTableStatusFromDayBookings,
  listOccupiedMergeMemberTableNames,
  MERGE_GROUP_CHECK_IN_BLOCKED_BY_MEMBER_OCCUPIED,
  pickPrimaryBookingOnTableForFloorDisplay,
  deriveTableStatusFromDayBookings,
  hasAssignableSlotConflictAtMergeGroup,
  isGuestCountSpecified,
  mergeGroupHasBookingOnDay,
  mergeGroupPrimaryGuestHasArrived,
  pickPrimaryBookingOnMergeGroup,
  pickPrimaryBookingOnTable,
  tableHasActiveBookingOnFloorDay,
} from "@/lib/booking-meta";
import {
  formatMergeGroupDate,
  formatMergeGroupDateRange,
  isMergeGroupEffectiveOnDate,
  isMergeGroupExpired,
  resolveMergeGroupNavigationDate,
  validateMergeGroupDateRange,
} from "@/lib/merge-group-utils";
import {
  filterTablesForFloorMapDay,
  isSplitCloneEffectiveOnDate,
  isSplitCloneTable,
} from "@/lib/table-split-clone-utils";
import {
  fetchFloorMapDayBookings,
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

const MERGE_GROUP_HEADER_TABLE_GAP_PX = 6;
/** Matches `.mergeGroupContainer` dashed border width — header sits inside the frame. */
const MERGE_GROUP_FRAME_BORDER_PX = 2;

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
      {isGuestCountSpecified(displayBooking) ? (
        <Text size="xs" fw={700} lineClamp={1}>
          {displayBooking.guestCount} khách
        </Text>
      ) : null}
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
const TOUCH_PINCH_FACTOR = 0.005;
/** Inset the fitted region slightly inside the viewport so edges are not flush with the frame. */
const FIT_VIEWPORT_MARGIN = 0.94;
/** World-space padding around the union of table blocks when fitting (px). */
const FIT_TABLE_BOUNDS_PADDING = 40;
const TAP_PLACE_THRESHOLD_PX = 14;
/** How long the merge/split instruction alert stays visible on the canvas (ms). */
const GRID_TABLE_ACTION_HINT_MS = 3000;
const GRID_TABLE_ACTION_HINT_ID = "floor-map-grid-table-action-hint";

function isTableBlockTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el?.closest) {
    return false;
  }
  return Boolean(
    el.closest(".react-grid-item") ||
      el.closest("[data-table-block]") ||
      el.closest("[data-table-status-menu]") ||
      el.closest("[data-register-panel]")
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

/** Union of axis-aligned rects for rendered table blocks (aligned with react-grid-layout cells). */
function getPlacedTableBounds(
  placedTables: DiningTable[],
  gridColumns: number,
  gridRows: number,
  rglGridConfig: ReturnType<typeof buildFloorMapRglGridConfig>,
  positionByTableId: Map<string, { row: number; col: number }>
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (placedTables.length === 0) {
    return null;
  }
  const halfW = FLOOR_TABLE_BLOCK_WIDTH_PX / 2;
  const halfH = FLOOR_TABLE_BLOCK_HEIGHT_PX / 2;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const table of placedTables) {
    const pos =
      positionByTableId.get(table.id) ??
      getTableGridPosition(table, gridColumns, gridRows);
    const center = gridCellCenterPx(pos.col, pos.row, rglGridConfig);
    minX = Math.min(minX, center.x - halfW);
    maxX = Math.max(maxX, center.x + halfW);
    minY = Math.min(minY, center.y - halfH);
    maxY = Math.max(maxY, center.y + halfH);
  }
  return { minX, minY, maxX, maxY };
}

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
      return { ...group, tableIds };
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
    changeBookingTable,
    updateBookingStatus,
    checkInBooking,
    currentUser,
    isLoading,
    hasSupabase,
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
    updateArea,
    deleteArea,
    reload,
    createTableMergeGroup,
    createTableSplitClone,
    addTableToMergeGroup,
    removeTableFromMergeGroup,
    releaseTableMergeGroup,
    updateTableMergeGroupDates,
  } = useAppContext();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const [mergeGroupDragState, setMergeGroupDragState] = useState<MergeGroupDragState | null>(
    null
  );
  const [filtersAccordionValue, setFiltersAccordionValue] = useState<string | null>(null);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [isDatePickerDockOpen, setIsDatePickerDockOpen] = useState(true);
  const [isGridToolsDockOpen, setIsGridToolsDockOpen] = useState(false);
  const [pendingPlacementTableId, setPendingPlacementTableId] = useState<string | null>(null);
  const [isTrimmingGrid, setIsTrimmingGrid] = useState(false);
  const [layoutLockHolderName, setLayoutLockHolderName] = useState<string | null>(null);
  const [areaEditOpen, setAreaEditOpen] = useState(false);
  const [areaEditBranchId, setAreaEditBranchId] = useState("");
  const [areaEditName, setAreaEditName] = useState("");
  const [areaEditSaving, setAreaEditSaving] = useState(false);
  const [areaDeleteOpen, setAreaDeleteOpen] = useState(false);
  const [areaDeleteLoading, setAreaDeleteLoading] = useState(false);
  const [editLayout, setEditLayout] = useState<FloorEditLayout | null>(null);
  const [isSavingLayout, setIsSavingLayout] = useState(false);
  const [dayLayoutByKey, setDayLayoutByKey] = useState<
    Record<string, AreaFloorLayoutByDate | null | undefined>
  >({});
  const [loadedDayBookingsByKey, setLoadedDayBookingsByKey] = useState<
    Record<string, Booking[] | undefined>
  >({});
  const [loadedDayCustomersByKey, setLoadedDayCustomersByKey] = useState<
    Record<string, Customer[] | undefined>
  >({});
  const [layoutTemplatesOpen, setLayoutTemplatesOpen] = useState(false);
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
  const [registerVoiceFields, setRegisterVoiceFields] = useState<VoiceBookingFormFields>(
    emptyRegisterVoiceFields
  );
  const [dayListDetailBooking, setDayListDetailBooking] = useState<Booking | null>(null);
  const {
    bookingManagementModals,
    isBookingRowBusy,
    openEditBookingModal,
    openAssignOptions,
    setChangeTableBooking: setMgmtChangeTableBooking,
    runCheckIn,
    openCompleteBookingConfirm,
    openCancelBookingConfirm,
  } = useBookingManagement();
  const { isBusy: isTableStatusBusy, run: runTableStatusAction } = useBusyId();
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeGroupsListModalOpen, setMergeGroupsListModalOpen] = useState(false);
  const [mergeGroupReleaseBusyId, setMergeGroupReleaseBusyId] = useState<string | null>(null);
  /** Grid-view merge/split picking before the date confirmation modal. */
  const [gridTableActionMode, setGridTableActionMode] = useState<"merge" | "split" | null>(null);
  /** Tables selected on the grid for view-mode "Gộp bàn". */
  const [mergeSelectedTableIds, setMergeSelectedTableIds] = useState<string[]>([]);
  const [mergeStartDate, setMergeStartDate] = useState<string | null>(() =>
    formatMergeGroupDate(dayjs())
  );
  const [mergeEndDate, setMergeEndDate] = useState<string | null>(() =>
    formatMergeGroupDate(dayjs())
  );
  const [mergeSaving, setMergeSaving] = useState(false);
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitSelectedTableId, setSplitSelectedTableId] = useState<string | null>(null);
  const [splitStartDate, setSplitStartDate] = useState<string | null>(() =>
    formatMergeGroupDate(dayjs())
  );
  const [splitEndDate, setSplitEndDate] = useState<string | null>(() =>
    formatMergeGroupDate(dayjs())
  );
  const [splitSaving, setSplitSaving] = useState(false);
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
  const [detailBookingActionLoading, setDetailBookingActionLoading] = useState(false);
  const [changeTableBooking, setChangeTableBooking] = useState<Booking | null>(null);
  /** Status menu uses portal — block canvas interaction while open */
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [floorMapSelectedDate, setFloorMapSelectedDate] = useState(() => dayjs());
  const [createBookingModalOpened, setCreateBookingModalOpened] = useState(false);
  const [registerCreatedNextStep, setRegisterCreatedNextStep] =
    useState<BookingCreatedNextStepPayload | null>(null);
  const [registerCreatedNextStepOpened, setRegisterCreatedNextStepOpened] = useState(false);
  const consumedFloorFocusBookingRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gridTableActionMode) {
      notifications.hide(GRID_TABLE_ACTION_HINT_ID);
      return;
    }
    const title = gridTableActionMode === "merge" ? "Đang gộp bàn" : "Đang tách bàn";
    const message =
      gridTableActionMode === "merge"
        ? "Chọn ít nhất 2 bàn trên sơ đồ, sau đó nhấn Xác nhận ở thanh dưới."
        : "Chọn một bàn trên sơ đồ, sau đó nhấn Xác nhận ở thanh dưới.";
    notifications.show({
      id: GRID_TABLE_ACTION_HINT_ID,
      title,
      message,
      color: "blue",
      autoClose: GRID_TABLE_ACTION_HINT_MS,
    });
    return () => {
      notifications.hide(GRID_TABLE_ACTION_HINT_ID);
    };
  }, [gridTableActionMode]);

  useEffect(() => {
    const dateFromUrl = parseFloorMapDateParam(searchParams.get(FLOOR_MAP_DATE_PARAM));
    if (dateFromUrl) {
      setFloorMapSelectedDate(dateFromUrl);
    }
  }, [searchParams]);

  const blockCanvasForOverlay =
    Boolean(registerTable || registerMergeGroup || detailTable || detailMergeGroup) ||
    statusMenuOpen;
  const isEditMode = mode === "edit";
  const editBlockedByOther = Boolean(layoutLockHolderName);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dayListModalRef = useRef<BookingDayListModalHandle | null>(null);
  const focusBookingIdFromUrl = searchParams.get(FLOOR_MAP_FOCUS_BOOKING_PARAM);
  useEffect(() => {
    if (
      !focusBookingIdFromUrl ||
      consumedFloorFocusBookingRef.current === focusBookingIdFromUrl
    ) {
      return;
    }
    const booking = state.bookings.find((item) => item.id === focusBookingIdFromUrl);
    if (!booking) {
      return;
    }
    consumedFloorFocusBookingRef.current = focusBookingIdFromUrl;
    const date = dayjs(booking.bookingAt);
    setFloorMapSelectedDate(date);
    router.replace(buildFloorMapHref(date));
  }, [focusBookingIdFromUrl, router, state.bookings]);
  const panStateRef = useRef<PanState | null>(null);
  const placementTapRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const paletteDragTableIdRef = useRef<string | null>(null);
  const [paletteDroppingItem, setPaletteDroppingItem] = useState<LayoutItem | null>(null);
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
  const dayFetchGenerationRef = useRef(0);

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
  const selectedLayoutDate = formatMergeGroupDate(floorMapSelectedDate);
  const floorDayCacheKey = floorMapDayBookingsCacheKey(filteredBranchIds, selectedLayoutDate);
  const loadedDayBookings = loadedDayBookingsByKey[floorDayCacheKey];
  const loadedDayCustomers = loadedDayCustomersByKey[floorDayCacheKey] ?? [];
  const dayLayoutCacheKey = areaId ? floorLayoutDayKey(areaId, selectedLayoutDate) : null;
  const cachedDayLayout =
    dayLayoutCacheKey !== null ? dayLayoutByKey[dayLayoutCacheKey] : undefined;

  const setCurrentDayLayoutCache = useCallback(
    (row: AreaFloorLayoutByDate | null | undefined) => {
      if (!dayLayoutCacheKey) {
        return;
      }
      setDayLayoutByKey({ [dayLayoutCacheKey]: row });
    },
    [dayLayoutCacheKey]
  );

  const refreshDayLayout = useCallback(async () => {
    if (!areaId || !hasSupabase || !dayLayoutCacheKey) {
      return null;
    }
    setCurrentDayLayoutCache(undefined);
    const row = await fetchAreaFloorLayoutForDate(areaId, selectedLayoutDate);
    setCurrentDayLayoutCache(row);
    return row;
  }, [
    areaId,
    dayLayoutCacheKey,
    fetchAreaFloorLayoutForDate,
    hasSupabase,
    selectedLayoutDate,
    setCurrentDayLayoutCache,
  ]);

  const syncEditLayoutFromDayOverride = useCallback(
    (dayOverride: AreaFloorLayoutByDate | null) => {
      if (!areaId) {
        return;
      }
      const area = state.areas.find((a) => a.id === areaId);
      const tablesInAreaDraft = state.tables.filter((x) => x.areaId === areaId);
      const resolved = resolveFloorLayoutForDate({
        area: area ?? {
          id: areaId,
          branchId: "",
          name: "",
          floorGridColumns: DEFAULT_GRID_COLUMNS,
          floorGridRows: DEFAULT_GRID_ROWS,
          floorNodeSpacing: FLOOR_DEFAULT_NODE_SPACING_PX,
        },
        tablesInArea: tablesInAreaDraft,
        dayOverride,
      });
      setEditLayout({
        gridColumns: resolved.floorGridColumns,
        gridRows: resolved.floorGridRows,
        nodeSpacing: resolved.floorNodeSpacing,
        positions: { ...resolved.positions },
        pendingMergeAdds: [],
        pendingMergeRemoves: [],
      });
    },
    [areaId, state.areas, state.tables]
  );

  useEffect(() => {
    if (!areaId || !hasSupabase || !dayLayoutCacheKey) {
      setDayLayoutByKey({});
      return;
    }
    let cancelled = false;
    setDayLayoutByKey((prev) => ({ ...prev, [dayLayoutCacheKey]: undefined }));
    void fetchAreaFloorLayoutForDate(areaId, selectedLayoutDate).then((row) => {
      if (!cancelled) {
        setDayLayoutByKey((prev) => ({ ...prev, [dayLayoutCacheKey]: row }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [areaId, dayLayoutCacheKey, fetchAreaFloorLayoutForDate, hasSupabase, selectedLayoutDate]);

  useEffect(() => {
    setLoadedDayBookingsByKey((prev) =>
      pruneFloorMapDayCacheRecord(prev, filteredBranchIds, selectedLayoutDate)
    );
    setLoadedDayCustomersByKey((prev) =>
      pruneFloorMapDayCacheRecord(prev, filteredBranchIds, selectedLayoutDate)
    );
  }, [filteredBranchIds, selectedLayoutDate]);

  useEffect(() => {
    if (!hasSupabase || filteredBranchIds.length === 0) {
      return;
    }
    let cancelled = false;
    const generation = ++dayFetchGenerationRef.current;
    setLoadedDayBookingsByKey((prev) => {
      const pruned = pruneFloorMapDayCacheRecord(prev, filteredBranchIds, selectedLayoutDate);
      if (pruned[floorDayCacheKey] !== undefined) {
        return pruned;
      }
      return { ...pruned, [floorDayCacheKey]: undefined };
    });
    void fetchFloorMapDayBookings(filteredBranchIds, selectedLayoutDate)
      .then((slice) => {
        if (cancelled || generation !== dayFetchGenerationRef.current) {
          return;
        }
        setLoadedDayBookingsByKey((prev) =>
          pruneFloorMapDayCacheRecord(
            { ...prev, [floorDayCacheKey]: slice.bookings },
            filteredBranchIds,
            selectedLayoutDate
          )
        );
        setLoadedDayCustomersByKey((prev) =>
          pruneFloorMapDayCacheRecord(
            { ...prev, [floorDayCacheKey]: slice.customers },
            filteredBranchIds,
            selectedLayoutDate
          )
        );
      })
      .catch(() => {
        if (!cancelled && generation === dayFetchGenerationRef.current) {
          setLoadedDayBookingsByKey((prev) =>
            pruneFloorMapDayCacheRecord(
              { ...prev, [floorDayCacheKey]: [] },
              filteredBranchIds,
              selectedLayoutDate
            )
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filteredBranchIds, floorDayCacheKey, hasSupabase, selectedLayoutDate]);

  useEffect(() => {
    setLoadedDayBookingsByKey((prev) => {
      const current = prev[floorDayCacheKey];
      if (current === undefined) {
        return prev;
      }
      const next = mergeFloorDayBookingsWithGlobal(
        current,
        state.bookings,
        selectedLayoutDate,
        filteredBranchIds
      );
      if (floorDayBookingsSnapshotEqual(current, next)) {
        return prev;
      }
      return pruneFloorMapDayCacheRecord(
        { ...prev, [floorDayCacheKey]: next },
        filteredBranchIds,
        selectedLayoutDate
      );
    });
  }, [filteredBranchIds, floorDayCacheKey, selectedLayoutDate, state.bookings]);

  const patchFloorDayBookingOptimistic = useCallback(
    (bookingId: string, patch: Partial<Booking>) => {
      setLoadedDayBookingsByKey((prev) => {
        const current = prev[floorDayCacheKey];
        if (current === undefined) {
          return prev;
        }
        const next = patchFloorDayBookingInSlice(current, bookingId, patch);
        if (!next) {
          return prev;
        }
        return pruneFloorMapDayCacheRecord(
          { ...prev, [floorDayCacheKey]: next },
          filteredBranchIds,
          selectedLayoutDate
        );
      });
    },
    [filteredBranchIds, floorDayCacheKey, selectedLayoutDate]
  );

  const hasRealtime = isSupabaseRealtimeConfigured();

  useEffect(() => {
    if (!hasSupabase || !hasRealtime || filteredBranchIds.length === 0) {
      return;
    }
    let cancelled = false;
    const realtime = getSupabaseBrowserClient();
    if (!realtime) {
      return;
    }

    const applyBookingChange = (payload: unknown) => {
      if (cancelled || isFloorLayoutRealtimeReloadBlocked()) {
        return;
      }
      const normalized = normalizeRealtimePayload(payload);
      setLoadedDayBookingsByKey((prev) => {
        const current = prev[floorDayCacheKey] ?? [];
        const next = patchFloorDayBookingsFromRealtime(
          current,
          normalized,
          selectedLayoutDate,
          filteredBranchIds
        );
        if (!next) {
          return prev;
        }
        return pruneFloorMapDayCacheRecord(
          { ...prev, [floorDayCacheKey]: next },
          filteredBranchIds,
          selectedLayoutDate
        );
      });
    };

    const channelName = `floor-map-day-bookings:${floorDayCacheKey}`;
    let channel = realtime.channel(channelName);
    if (filteredBranchIds.length === 0) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        applyBookingChange
      );
    } else {
      for (const branchId of filteredBranchIds) {
        channel = channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "bookings",
            filter: `branch_id=eq.${branchId}`,
          },
          applyBookingChange
        );
      }
    }

    const bookingChannel = channel.subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn(`[realtime] ${channelName} status=${status}`);
      }
    });

    return () => {
      cancelled = true;
      void realtime.removeChannel(bookingChannel);
    };
  }, [
    filteredBranchIds,
    floorDayCacheKey,
    hasRealtime,
    hasSupabase,
    selectedLayoutDate,
  ]);

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

  const floorMapDayBookings = useMemo(() => {
    if (loadedDayBookings === undefined) {
      return filterBookingsForFloorLayoutDate(
        state.bookings,
        selectedLayoutDate,
        filteredBranchIds
      );
    }
    return mergeFloorDayBookingsWithGlobal(
      loadedDayBookings,
      state.bookings,
      selectedLayoutDate,
      filteredBranchIds
    );
  }, [filteredBranchIds, loadedDayBookings, selectedLayoutDate, state.bookings]);

  const bookingsForFloorTableDisplay = floorMapDayBookings;

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

  const registerFormBranchId =
    registerTable?.branchId ?? registerMergeGroup?.branchId ?? null;

  const registerFormBranch = useMemo(() => {
    if (!registerFormBranchId) {
      return null;
    }
    const branch = state.branches.find((item) => item.id === registerFormBranchId);
    return branch ? { id: branch.id, name: branch.name } : null;
  }, [registerFormBranchId, state.branches]);

  const registerVoiceAreas = useMemo(() => {
    if (!registerFormBranchId) {
      return [];
    }
    return state.areas
      .filter(
        (area) =>
          area.branchId === registerFormBranchId && filteredBranchIds.includes(area.branchId)
      )
      .map((area) => ({ id: area.id, name: area.name }));
  }, [filteredBranchIds, registerFormBranchId, state.areas]);

  const registerVoiceTables = useMemo(() => {
    if (!registerFormBranchId) {
      return [];
    }
    return state.tables
      .filter(
        (table) =>
          table.branchId === registerFormBranchId && filteredBranchIds.includes(table.branchId)
      )
      .map((table) => ({
        id: table.id,
        name: table.name,
        areaId: table.areaId,
        status: table.status,
      }));
  }, [filteredBranchIds, registerFormBranchId, state.tables]);

  const registerDefaultBookingAt = useMemo(() => {
    if (registerArrivalMode !== "hold" || !registerBookingDate || !registerBookingTime) {
      return null;
    }
    const [hour, minute] = registerBookingTime.split(":").map((value) => Number(value) || 0);
    return dayjs(registerBookingDate, "YYYY-MM-DD")
      .hour(hour)
      .minute(minute)
      .second(0)
      .millisecond(0)
      .format("YYYY-MM-DDTHH:mm");
  }, [registerArrivalMode, registerBookingDate, registerBookingTime]);

  const registerBookingCandidate = useMemo((): Booking | null => {
    if (!registerTable) {
      return null;
    }
    let startIso: string | null = null;
    if (registerArrivalMode === "immediate") {
      startIso = dayjs().toISOString();
    } else if (registerVoiceFields.bookingAt) {
      startIso = dayjs(registerVoiceFields.bookingAt).toISOString();
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
      guestCount: Math.max(
        1,
        Number(
          registerVoiceFields.guestCount ??
            registerGuestCount ??
            1
        )
      ),
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
    registerVoiceFields.bookingAt,
    registerVoiceFields.guestCount,
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

  const pendingBookings = useMemo(
    () =>
      floorMapDayBookings
        .filter((b) => b.status === "pending")
        .sort((a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()),
    [floorMapDayBookings]
  );
  const seatedTableIdsOnFloorDay = useMemo(() => {
    const ids = new Set<string>();
    for (const booking of floorMapDayBookings) {
      if (booking.status !== "seated" || !booking.tableId) {
        continue;
      }
      ids.add(booking.tableId);
    }
    return ids;
  }, [floorMapDayBookings]);

  /** Active groups across all areas — used to exclude already-merged tables from new-merge candidates. */
  const allActiveMergedTableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const group of state.mergeGroups) {
      if (group.status !== "active") {
        continue;
      }
      if (!isMergeGroupEffectiveOnDate(group, floorMapSelectedDate)) {
        continue;
      }
      for (const tableId of group.tableIds) {
        ids.add(tableId);
      }
    }
    return ids;
  }, [floorMapSelectedDate, state.mergeGroups]);

  const mergeCandidateTables = useMemo(() => {
    if (!areaId) {
      return [];
    }
    return state.tables
      .filter(
        (table) =>
          table.areaId === areaId &&
          table.status !== "locked" &&
          !isSplitCloneTable(table) &&
          !seatedTableIdsOnFloorDay.has(table.id) &&
          !allActiveMergedTableIds.has(table.id)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [allActiveMergedTableIds, areaId, seatedTableIdsOnFloorDay, state.tables]);

  const splitCandidateTables = useMemo(() => {
    if (!areaId) {
      return [];
    }
    return state.tables
      .filter(
        (table) =>
          table.areaId === areaId &&
          table.status !== "locked" &&
          !isSplitCloneTable(table) &&
          !seatedTableIdsOnFloorDay.has(table.id) &&
          !allActiveMergedTableIds.has(table.id)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "vi"));
  }, [allActiveMergedTableIds, areaId, seatedTableIdsOnFloorDay, state.tables]);

  const mergeCandidateTableIds = useMemo(
    () => new Set(mergeCandidateTables.map((table) => table.id)),
    [mergeCandidateTables]
  );

  const splitCandidateTableIds = useMemo(
    () => new Set(splitCandidateTables.map((table) => table.id)),
    [splitCandidateTables]
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
        group.areaId === areaId &&
        isMergeGroupEffectiveOnDate(group, floorMapSelectedDate)
    );
  }, [activeAreaBranchId, areaId, floorMapSelectedDate, state.mergeGroups]);

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

  useEffect(() => {
    const id = detailMergeGroup?.id;
    if (!id) {
      return;
    }
    const fresh = state.mergeGroups.find((group) => group.id === id);
    if (!fresh) {
      setDetailMergeGroup(null);
      return;
    }
    const prevIds = detailMergeGroup.tableIds.join(",");
    const nextIds = fresh.tableIds.join(",");
    if (
      prevIds !== nextIds ||
      fresh.mergedName !== detailMergeGroup.mergedName ||
      fresh.startDate !== detailMergeGroup.startDate ||
      fresh.endDate !== detailMergeGroup.endDate
    ) {
      setDetailMergeGroup(fresh);
    }
  }, [state.mergeGroups, detailMergeGroup]);

  // Reset edit-mode selection when leaving edit mode or switching areas.
  useEffect(() => {
    if (!isEditMode) {
      setEditSelectedTableIds([]);
      setMergeGroupDragState(null);
    } else {
      setGridTableActionMode(null);
      setMergeSelectedTableIds([]);
      setSplitSelectedTableId(null);
      setMergeModalOpen(false);
      setSplitModalOpen(false);
    }
  }, [isEditMode]);

  // Search/filter is view-only; grid tools are edit-only.
  useEffect(() => {
    if (isEditMode) {
      setSearch("");
      setStatusFilter("all");
      setFiltersAccordionValue(null);
    } else {
      setIsGridToolsDockOpen(false);
    }
  }, [isEditMode]);
  useEffect(() => {
    setEditSelectedTableIds([]);
    setGridTableActionMode(null);
    setMergeSelectedTableIds([]);
    setSplitSelectedTableId(null);
    setMergeModalOpen(false);
    setSplitModalOpen(false);
  }, [areaId]);

  const closeDetailModal = () => {
    setDetailTable(null);
    setDetailMergeGroup(null);
    setDetailTableBlockState(null);
    setDetailTableBlockLoading(false);
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
              error instanceof Error ? error.message : "Không tải được lịch bàn.",
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
    const booking = activeBookingForDetail;
    if (!booking) {
      return;
    }
    if (booking.status !== "confirmed") {
      return;
    }
    if (
      detailMergeGroup &&
      detailMergeMemberOccupiedTableNames.length > 0
    ) {
      notifications.show({
        color: "yellow",
        message: MERGE_GROUP_CHECK_IN_BLOCKED_BY_MEMBER_OCCUPIED,
      });
      return;
    }
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    const checkedInAt = dayjs().toISOString();
    const revertPatch = {
      status: booking.status,
      checkedInAt: booking.checkedInAt,
    };
    const checkInPromise = checkInBooking(booking.id, booking);
    patchFloorDayBookingOptimistic(booking.id, {
      status: "seated",
      checkedInAt,
    });
    closeDetailModal();
    void checkInPromise
      .then(() => {
        notifications.show({ color: "green", message: "Đã check-in." });
      })
      .catch((error: unknown) => {
        patchFloorDayBookingOptimistic(booking.id, revertPatch);
        notifications.show({
          color: "red",
          message: error instanceof Error ? error.message : "Check-in thất bại.",
        });
      });
  };

  const handleDetailComplete = async () => {
    const booking = activeBookingForDetail;
    if (!booking) {
      return;
    }
    if (booking.status !== "checked_in" && booking.status !== "seated") {
      return;
    }
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    const revertPatch = {
      status: booking.status,
      checkedInAt: booking.checkedInAt,
    };
    const completePromise = updateBookingStatus(booking.id, "completed", booking);
    patchFloorDayBookingOptimistic(booking.id, {
      status: "completed",
      checkedInAt: undefined,
    });
    closeDetailModal();
    void completePromise
      .then(() => {
        notifications.show({ color: "green", message: "Đã hoàn thành booking." });
      })
      .catch((error: unknown) => {
        patchFloorDayBookingOptimistic(booking.id, revertPatch);
        notifications.show({
          color: "red",
          message: error instanceof Error ? error.message : "Không hoàn thành được booking.",
        });
      });
  };

  const openChangeTableForActiveBooking = () => {
    if (!activeBookingForDetail) {
      return;
    }
    setChangeTableBooking(activeBookingForDetail);
  };

  const handleSubmitChangeTable = (target: { areaId: string; tableId: string }) => {
    const booking = changeTableBooking;
    if (!booking) {
      return;
    }
    const editedAt = dayjs().toISOString();
    const revertPatch = {
      areaId: booking.areaId,
      tableId: booking.tableId,
      mergeGroupId: booking.mergeGroupId,
      lastEditedAt: booking.lastEditedAt,
    };
    const optimisticPatch = {
      areaId: target.areaId,
      tableId: target.tableId,
      mergeGroupId: null as string | null,
      lastEditedAt: editedAt,
    };
    const changePromise = changeBookingTable({
      bookingId: booking.id,
      areaId: target.areaId,
      tableId: target.tableId,
      seedBooking: booking,
    });
    patchFloorDayBookingOptimistic(booking.id, optimisticPatch);
    setChangeTableBooking(null);
    closeDetailModal();
    void changePromise.then((result) => {
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (!result.ok) {
        patchFloorDayBookingOptimistic(booking.id, revertPatch);
      }
    });
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
    if (!areaId || isLoading || mode !== "view" || !activeArea) {
      return;
    }
    if (cachedDayLayout === undefined) {
      return;
    }
    const dayOverride =
      cachedDayLayout === null || cachedDayLayout === undefined ? null : cachedDayLayout;
    const resolved = resolveFloorLayoutForDate({
      area: activeArea,
      tablesInArea: state.tables.filter((t) => t.areaId === areaId),
      dayOverride: dayOverride ?? null,
    });
    setGridColumns(resolved.floorGridColumns);
    setGridRows(resolved.floorGridRows);
    setNodeSpacing(clampFloorNodeSpacing(resolved.floorNodeSpacing));
  }, [activeArea, areaId, cachedDayLayout, isLoading, mode, state.tables]);

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
    const tablesInAreaDraft = state.tables.filter((x) => x.areaId === areaId);
    const dayOverride =
      cachedDayLayout && cachedDayLayout !== undefined ? cachedDayLayout : null;
    const resolved = resolveFloorLayoutForDate({
      area: area ?? {
        id: areaId,
        branchId: "",
        name: "",
        floorGridColumns: DEFAULT_GRID_COLUMNS,
        floorGridRows: DEFAULT_GRID_ROWS,
        floorNodeSpacing: FLOOR_DEFAULT_NODE_SPACING_PX,
      },
      tablesInArea: tablesInAreaDraft,
      dayOverride,
    });
    setEditLayout({
      gridColumns: resolved.floorGridColumns,
      gridRows: resolved.floorGridRows,
      nodeSpacing: resolved.floorNodeSpacing,
      positions: { ...resolved.positions },
      pendingMergeAdds: [],
      pendingMergeRemoves: [],
    });
    // Draft snapshot only when entering edit; remote updates handled after save.
  }, [
    cachedDayLayout,
    mode,
    areaId,
    state.areas,
    state.tables,
    releaseFloorLayoutEditLock,
  ]);

  useEffect(() => {
    if (!resyncEditLayoutAfterSaveRef.current || mode !== "edit" || !areaId) {
      return;
    }
    resyncEditLayoutAfterSaveRef.current = false;
    void refreshDayLayout().then(() => {
      const area = state.areas.find((a) => a.id === areaId);
      const tablesInAreaDraft = state.tables.filter((x) => x.areaId === areaId);
      const key = floorLayoutDayKey(areaId, selectedLayoutDate);
      const dayOverride = dayLayoutByKey[key] ?? null;
      const resolved = resolveFloorLayoutForDate({
        area: area ?? {
          id: areaId,
          branchId: "",
          name: "",
          floorGridColumns: DEFAULT_GRID_COLUMNS,
          floorGridRows: DEFAULT_GRID_ROWS,
          floorNodeSpacing: FLOOR_DEFAULT_NODE_SPACING_PX,
        },
        tablesInArea: tablesInAreaDraft,
        dayOverride,
      });
      setEditLayout({
        gridColumns: resolved.floorGridColumns,
        gridRows: resolved.floorGridRows,
        nodeSpacing: resolved.floorNodeSpacing,
        positions: { ...resolved.positions },
        pendingMergeAdds: [],
        pendingMergeRemoves: [],
      });
    });
  }, [
    areaId,
    dayLayoutByKey,
    mode,
    refreshDayLayout,
    selectedLayoutDate,
    state.areas,
    state.tables,
  ]);

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
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[realtime] floor-layout-locks:${areaId} status=${status}`);
        }
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
    if (!areaId || !hasSupabase) {
      return;
    }
    let cancelled = false;
    const realtime = getSupabaseBrowserClient();
    const layoutChannelName = `floor-layout-by-date:${areaId}`;
    const syncDayLayout = () => {
      if (cancelled || isFloorLayoutRealtimeReloadBlocked()) {
        return;
      }
      void refreshDayLayout();
    };
    const fallbackId = setInterval(syncDayLayout, 30_000);
    const layoutChannel = realtime
      ?.channel(layoutChannelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "area_floor_layout_by_date",
          filter: `area_id=eq.${areaId}`,
        },
        syncDayLayout
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn(`[realtime] ${layoutChannelName} status=${status}`);
        }
        if (
          status === "SUBSCRIBED" ||
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          syncDayLayout();
        }
      });
    return () => {
      cancelled = true;
      clearInterval(fallbackId);
      if (realtime && layoutChannel) {
        void realtime.removeChannel(layoutChannel);
      }
    };
  }, [areaId, hasSupabase, refreshDayLayout]);

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
    () =>
      filterTablesForFloorMapDay(
        state.tables.filter((table) => table.areaId === areaId),
        floorMapSelectedDate
      ),
    [areaId, floorMapSelectedDate, state.tables]
  );

  const resolvedLayout = useMemo(() => {
    if (!activeArea) {
      return {
        floorGridColumns: DEFAULT_GRID_COLUMNS,
        floorGridRows: DEFAULT_GRID_ROWS,
        floorNodeSpacing: FLOOR_DEFAULT_NODE_SPACING_PX,
        positions: {} as Record<string, { x: number; y: number }>,
        hasDayOverride: false,
        sourceTemplateId: null,
      };
    }
    const dayOverride =
      cachedDayLayout && cachedDayLayout !== undefined ? cachedDayLayout : null;
    return resolveFloorLayoutForDate({
      area: activeArea,
      tablesInArea,
      dayOverride,
    });
  }, [activeArea, cachedDayLayout, tablesInArea]);

  const currentLayoutSnapshot = useMemo(
    () =>
      resolvedLayoutToSnapshot(
        isEditMode && editLayout
          ? {
              floorGridColumns: editLayout.gridColumns,
              floorGridRows: editLayout.gridRows,
              floorNodeSpacing: editLayout.nodeSpacing,
              positions: editLayout.positions,
              hasDayOverride: resolvedLayout.hasDayOverride,
              sourceTemplateId: resolvedLayout.sourceTemplateId,
            }
          : resolvedLayout,
        tablesInArea
      ),
    [editLayout, isEditMode, resolvedLayout, tablesInArea]
  );

  const layoutTablesInArea = useMemo(() => {
    if (isEditMode && editLayout) {
      return tablesInArea.map((t) => {
        const p = editLayout.positions[t.id];
        if (!p) {
          return t;
        }
        return { ...t, positionX: p.x, positionY: p.y };
      });
    }
    return applySnapshotToTablesInArea(tablesInArea, resolvedLayout.positions);
  }, [isEditMode, editLayout, resolvedLayout.positions, tablesInArea]);

  const floorMapDisplayTables = useMemo(() => {
    const tableToMergeGroup = new Map<string, string>();
    for (const group of effectiveMergeGroups) {
      for (const tableId of group.tableIds) {
        tableToMergeGroup.set(tableId, group.id);
      }
    }
    return layoutTablesInArea.map((table) => {
      const mergeGroupId = tableToMergeGroup.get(table.id);
      const status = mergeGroupId
        ? deriveMergeMemberTableStatusFromDayBookings(
            table,
            mergeGroupId,
            floorMapDayBookings
          )
        : deriveTableStatusFromDayBookings(table, floorMapDayBookings);
      return { ...table, status };
    });
  }, [effectiveMergeGroups, floorMapDayBookings, layoutTablesInArea]);

  const detailMergeMemberOccupiedTableNames = useMemo(() => {
    if (!detailMergeGroup) {
      return [] as string[];
    }
    return listOccupiedMergeMemberTableNames(
      detailMergeGroup,
      floorMapDisplayTables,
      floorMapDayBookings
    );
  }, [detailMergeGroup, floorMapDayBookings, floorMapDisplayTables]);

  const tablesForFloorView = isEditMode ? layoutTablesInArea : floorMapDisplayTables;

  const customerById = useMemo(() => {
    const map = new Map(state.customers.map((customer) => [customer.id, customer]));
    for (const customer of loadedDayCustomers) {
      map.set(customer.id, customer);
    }
    return map;
  }, [loadedDayCustomers, state.customers]);

  const primaryBookingByTableId = useMemo(() => {
    const tableToMergeGroup = new Map<string, string>();
    for (const group of effectiveMergeGroups) {
      for (const tableId of group.tableIds) {
        tableToMergeGroup.set(tableId, group.id);
      }
    }
    const map = new Map<string, Booking | null>();
    for (const table of tablesForFloorView) {
      const mergeGroupId = tableToMergeGroup.get(table.id);
      map.set(
        table.id,
        pickPrimaryBookingOnTableForFloorDisplay(table.id, bookingsForFloorTableDisplay, {
          excludeMergeGroupId: mergeGroupId,
        })
      );
    }
    return map;
  }, [bookingsForFloorTableDisplay, effectiveMergeGroups, tablesForFloorView]);

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

  const registerImmediateBlocked =
    (registerMergeGroup
      ? (mergeGroupStatusById.get(registerMergeGroup.id) ?? "available") === "occupied"
      : registerTable?.status === "occupied") && registerArrivalMode === "immediate";

  const effectiveGridColumns =
    isEditMode && editLayout ? editLayout.gridColumns : gridColumns;
  const effectiveGridRows = isEditMode && editLayout ? editLayout.gridRows : gridRows;
  const effectiveNodeSpacing = isEditMode && editLayout ? editLayout.nodeSpacing : nodeSpacing;

  const rglGridConfig = useMemo(
    () =>
      buildFloorMapRglGridConfig(
        effectiveGridColumns,
        effectiveGridRows,
        effectiveNodeSpacing
      ),
    [effectiveGridColumns, effectiveGridRows, effectiveNodeSpacing]
  );

  const isLayoutDirty = useMemo(() => {
    if (!isEditMode || !editLayout || !areaId) {
      return false;
    }
    if (
      editLayout.gridColumns !== resolvedLayout.floorGridColumns ||
      editLayout.gridRows !== resolvedLayout.floorGridRows ||
      editLayout.nodeSpacing !== resolvedLayout.floorNodeSpacing
    ) {
      return true;
    }
    for (const t of tablesInArea) {
      const baseline = resolvedLayout.positions[t.id];
      const p = editLayout.positions[t.id];
      if (!p || !baseline || p.x !== baseline.x || p.y !== baseline.y) {
        return true;
      }
    }
    if (editLayout.pendingMergeAdds.length > 0 || editLayout.pendingMergeRemoves.length > 0) {
      return true;
    }
    return false;
  }, [isEditMode, editLayout, areaId, resolvedLayout, tablesInArea]);

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
   * Effective row/col of each visible table on the canvas — accounts for in-progress merge-group drags.
   */
  const effectiveTablePositions = useMemo(() => {
    const result = new Map<string, { row: number; col: number }>();
    for (const table of placedTables) {
      const mapped = getTableGridPosition(table, effectiveGridColumns, effectiveGridRows);
      result.set(table.id, { row: mapped.row, col: mapped.col });
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
        const preview = resolveMergeGroupLayoutAtAnchor({
          memberTableIds: memberIds,
          anchorRow: mergeGroupDragState.anchorRow,
          anchorCol: mergeGroupDragState.anchorCol,
          areaTables: buildAreaTablesForMergePack(tablesInArea, editLayout.positions),
          gridColumns: effectiveGridColumns,
          gridRows: effectiveGridRows,
        });
        if (preview) {
          for (const [tableId, pos] of preview.positions) {
            result.set(tableId, pos);
          }
        }
      }
    }
    return result;
  }, [
    editLayout,
    effectiveGridColumns,
    effectiveGridRows,
    effectiveMergeGroups,
    mergeGroupDragState,
    placedTables,
    tablesInArea,
  ]);

  const rglLayoutItems = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    for (const table of placedTables) {
      const pos = effectiveTablePositions.get(table.id);
      if (!pos) {
        continue;
      }
      positions[table.id] = { x: pos.col, y: pos.row };
    }
    return floorMapTablesToRglLayout(
      placedTables.map((table) => table.id),
      positions,
      {
        isEditMode,
        mergeMemberIds: allActiveMergedTableIds,
        gridColumns: effectiveGridColumns,
        gridRows: effectiveGridRows,
      }
    );
  }, [
    allActiveMergedTableIds,
    effectiveGridColumns,
    effectiveGridRows,
    effectiveTablePositions,
    isEditMode,
    placedTables,
  ]);

  /**
   * Geometry for each active merge-group bbox in the current area.
   * Computed once per (groups, layout, drag) change; pixel coords are relative to the canvas content layer.
   */
  const mergeBBoxes = useMemo(() => {
    if (effectiveMergeGroups.length === 0) {
      return [];
    }
    const halfW = FLOOR_TABLE_BLOCK_WIDTH_PX / 2;
    const tableById = new Map(placedTables.map((table) => [table.id, table]));
    const bboxTableById = new Map<
      string,
      {
        id: string;
        centerX: number;
        centerY: number;
        halfWidth: number;
        halfHeight: number;
      }
    >();

    for (const group of effectiveMergeGroups) {
      const mergeGroupBooking = !isEditMode
        ? (primaryBookingByMergeGroupId.get(group.id) ?? null)
        : null;
      for (const tableId of group.tableIds) {
        const pos = effectiveTablePositions.get(tableId);
        if (!pos) {
          continue;
        }
        const table = tableById.get(tableId);
        if (!table) {
          continue;
        }
        const center = gridCellCenterPx(pos.col, pos.row, rglGridConfig);
        const tableBooking = isEditMode
          ? null
          : (primaryBookingByTableId.get(tableId) ?? null);
        const hideBookingPeek = Boolean(mergeGroupBooking && !tableBooking);
        const showBookingPeek = !hideBookingPeek && tableBooking != null;
        const showCheckInLine =
          showBookingPeek &&
          tableBooking != null &&
          (tableBooking.status === "checked_in" || tableBooking.status === "seated") &&
          Boolean(tableBooking.checkedInAt);
        const tableHeight = isEditMode
          ? FLOOR_TABLE_BLOCK_EDIT_HEIGHT_PX
          : estimateFloorTableBlockHeightPx({
              showBookingPeek,
              showCheckInLine,
              showSplitCloneAvailability:
                isSplitCloneTable(table) &&
                Boolean(table.splitStartDate && table.splitEndDate) &&
                isSplitCloneEffectiveOnDate(table, floorMapSelectedDate),
            });
        const halfH = tableHeight / 2;
        bboxTableById.set(tableId, {
          id: tableId,
          centerX: center.x,
          centerY: center.y,
          halfWidth: halfW,
          halfHeight: halfH,
        });
      }
    }

    return computeMergeGroupBboxes({
      groups: effectiveMergeGroups,
      tableById: bboxTableById,
      compactHeader: false,
      groupHasBookingOnDay: (groupId) =>
        mergeGroupHasBookingOnDay(groupId, floorMapDayBookings),
    });
  }, [
    effectiveTablePositions,
    effectiveMergeGroups,
    floorMapDayBookings,
    floorMapSelectedDate,
    isEditMode,
    mergeGroupDragState,
    placedTables,
    primaryBookingByMergeGroupId,
    primaryBookingByTableId,
    rglGridConfig,
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
      return;
    }
    if (tableToMergeGroupId.has(tableId)) {
      return;
    }
    const current = getTableGridPosition(source, effectiveGridColumns, effectiveGridRows);
    if (current.row === row && current.col === col) {
      return;
    }
    setEditLayout((prev) => {
      if (!prev) {
        return prev;
      }
      const dropLayout = resolveTableDropAtCell({
        tableId: source.id,
        targetRow: row,
        targetCol: col,
        areaTables: buildAreaTablesForMergePack(tablesInArea, prev.positions),
        gridColumns: effectiveGridColumns,
        gridRows: effectiveGridRows,
        protectedTableIds: allActiveMergedTableIds,
      });
      if (!dropLayout.ok) {
        return prev;
      }
      const nextPositions = { ...prev.positions };
      for (const [id, pos] of dropLayout.positions) {
        nextPositions[id] = { x: pos.col, y: pos.row };
      }
      return { ...prev, positions: nextPositions };
    });
  };

  const commitPlacement = (tableId: string, row: number, col: number) => {
    const source = tableMap[tableId];
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

  const exitEditModeToView = useCallback(() => {
    setMode("view");
    setPendingPlacementTableId(null);
    setFiltersAccordionValue(null);
    setIsGridToolsDockOpen(false);
    setMergeGroupDragState(null);
    if (areaId) {
      void releaseFloorLayoutEditLock(areaId);
    }
  }, [areaId, releaseFloorLayoutEditLock]);

  const confirmDiscardLayoutEdits = useCallback(() => {
    modals.openConfirmModal({
      title: "Thay đổi chưa lưu",
      centered: true,
      children: (
        <Text size="sm">Bỏ các thay đổi sơ đồ chưa lưu?</Text>
      ),
      labels: { cancel: "Tiếp tục sửa", confirm: "Bỏ thay đổi" },
      confirmProps: { color: "red" },
      onConfirm: exitEditModeToView,
    });
  }, [exitEditModeToView]);

  const handleSaveFloorLayoutAsGlobal = async () => {
    if (!areaId || !editLayout || !isLayoutDirty) {
      return;
    }
    setIsSavingLayout(true);
    try {
      const layoutInput = (() => {
        const tablePositions = tablesInArea.map((t) => {
          const p = editLayout.positions[t.id];
          return {
            tableId: t.id,
            x: p?.x ?? t.positionX,
            y: p?.y ?? t.positionY,
          };
        });
        return {
          floorGridColumns: editLayout.gridColumns,
          floorGridRows: editLayout.gridRows,
          floorNodeSpacing: editLayout.nodeSpacing,
          tablePositions,
        };
      })();

      // 1) Save global (default) layout: updates areas grid + tables positions.
      await saveFloorLayout(areaId, layoutInput);

      // 2) Keep current date consistent for the user.
      // - If the existing per-day override was merge-managed, converting it via day-save keeps edits visible.
      // - If it was a manual override, delete it so this date uses the newly saved global layout.
      if (resolvedLayout.hasDayOverride) {
        const mergeGroupId = cachedDayLayout?.mergeGroupId ?? null;
        if (mergeGroupId) {
          await saveFloorLayout(areaId, layoutInput, { layoutDate: selectedLayoutDate });
        } else {
          const dateLabel = floorMapSelectedDate.format("DD/MM/YYYY");
          const confirmed = await openPortalConfirmModal({
            title: "Xóa sơ đồ riêng theo ngày",
            message: `Lưu sơ đồ mặc định và xóa sơ đồ riêng cho ngày ${dateLabel}?`,
            confirmLabel: "Lưu và xóa",
            confirmColor: "red",
          });
          if (!confirmed) {
            return;
          }
          await deleteAreaFloorLayoutForDate(areaId, selectedLayoutDate);
          if (dayLayoutCacheKey) {
            setCurrentDayLayoutCache(null);
          }
        }
      }

      // 3) Apply any pending merge membership changes (positions repack is disabled).
      for (const remove of editLayout.pendingMergeRemoves) {
        const result = await removeTableFromMergeGroup({
          groupId: remove.groupId,
          tableId: remove.tableId,
          repackFloor: false,
          layoutDate: selectedLayoutDate,
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
          layoutDate: selectedLayoutDate,
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
            ? "Đã lưu sơ đồ mặc định và thay đổi bàn gộp."
            : "Đã lưu sơ đồ mặc định.",
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
      const savedDay = await saveFloorLayout(
        areaId,
        {
          floorGridColumns: editLayout.gridColumns,
          floorGridRows: editLayout.gridRows,
          floorNodeSpacing: editLayout.nodeSpacing,
          tablePositions,
        },
        { layoutDate: selectedLayoutDate }
      );
      if (savedDay && dayLayoutCacheKey) {
        setCurrentDayLayoutCache(savedDay);
      } else {
        await refreshDayLayout();
      }

      for (const remove of editLayout.pendingMergeRemoves) {
        const result = await removeTableFromMergeGroup({
          groupId: remove.groupId,
          tableId: remove.tableId,
          repackFloor: false,
          layoutDate: selectedLayoutDate,
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
          layoutDate: selectedLayoutDate,
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
            ? `Đã lưu sơ đồ cho ngày ${floorMapSelectedDate.format("DD/MM/YYYY")} và thay đổi bàn gộp.`
            : `Đã lưu sơ đồ cho ngày ${floorMapSelectedDate.format("DD/MM/YYYY")}.`,
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

  const handleTableBlockComplete = async (table: DiningTable) => {
    const booking = pickPrimaryBookingOnTable(table.id, bookingsForFloorTableDisplay);
    if (
      !booking ||
      (booking.status !== "checked_in" && booking.status !== "seated")
    ) {
      notifications.show({
        color: "yellow",
        message: "Chỉ hoàn thành khi khách đã vào bàn hoặc đã check-in.",
      });
      return;
    }
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    if (isTableStatusBusy(table.id)) {
      return;
    }
    await runTableStatusAction(table.id, async () => {
      try {
        await updateBookingStatus(booking.id, "completed");
        notifications.show({ color: "green", message: "Đã hoàn thành booking." });
        if (detailTable?.id === table.id) {
          closeDetailModal();
        }
      } catch (error) {
        notifications.show({
          color: "red",
          message: error instanceof Error ? error.message : "Không hoàn thành được booking.",
        });
      }
    });
  };

  const handleMergeGroupBlockComplete = async (group: TableMergeGroup) => {
    const booking = pickPrimaryBookingOnMergeGroup(group.id, bookingsForFloorTableDisplay);
    if (
      !booking ||
      (booking.status !== "checked_in" && booking.status !== "seated")
    ) {
      notifications.show({
        color: "yellow",
        message: "Chỉ hoàn thành khi khách đã vào bàn hoặc đã check-in.",
      });
      return;
    }
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    const busyMemberId = group.tableIds.find((tableId) => isTableStatusBusy(tableId));
    if (busyMemberId) {
      return;
    }
    await runTableStatusAction(group.id, async () => {
      try {
        await updateBookingStatus(booking.id, "completed");
        notifications.show({ color: "green", message: "Đã hoàn thành booking." });
        if (detailMergeGroup?.id === group.id) {
          closeDetailModal();
        }
      } catch (error) {
        notifications.show({
          color: "red",
          message: error instanceof Error ? error.message : "Không hoàn thành được booking.",
        });
      }
    });
  };

  const handleTableBlockLock = async (table: DiningTable) => {
    if (tableHasActiveBookingOnFloorDay(table.id, floorMapDayBookings)) {
      notifications.show({
        color: "yellow",
        message: "Không thể khóa bàn khi còn booking trong ngày đang xem.",
      });
      return;
    }
    const persisted = state.tables.find((item) => item.id === table.id);
    if (persisted?.status === "locked") {
      return;
    }
    await handleStatusChange(table, "locked");
  };

  const handleTableBlockUnlock = async (table: DiningTable) => {
    if (table.status !== "locked") {
      return;
    }
    await handleStatusChange(table, "available");
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
    setRegisterVoiceFields(emptyRegisterVoiceFields());
  }, []);

  const openAssignPendingForTable = (table: DiningTable) => {
    panStateRef.current = null;
    placementTapRef.current = null;
    setDetailTable(null);
    setDetailMergeGroup(null);
    setDetailTableBlockState(null);
    setDetailTableBlockLoading(false);
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
    setRegisterGuestCount(1);
    setRegisterNote("");
    setRegisterGuestType("Khách thường");
    setRegisterCustomerName("");
    setRegisterCustomerPhone("");
    setRegisterPendingSelected([]);
    setRegisterModalTab("book");
    setRegisterVoiceFields({
      ...emptyRegisterVoiceFields(),
      guestCount: 1,
    });

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
    setRegisterGuestCount(1);
    setRegisterNote("");
    setRegisterGuestType("Khách thường");
    setRegisterCustomerName("");
    setRegisterCustomerPhone("");
    setRegisterPendingSelected([]);
    setRegisterModalTab("book");
    setRegisterVoiceFields({
      ...emptyRegisterVoiceFields(),
      guestCount: 1,
      areaId: table.areaId,
      tableId: table.id,
    });

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
    const memberTableBooking = pickPrimaryBookingOnTableForFloorDisplay(
      table.id,
      bookingsForFloorTableDisplay,
      { excludeMergeGroupId: memberMergeGroupId }
    );
    if (memberMergeGroup && mergeGuestArrived && !memberTableBooking) {
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
    const { customerName, customerPhone, guestCount, bookingAt, note, guestType } =
      registerVoiceFields;
    if (!registerTarget || !customerName.trim()) {
      notifications.show({
        color: "red",
        message: "Vui lòng nhập tên khách.",
      });
      return;
    }
    const normalizedRegisterPhone = normalizeVietnamPhone(customerPhone.trim());
    if (normalizedRegisterPhone && !isPlausibleVietnamPhone(normalizedRegisterPhone)) {
      notifications.show({
        color: "red",
        message:
          "Số điện thoại không đúng định dạng Việt Nam (ví dụ 0912345678, +84912345678).",
      });
      return;
    }
    const nextGuestCount = Math.max(1, Number(guestCount ?? registerGuestCount ?? 1));
    if (registerArrivalMode === "hold" && !bookingAt) {
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
      const now = dayjs();
      let holdAt = dayjs(bookingAt!);

      // Giữ chỗ must be strictly in the future so it is not auto-seated as Ngồi ngay.
      if (!holdAt.isAfter(now)) {
        if (holdAt.isSame(now, "minute")) {
          holdAt = now.add(1, "minute");
        } else {
          notifications.show({
            color: "red",
            message: "Giữ chỗ cần thời gian đến sau thời điểm hiện tại.",
          });
          return;
        }
      }

      bookingAtIso = holdAt.toISOString();
    }
    const arrivalIntent = registerArrivalMode === "immediate" ? "immediate" : "hold";
    const runCreate = async (allowDuplicate?: boolean) => {
      const result = await createBooking({
        customerName: formatVietnamesePersonName(customerName.trim()),
        customerPhone: normalizedRegisterPhone || undefined,
        branchId: registerTarget.branchId,
        areaId: registerTarget.areaId,
        tableId: registerMergeGroup ? null : registerTable!.id,
        mergeGroupId: registerMergeGroup?.id ?? null,
        guestCount: nextGuestCount,
        bookingAt: bookingAtIso,
        note: note.trim() || undefined,
        guestType,
        arrivalIntent,
        allowDuplicate,
      });
      if (!result.ok && result.code === DUPLICATE_BOOKING_CODE && result.duplicates?.length) {
        notifications.show({ color: "orange", message: result.message });
        confirmDuplicateBookingSecond(result.duplicates, () => {
          void runCreate(true);
        });
        return;
      }
      if (!result.ok) {
        notifications.show({ color: "red", message: result.message });
      } else if (!result.bookingId) {
        notifications.show({ color: "green", message: result.message });
      }
      if (result.ok) {
        closeRegistrationPanel();
        if (result.bookingId) {
          setRegisterCreatedNextStep({
            bookingId: result.bookingId,
            bookingAt: bookingAtIso,
            customerName: formatVietnamesePersonName(customerName.trim()),
            message: result.message,
          });
          setRegisterCreatedNextStepOpened(true);
        }
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
      state.bookings
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
          ? "Không có booking nào trong lựa chọn có thể gán (trùng giờ trên cụm)."
          : "Không có booking nào trong lựa chọn có thể gán (trùng giờ trên bàn).",
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
        plan.skippedSelectionOverlap.length + plan.skippedTableConflict.length;
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

  useEffect(() => {
    const day = formatMergeGroupDate(floorMapSelectedDate);
    setMergeStartDate(day);
    setMergeEndDate(day);
    setSplitStartDate(day);
    setSplitEndDate(day);
  }, [floorMapSelectedDate]);

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
    const blockedMergeTable = uniqueIds
      .map((tableId) => state.tables.find((table) => table.id === tableId))
      .find((table) => table && seatedTableIdsOnFloorDay.has(table.id));
    if (blockedMergeTable) {
      notifications.show({
        color: "yellow",
        message: `Không thể gộp khi ${blockedMergeTable.name} đã có khách ngồi.`,
      });
      return;
    }
    if (!mergeStartDate || !mergeEndDate) {
      notifications.show({ color: "red", message: "Vui lòng chọn ngày bắt đầu và ngày kết thúc." });
      return;
    }
    const startDate = formatMergeGroupDate(mergeStartDate);
    const endDate = formatMergeGroupDate(mergeEndDate);
    const dateCheck = validateMergeGroupDateRange({
      startDate,
      endDate,
    });
    if (!dateCheck.ok) {
      notifications.show({ color: "red", message: dateCheck.message });
      return;
    }
    setMergeSaving(true);
    try {
      const result = await createTableMergeGroup({
        branchId: activeAreaBranchId,
        areaId,
        tableIds: uniqueIds,
        startDate,
        endDate,
        layoutDate: selectedLayoutDate,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setMergeModalOpen(false);
        setGridTableActionMode(null);
        setMergeSelectedTableIds([]);
        setEditSelectedTableIds([]);
        const dayRow =
          result.dayLayout !== undefined
            ? result.dayLayout
            : await refreshDayLayout();
        if (result.dayLayout !== undefined) {
          setCurrentDayLayoutCache(result.dayLayout);
        }
        if (isEditMode) {
          syncEditLayoutFromDayOverride(dayRow);
        }
      }
    } finally {
      setMergeSaving(false);
    }
  };

  const handleCreateSplitClone = async (sourceTableId: string) => {
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    if (!areaId) {
      notifications.show({ color: "red", message: "Vui lòng chọn khu vực trước khi tách bàn." });
      return;
    }
    if (!sourceTableId) {
      notifications.show({ color: "red", message: "Vui lòng chọn bàn cần tách." });
      return;
    }
    if (seatedTableIdsOnFloorDay.has(sourceTableId)) {
      const tableName =
        state.tables.find((table) => table.id === sourceTableId)?.name ?? "Bàn đã chọn";
      notifications.show({
        color: "yellow",
        message: `Không thể tách bàn khi ${tableName} đã có khách ngồi.`,
      });
      return;
    }
    if (!splitStartDate || !splitEndDate) {
      notifications.show({ color: "red", message: "Vui lòng chọn ngày bắt đầu và ngày kết thúc." });
      return;
    }
    const startDate = formatMergeGroupDate(splitStartDate);
    const endDate = formatMergeGroupDate(splitEndDate);
    const dateCheck = validateMergeGroupDateRange({ startDate, endDate });
    if (!dateCheck.ok) {
      notifications.show({ color: "red", message: dateCheck.message });
      return;
    }
    setSplitSaving(true);
    try {
      const result = await createTableSplitClone({
        sourceTableId,
        startDate,
        endDate,
        layoutDate: selectedLayoutDate,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setSplitModalOpen(false);
        setGridTableActionMode(null);
        setSplitSelectedTableId(null);
        const dayRow =
          result.dayLayout !== undefined
            ? result.dayLayout
            : await refreshDayLayout();
        if (result.dayLayout !== undefined) {
          setCurrentDayLayoutCache(result.dayLayout);
        }
        if (isEditMode) {
          syncEditLayoutFromDayOverride(dayRow);
        }
      }
    } finally {
      setSplitSaving(false);
    }
  };

  const clearDayLayoutOverride = async () => {
    if (!areaId || !hasSupabase) {
      throw new Error("Chưa chọn khu vực hoặc chưa kết nối Supabase.");
    }
    try {
      await deleteAreaFloorLayoutForDate(areaId, selectedLayoutDate);
      if (dayLayoutCacheKey) {
        setCurrentDayLayoutCache(null);
      }
      notifications.show({
        color: "green",
        message: "Đã xóa sơ đồ riêng — đang dùng sơ đồ mặc định chung.",
      });
      await refreshDayLayout();
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không xóa được sơ đồ riêng.",
      });
      throw error;
    }
  };

  const handleReleaseMergeGroup = async (groupId: string) => {
    if (!hasSupabase) {
      notifications.show({ color: "red", message: "Chưa kết nối Supabase." });
      return;
    }
    setMergeSaving(true);
    setMergeGroupReleaseBusyId(groupId);
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
        await refreshDayLayout();
      }
    } finally {
      setMergeSaving(false);
      setMergeGroupReleaseBusyId(null);
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

  const canvasWidth = rglGridConfig.width;
  const canvasHeight = rglGridConfig.height;

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
      rglGridConfig,
      effectiveTablePositions
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
    effectiveTablePositions,
    placedTables,
    rglGridConfig,
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
        setFiltersAccordionValue(null);
        setIsGridToolsDockOpen(false);
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
    const snapped = nearestGridCellFromWorldPx(x, y, rglGridConfig);
    return { row: snapped.row, col: snapped.col };
  };

  const handleRglDragStop: EventCallback = (_layout, _oldItem, newItem) => {
    if (!isEditMode || !newItem) {
      return;
    }
    commitDrop(newItem.i, newItem.y, newItem.x);
  };

  const handleRglDrop = (_layout: Layout, item: LayoutItem | undefined) => {
    const tableId = item?.i ?? paletteDragTableIdRef.current;
    paletteDragTableIdRef.current = null;
    setPaletteDroppingItem(null);
    if (!isEditMode || !tableId || !item) {
      return;
    }
    commitPlacement(tableId, item.y, item.x);
  };

  const handlePaletteTableClick = (table: DiningTable) => {
    if (!isEditMode) {
      return;
    }
    setPendingPlacementTableId((current) => {
      if (current === table.id) {
        notifications.show({ color: "blue", message: "Đã bỏ chọn đặt bàn." });
        return null;
      }
      notifications.show({
        color: "blue",
        message: "Chạm vào ô trên sơ đồ để đặt bàn (hoặc kéo từ kho).",
      });
      return table.id;
    });
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

  const canvasInputBlockRef = useRef(false);
  canvasInputBlockRef.current = !isEditMode && blockCanvasForOverlay;
  const scaleLatestRef = useRef(scale);
  scaleLatestRef.current = scale;
  const zoomAtRef = useRef(zoomAt);
  zoomAtRef.current = zoomAt;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const onWheel = (event: WheelEvent) => {
      if (canvasInputBlockRef.current) {
        return;
      }
      event.preventDefault();
      const delta = event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
      zoomAtRef.current(scaleLatestRef.current + delta, event.clientX, event.clientY);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (canvasInputBlockRef.current) {
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
        pinchRef.current = { distance, centerX, centerY, scale: scaleLatestRef.current };
        return;
      }
      const factor = distance - pinchRef.current.distance;
      zoomAtRef.current(
        pinchRef.current.scale + factor * TOUCH_PINCH_FACTOR,
        centerX,
        centerY
      );
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    viewport.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("touchmove", onTouchMove);
    };
  }, [areaId, mode]);

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
  };

  const toggleEditMergeTableSelection = (tableId: string, tableName: string) => {
    if (allActiveMergedTableIds.has(tableId)) {
      notifications.show({
        color: "yellow",
        message: `${tableName} đã thuộc một cụm gộp khác.`,
      });
      return;
    }
    setEditSelectedTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
  };

  const cancelGridTableAction = () => {
    setGridTableActionMode(null);
    setMergeSelectedTableIds([]);
    setSplitSelectedTableId(null);
    setMergeModalOpen(false);
    setSplitModalOpen(false);
  };

  const startGridMergeSelection = () => {
    if (gridTableActionMode === "merge") {
      cancelGridTableAction();
      return;
    }
    setSplitSelectedTableId(null);
    setMergeSelectedTableIds([]);
    setMergeModalOpen(false);
    setSplitModalOpen(false);
    setGridTableActionMode("merge");
  };

  const startGridSplitSelection = () => {
    if (gridTableActionMode === "split") {
      cancelGridTableAction();
      return;
    }
    setMergeSelectedTableIds([]);
    setSplitSelectedTableId(null);
    setMergeModalOpen(false);
    setSplitModalOpen(false);
    setGridTableActionMode("split");
  };

  const toggleGridMergeTableSelection = (tableId: string) => {
    if (!mergeCandidateTableIds.has(tableId)) {
      return;
    }
    setMergeSelectedTableIds((prev) =>
      prev.includes(tableId) ? prev.filter((id) => id !== tableId) : [...prev, tableId]
    );
  };

  const toggleGridSplitTableSelection = (tableId: string) => {
    if (!splitCandidateTableIds.has(tableId)) {
      return;
    }
    setSplitSelectedTableId((prev) => (prev === tableId ? null : tableId));
  };

  const confirmGridTableActionSelection = () => {
    if (gridTableActionMode === "merge") {
      if (mergeSelectedTableIds.length < 2) {
        notifications.show({
          color: "yellow",
          message: "Cần chọn ít nhất 2 bàn để gộp.",
        });
        return;
      }
      setMergeModalOpen(true);
      return;
    }
    if (gridTableActionMode === "split") {
      if (!splitSelectedTableId) {
        notifications.show({
          color: "yellow",
          message: "Vui lòng chọn một bàn cần tách.",
        });
        return;
      }
      setSplitModalOpen(true);
    }
  };

  const mergeSelectedTableNames = useMemo(
    () =>
      mergeSelectedTableIds
        .map((tableId) => state.tables.find((table) => table.id === tableId)?.name)
        .filter((name): name is string => Boolean(name)),
    [mergeSelectedTableIds, state.tables]
  );

  const splitSelectedTableName = useMemo(() => {
    if (!splitSelectedTableId) {
      return null;
    }
    return state.tables.find((table) => table.id === splitSelectedTableId)?.name ?? null;
  }, [splitSelectedTableId, state.tables]);

  return (
    <Stack
      className={classes.pageRoot}
      style={
        reserveManagerDock
          ? ({
              ["--manager-dock-reserve" as string]:
                "calc(72px + env(safe-area-inset-bottom, 0px))",
            } as CSSProperties)
          : undefined
      }
    >
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <Group
          gap={isCompact ? 8 : 4}
          align="flex-end"
          wrap="nowrap"
          className={classes.pageAreaSelectRow}
        >
          {!isEmployee ? (
            <SegmentedControl
              value={mode}
              color="brand"
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
                  confirmDiscardLayoutEdits();
                  return;
                }
                exitEditModeToView();
              }}
              data={[
                { label: "View", value: "view" },
                {
                  label: "Edit",
                  value: "edit",
                  disabled: editBlockedByOther,
                },
              ]}
              className={classes.pageModeControl}
              size={isCompact ? "sm" : "md"}
            />
          ) : null}
          <Select
            value={areaId}
            onChange={setActiveAreaId}
            data={availableAreas.map((area) => ({
              value: area.id,
              label: `${area.name} - ${state.branches.find((branch) => branch.id === area.branchId)?.name}`,
            }))}
            searchable
            disabled={isEditMode}
            className={classes.pageAreaSelect}
            comboboxProps={{ withinPortal: true }}
            size={isCompact ? "xs" : "sm"}
          />
          {!isEmployee ? (
            <Menu shadow="md" width={220} withinPortal position="bottom-end">
              <Menu.Target>
                <ActionIcon
                  variant="transparent"
                  size={isCompact ? "input-md" : "lg"}
                  className={classes.toolbarAreaActionBtn}
                  aria-label="Mở menu thao tác booking"
                  disabled={isEditMode}
                >
                  <MoreVertical size={16} />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => setCreateBookingModalOpened(true)}>Tạo booking</Menu.Item>
                <Menu.Item onClick={() => dayListModalRef.current?.openDayListModal()}>
                  Danh sách booking
                </Menu.Item>
                <Menu.Item
                  onClick={() => setMergeGroupsListModalOpen(true)}
                  disabled={!activeAreaBranchId}
                >
                  Danh sách bàn gộp
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : null}
          {!isEmployee && !isBranchManager ? (
            <Group gap={isCompact ? 8 : 4} className={classes.toolbarAreaActions} wrap="nowrap">
              <ActionIcon
                variant="transparent"
                size={isCompact ? "input-md" : "lg"}
                className={classes.toolbarAreaActionBtn}
                aria-label="Sửa khu vực"
                disabled={!areaId || !hasSupabase}
                onClick={openAreaMetadataEdit}
              >
                <Pencil size={16} />
              </ActionIcon>
              <ActionIcon
                variant="transparent"
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
        </Group>
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

      {!isEditMode ? (
        <Accordion
          value={filtersAccordionValue}
          onChange={setFiltersAccordionValue}
          classNames={{ root: classes.toolbarPanelAccordion }}
          variant="contained"
          radius="md"
          chevronPosition="right"
        >
          <Accordion.Item value="search">
            <Accordion.Control icon={<Search size={16} />}>Tìm bàn & lọc</Accordion.Control>
            <Accordion.Panel>
              <Group gap="sm" grow wrap="nowrap" align="center">
                <TextInputWithVoice
                  label="Tìm bàn"
                  placeholder="Tên bàn, khách, SĐT, giờ đặt, giờ check-in…"
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  size="sm"
                />
                <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm" fw={500}>
                    Lọc trạng thái
                  </Text>
                  <div className="mobile-filter-chip-scroll">
                    <Group
                      gap="xs"
                      wrap={isCompact ? "nowrap" : "wrap"}
                      role="group"
                      aria-label="Lọc trạng thái bàn"
                    >
                      <Button
                        size={isCompact ? "xs" : "compact-sm"}
                        radius="xl"
                        variant={statusFilter === "all" ? "filled" : "outline"}
                        color="gray"
                        onClick={() => setStatusFilter("all")}
                      >
                        Tất cả
                      </Button>
                      {(["available", "hold", "occupied", "locked"] as TableStatus[]).map((status) => {
                        const selected = statusFilter === status;
                        const color = tableStatusColor[status];
                        return (
                          <Button
                            key={status}
                            size={isCompact ? "xs" : "compact-sm"}
                            radius="xl"
                            variant={selected ? "filled" : "outline"}
                            color={color}
                            onClick={() => setStatusFilter(status)}
                            styles={{
                              root: selected
                                ? {
                                    borderWidth: 2,
                                    borderStyle: "solid",
                                    borderColor: `var(--mantine-color-${color}-7)`,
                                  }
                                : undefined,
                            }}
                          >
                            {tableStatusLabel[status]}
                          </Button>
                        );
                      })}
                    </Group>
                  </div>
                </Stack>
              </Group>
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
          >
            <div
              className={classes.canvasContent}
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            >
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
                const mergeStatusSurfaceClass = !isEditMode
                  ? MERGE_GROUP_STATUS_SURFACE_CLASS[viewMergeStatus ?? "available"]
                  : "";
                return (
                  <div
                    key={`merge-backdrop-${bbox.groupId}`}
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
                    aria-hidden
                  >
                    <div
                      className={classes.mergeGroupContainerBody}
                      style={{ top: bbox.headerHeight }}
                    />
                  </div>
                );
              })}
              <FloorMapGrid
                gridConfig={rglGridConfig}
                layout={rglLayoutItems}
                scale={scale}
                isEditMode={isEditMode}
                allowExternalDrop={isEditMode}
                droppingItem={paletteDroppingItem ?? undefined}
                className={classes.floorMapGridRoot}
                onDragStop={handleRglDragStop}
                onDrop={handleRglDrop}
                onDropDragOver={(event) => {
                  event.preventDefault();
                  return { w: 1, h: 1 };
                }}
              >
                {placedTables.map((table) => {
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
                    const displayBooking = tableBooking;
                    const peekCustomer = displayBooking
                      ? customerById.get(displayBooking.customerId)
                      : undefined;
                    const showStatusMenu =
                      table.status === "available" ||
                      table.status === "locked" ||
                      table.status === "occupied";
                    const canComplete =
                      table.status === "occupied" &&
                      displayBooking != null &&
                      (displayBooking.status === "checked_in" ||
                        displayBooking.status === "seated");
                    const canLock =
                      table.status === "available" &&
                      !tableHasActiveBookingOnFloorDay(table.id, floorMapDayBookings, {
                        excludeMergeGroupId: mergeGroupId ?? undefined,
                      });
                    const showUnlock = table.status === "locked";
                    const isMergeGridSelect = gridTableActionMode === "merge";
                    const isSplitGridSelect = gridTableActionMode === "split";
                    const isGridSelecting = isMergeGridSelect || isSplitGridSelect;
                    const isGridSelectionCandidate =
                      !isMergeMember &&
                      (isMergeGridSelect
                        ? mergeCandidateTableIds.has(table.id)
                        : isSplitGridSelect
                          ? splitCandidateTableIds.has(table.id)
                          : false);
                    const isGridSelected = isMergeGridSelect
                      ? mergeSelectedTableIds.includes(table.id)
                      : isSplitGridSelect
                        ? splitSelectedTableId === table.id
                        : false;
                    const selectionCheckbox =
                      isGridSelecting && isGridSelectionCandidate
                        ? {
                            checked: isGridSelected,
                            onToggle: () => {
                              if (isMergeGridSelect) {
                                toggleGridMergeTableSelection(table.id);
                              } else {
                                toggleGridSplitTableSelection(table.id);
                              }
                            },
                          }
                        : null;
                    return (
                      <div key={table.id} className={classes.floorMapGridCell}>
                        <FloorTableBlockView
                          table={table}
                          style={{}}
                          isMergeMember={isMergeMember}
                          displayBooking={displayBooking}
                          bookingGuestBadge={
                            isMergeMember &&
                            !tableBooking &&
                            mergeGroupBooking &&
                            mergeGuestArrived
                              ? mergeGroupBooking
                              : null
                          }
                          hideBookingPeek={Boolean(
                            isMergeMember && mergeGroupBooking && !tableBooking
                          )}
                          customerName={peekCustomer?.fullName ?? ""}
                          isEmployee={isEmployee}
                          isBusy={isTableStatusBusy(table.id)}
                          isDragging={false}
                          showStatusMenu={showStatusMenu && !isGridSelecting}
                          canComplete={canComplete}
                          canLock={canLock}
                          showUnlock={showUnlock}
                          selectionCheckbox={selectionCheckbox}
                          isGridSelected={isGridSelected}
                          suppressOpen={isGridSelecting}
                          onOpenTable={() => handleViewOrRegisterForTable(table)}
                          onOpenDetail={() => openDetailForTable(table)}
                          onCompleteBooking={() => void handleTableBlockComplete(table)}
                          onLockTable={() => void handleTableBlockLock(table)}
                          onUnlockTable={() => void handleTableBlockUnlock(table)}
                          onStatusMenuOpen={() => {
                            panStateRef.current = null;
                            placementTapRef.current = null;
                            setStatusMenuOpen(true);
                          }}
                          onStatusMenuClose={() => setStatusMenuOpen(false)}
                        />
                      </div>
                    );
                  }
                  const isMergeSelected = editSelectedTableIds.includes(table.id);
                  return (
                    <div
                      key={table.id}
                      className={classes.floorMapGridCell}
                      onClick={(event) => {
                        if (event.shiftKey && !isMergeMember) {
                          event.stopPropagation();
                          toggleEditMergeTableSelection(table.id, table.name);
                        }
                      }}
                    >
                      <div
                        data-table-block="true"
                        data-table-status={table.status}
                        className={`${classes.tableBlock} ${classes.tableBlockEdit} ${
                          isMergeMember ? classes.tableBlockMergeMember : ""
                        } ${isMergeSelected ? classes.tableBlockMergeSelected : ""} ${
                          isMergeMember ? classes.tableBlockMergeMemberLocked : ""
                        }`}
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
                        {isSplitCloneTable(table) &&
                        table.splitStartDate &&
                        table.splitEndDate ? (
                          <Text size="xs" c="dimmed" lineClamp={2} lh={1.25}>
                            Khả dụng:{" "}
                            {formatMergeGroupDateRange(
                              table.splitStartDate,
                              table.splitEndDate
                            )}
                          </Text>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </FloorMapGrid>
              {mergeBBoxes.map((bbox) => {
                const mergeGroup = effectiveMergeGroups.find(
                  (candidate) => candidate.id === bbox.groupId
                );
                if (!mergeGroup) {
                  return null;
                }
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
                const showMergeStatusMenu =
                  !isEditMode &&
                  !isEmployee &&
                  (viewMergeStatus === "available" ||
                    viewMergeStatus === "locked" ||
                    viewMergeStatus === "occupied");
                const canCompleteMerge =
                  viewMergeStatus === "occupied" &&
                  viewMergeBooking != null &&
                  (viewMergeBooking.status === "checked_in" ||
                    viewMergeBooking.status === "seated");
                const isMergeGroupBusy =
                  mergeGroup.tableIds.some((tableId) => isTableStatusBusy(tableId)) ||
                  isTableStatusBusy(mergeGroup.id);
                return (
                  <div
                    key={`merge-header-${bbox.groupId}`}
                    className={`${classes.mergeGroupHeaderLayer} ${
                      mergeGroupDragState?.groupId === bbox.groupId
                        ? classes.mergeGroupHeaderLayerDragging
                        : ""
                    } ${mergeStatusSurfaceClass}`}
                    style={{
                      left: bbox.x + MERGE_GROUP_FRAME_BORDER_PX,
                      top: bbox.y + MERGE_GROUP_FRAME_BORDER_PX,
                      width: bbox.width - MERGE_GROUP_FRAME_BORDER_PX * 2,
                      height: bbox.headerHeight,
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
                        <span className={classes.mergeGroupContainerTitle} data-merge-no-drag="true">
                          {bbox.mergedName}
                        </span>
                        <div className={classes.mergeGroupContainerHeaderMeta}>
                          <span
                            className={classes.mergeGroupContainerDateRange}
                            data-merge-no-drag="true"
                          >
                            {formatMergeGroupDateRange(
                              mergeGroup.startDate,
                              mergeGroup.endDate
                            )}
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
                        aria-label={bbox.mergedName}
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
                          <Group
                            gap={6}
                            wrap="nowrap"
                            align="center"
                            className={classes.mergeGroupContainerHeaderTrailing}
                          >
                            {viewMergeBooking && isGuestCountSpecified(viewMergeBooking) ? (
                              <Badge variant="filled" color="dark" size="xs" radius="sm">
                                {viewMergeBooking.guestCount} khách
                              </Badge>
                            ) : !viewMergeBooking ? (
                              <span className={classes.mergeGroupContainerCapacity}>
                                Khả dụng:{" "}
                                {formatMergeGroupDateRange(
                                  mergeGroup.startDate,
                                  mergeGroup.endDate
                                )}
                              </span>
                            ) : null}
                            {showMergeStatusMenu ? (
                              <Group
                                gap={4}
                                wrap="nowrap"
                                align="center"
                                className={classes.mergeGroupContainerHeaderActions}
                                data-table-status-menu=""
                                onClick={(event) => {
                                  event.stopPropagation();
                                  event.preventDefault();
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
                                      aria-label="Thao tác cụm gộp"
                                      disabled={isMergeGroupBusy}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        event.preventDefault();
                                      }}
                                    >
                                      <MoreVertical size={14} />
                                    </ActionIcon>
                                  </Menu.Target>
                                  <Menu.Dropdown>
                                    <Menu.Item
                                      disabled={isMergeGroupBusy}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        event.preventDefault();
                                        openDetailForMergeGroup(mergeGroup);
                                      }}
                                    >
                                      Lịch sử booking
                                    </Menu.Item>
                                    {canCompleteMerge ? (
                                      <>
                                        <Menu.Divider />
                                        <Menu.Item
                                          disabled={isMergeGroupBusy}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            event.preventDefault();
                                            void handleMergeGroupBlockComplete(mergeGroup);
                                          }}
                                        >
                                          Hoàn thành
                                        </Menu.Item>
                                      </>
                                    ) : null}
                                  </Menu.Dropdown>
                                </Menu>
                              </Group>
                            ) : null}
                          </Group>
                        </span>
                        {viewMergeBooking ? (
                          <span className={classes.mergeGroupContainerHeaderBookingRow}>
                            <span className={classes.mergeGroupContainerCustomerTimes}>
                              <Text
                                component="span"
                                size="xs"
                                fw={700}
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
                            <span className={classes.mergeGroupContainerCapacity}>
                              Khả dụng:{" "}
                              {formatMergeGroupDateRange(
                                mergeGroup.startDate,
                                mergeGroup.endDate
                              )}
                            </span>
                          </span>
                        ) : null}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          {isEditMode && editSelectedTableIds.length >= 2 ? (
            <div className={classes.mergeSelectionDock}>
              <Text size="sm" fw={600} className={classes.mergeSelectionDockStatus}>
                Đã chọn {editSelectedTableIds.length} bàn
              </Text>
              <Group gap="xs" className={classes.mergeSelectionDockActions}>
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
          {!isEditMode && gridTableActionMode ? (
            <div className={classes.mergeSelectionDock}>
              <Text size="sm" fw={600} className={classes.mergeSelectionDockStatus}>
                {gridTableActionMode === "merge"
                  ? `Đã chọn ${mergeSelectedTableIds.length} bàn`
                  : splitSelectedTableName
                    ? `Đã chọn: ${splitSelectedTableName}`
                    : "Chọn một bàn cần tách"}
              </Text>
              <Group gap="xs" className={classes.mergeSelectionDockActions}>
                <Button variant="default" size="xs" onClick={cancelGridTableAction}>
                  Hủy
                </Button>
                <Button
                  size="xs"
                  onClick={confirmGridTableActionSelection}
                  disabled={
                    gridTableActionMode === "merge"
                      ? mergeSelectedTableIds.length < 2
                      : !splitSelectedTableId
                  }
                >
                  Xác nhận
                </Button>
              </Group>
            </div>
          ) : null}
          <div className={classes.canvasOverlay}>
            {!isEmployee || isEditMode ? (
              <div className={classes.canvasTopLeftDocks}>
                {isDatePickerDockOpen && !isEmployee ? (
                  <div className={classes.canvasDateDock}>
                    <Group justify="space-between" align="center" wrap="nowrap" mb={4} gap={4}>
                      <Text size="sm" fw={600} className={classes.canvasDateDockTitle}>
                        Ngày xem sơ đồ
                      </Text>
                      <ActionIcon
                        variant="transparent"
                        size="sm"
                        onClick={() => setIsDatePickerDockOpen(false)}
                        aria-label="Ẩn ngày xem sơ đồ"
                      >
                        <ChevronUp size={14} />
                      </ActionIcon>
                    </Group>
                    <DatePickerInput
                      value={floorMapSelectedDate.format("YYYY-MM-DD")}
                      onChange={(value) => {
                        if (!value) {
                          return;
                        }
                        setFloorMapSelectedDate(dayjs(value, "YYYY-MM-DD"));
                      }}
                      valueFormat="DD/MM/YYYY"
                      dropdownType="modal"
                      size={isCompact ? "xs" : "sm"}
                      w="100%"
                    />
                  </div>
                ) : null}
                {!isEmployee && !isDatePickerDockOpen ? (
                  <ActionIcon
                    variant="filled"
                    size="lg"
                    onClick={() => setIsDatePickerDockOpen(true)}
                    aria-label="Hiện ngày xem sơ đồ"
                  >
                    <Calendar size={16} />
                  </ActionIcon>
                ) : null}
                {isEditMode && !isGridToolsDockOpen ? (
                  <ActionIcon
                    variant="filled"
                    size="lg"
                    onClick={() => setIsGridToolsDockOpen(true)}
                    aria-label="Hiện công cụ lưới"
                  >
                    <Wrench size={16} />
                  </ActionIcon>
                ) : null}
                {isEditMode ? (
                  <Group gap={isCompact ? 8 : 6} wrap="nowrap" style={{ pointerEvents: "auto" }}>
                    <Button
                      size="sm"
                      leftSection={<Save size={16} />}
                      loading={isSavingLayout}
                      disabled={!editLayout || !isLayoutDirty}
                      onClick={() => void handleSaveFloorLayout()}
                    >
                      Lưu sơ đồ ({floorMapSelectedDate.format("DD/MM")})
                    </Button>
                    <Button
                      size="sm"
                      leftSection={<Save size={16} />}
                      variant="light"
                      loading={isSavingLayout}
                      disabled={!editLayout || !isLayoutDirty}
                      onClick={() => void handleSaveFloorLayoutAsGlobal()}
                    >
                      Lưu sơ đồ mặc định
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => setLayoutTemplatesOpen(true)}
                      disabled={!areaId || !hasSupabase}
                    >
                      Mẫu sơ đồ…
                    </Button>
                  </Group>
                ) : null}
                {isEditMode && isGridToolsDockOpen ? (
                  <div className={classes.canvasGridToolsDock}>
                    <Group justify="space-between" align="center" wrap="nowrap" mb={4}>
                      <Text size="sm" fw={600}>
                        Công cụ lưới
                      </Text>
                      <ActionIcon
                        variant="transparent"
                        size="sm"
                        onClick={() => setIsGridToolsDockOpen(false)}
                        aria-label="Ẩn công cụ lưới"
                      >
                        <ChevronUp size={14} />
                      </ActionIcon>
                    </Group>
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
                                    gridColumns: clamp(value ?? DEFAULT_GRID_COLUMNS, 4, 24),
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
                      <Group gap="xs" wrap="nowrap" align="center">
                        <Button
                          variant="filled"
                          size="xs"
                          leftSection={<Minimize2 size={14} />}
                          loading={isTrimmingGrid}
                          onClick={() => trimRedundantGrid()}
                          disabled={!editLayout}
                          style={{ flex: 1 }}
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
                      </Group>
                    </Stack>
                  </div>
                ) : null}
              </div>
            ) : null}

            {isEditMode && isLayoutDirty ? (
              <div className={classes.canvasUnsavedBadgeDock}>
                <Badge color="orange" variant="light">
                  Chưa lưu
                </Badge>
              </div>
            ) : null}

            {!isEmployee && !isEditMode ? (
              <div className={classes.canvasTopRightDocks}>
                <div className={classes.canvasTableActionDock}>
                  <Group
                    className={classes.canvasTableActionGroup}
                    gap={isCompact ? 6 : 8}
                    wrap="wrap"
                    justify="flex-end"
                  >
                    <Button
                      size={isCompact ? "xs" : "compact-sm"}
                      variant={gridTableActionMode === "merge" ? "filled" : "light"}
                      onClick={startGridMergeSelection}
                      disabled={!activeAreaBranchId}
                    >
                      Gộp bàn
                    </Button>
                    <Button
                      size={isCompact ? "xs" : "compact-sm"}
                      variant={gridTableActionMode === "split" ? "filled" : "light"}
                      onClick={startGridSplitSelection}
                      disabled={!activeAreaBranchId}
                    >
                      Tách bàn
                    </Button>
                  </Group>
                </div>
              </div>
            ) : null}

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
                            draggable={isEditMode}
                            className={`${classes.paletteTableBlock} ${TABLE_STATUS_SURFACE_CLASS[table.status]} ${pendingPlacementTableId === table.id
                              ? classes.paletteTableBlockPending
                              : ""
                              }`}
                            onDragStart={() => {
                              paletteDragTableIdRef.current = table.id;
                              setPaletteDroppingItem({
                                i: table.id,
                                x: 0,
                                y: 0,
                                w: 1,
                                h: 1,
                              });
                            }}
                            onDragEnd={() => {
                              paletteDragTableIdRef.current = null;
                              setPaletteDroppingItem(null);
                            }}
                            onClick={() => handlePaletteTableClick(table)}
                          >
                            <Stack gap={4} style={{ width: "100%" }}>
                              <Text size="sm" fw={600} lineClamp={1}>
                                {table.name}
                              </Text>
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

      <PortalStandardModal
        opened={Boolean(registerTable || registerMergeGroup)}
        onClose={() => {
          if (!registerSaving) {
            closeRegistrationPanel();
          }
        }}
        closeOnClickOutside={!registerSaving}
        closeOnEscape={!registerSaving}
        title={
          registerMergeGroup ? (
            <Group gap="xs" wrap="wrap">
              <Text fw={700} span>
                Đăng ký
              </Text>
              <Text fw={700} c="blue.6" span>
                {registerMergeGroup.mergedName}
              </Text>
              <Text fw={700} c="dimmed" span>
                ({tableStatusLabel[mergeGroupStatusById.get(registerMergeGroup.id) ?? "available"]})
              </Text>
            </Group>
          ) : registerTable ? (
            <Group gap="xs" wrap="wrap">
              <Text fw={700} span>
                Đăng ký
              </Text>
              <Text fw={700} c="blue.6" span>
                {registerTable.name}
              </Text>
              <Text fw={700} c="dimmed" span>
                ({tableStatusLabel[registerTable.status]})
              </Text>
            </Group>
          ) : (
            "Đăng ký"
          )
        }
        size="xl"
        centered
        overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
        footer={
          registerTable || registerMergeGroup ? (
            registerModalTab === "assign" ? (
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
            ) : (
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
            )
          ) : null
        }
      >
        {registerTable || registerMergeGroup ? (
          <Stack gap="sm">
            <Group justify="flex-end" align="flex-start" wrap="wrap" gap="xs">
              {registerMergeGroup && !isEmployee ? (
                <Button
                  variant="light"
                  color="blue"
                  size="compact-xs"
                  onClick={() => setOpenedMergeGroupId(registerMergeGroup.id)}
                >
                  Quản lý bàn thành viên
                </Button>
              ) : null}
              {registerMergeGroup ? (
                (mergeGroupStatusById.get(registerMergeGroup.id) === "occupied" ||
                  mergeGroupStatusById.get(registerMergeGroup.id) === "hold") ? (
                  <Button
                    variant="subtle"
                    size="compact-xs"
                    onClick={() => openDetailForMergeGroup(registerMergeGroup)}
                  >
                    Lịch sử booking
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
                  {registerFormBranch ? (
                    <VoiceBookingAssistant
                      key={`${registerTable?.id ?? registerMergeGroup?.id ?? "reg"}-${registerModalTab}`}
                      embedded
                      hideSubmitButton
                      disabled={registerSaving}
                      branch={registerFormBranch}
                      areas={registerVoiceAreas}
                      tables={registerVoiceTables}
                      arrivalMode={registerArrivalMode}
                      onArrivalModeChange={setRegisterArrivalMode}
                      showArrivalModeRadios
                      immediateModeDisabled={registerImmediateBlocked}
                      lockTableId={registerMergeGroup ? null : registerTable?.id ?? null}
                      lockAreaId={registerMergeGroup ? null : registerTable?.areaId ?? null}
                      hideAreaTablePickers={Boolean(registerTable || registerMergeGroup)}
                      initialBookingAt={registerDefaultBookingAt}
                      onFieldsChange={setRegisterVoiceFields}
                      onCreateBooking={async () => ({ ok: false, message: "Dùng nút Tạo booking." })}
                    />
                  ) : null}
                  {registerMergeGroup ? (
                    (mergeGroupStatusById.get(registerMergeGroup.id) ?? "available") ===
                    "occupied" ? (
                      <Text size="xs" c="dimmed">
                        Cụm đang có khách — chỉ đặt thêm booking ở khung giờ không trùng lịch hiện
                        tại.
                      </Text>
                    ) : null
                  ) : registerTable?.status === "occupied" ? (
                    <Text size="xs" c="dimmed">
                      Bàn đang có khách — chỉ đặt thêm booking ở khung giờ không trùng lịch hiện tại.
                    </Text>
                  ) : null}
                  {!registerMergeGroup && registerTableConflictMessage ? (
                    <Alert color="red" variant="light" title="Trùng khung giờ trên bàn">
                      {registerTableConflictMessage}
                    </Alert>
                  ) : null}
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
                    mergeGroup={registerMergeGroup ?? undefined}
                    selectedBookings={registerPendingSelected}
                    onSelectedBookingsChange={setRegisterPendingSelected}
                    onNavigateToBookingList={confirmNavigateToDayBookingList}
                    disabled={registerSaving}
                  />
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        ) : null}
      </PortalStandardModal>

      <TableBlockDetailModal
        opened={Boolean(detailTable || detailMergeGroup)}
        onClose={closeDetailModal}
        table={detailTable}
        mergeGroup={detailMergeGroup}
        mergeStatus={detailMergeGroupStatus}
        mergeMemberOccupiedTableNames={detailMergeMemberOccupiedTableNames}
        blockState={detailTableBlockState}
        blockLoading={detailTableBlockLoading}
        activeBooking={activeBookingForDetail}
        activeBookingCustomerName={activeBookingCustomerName}
        isEmployee={isEmployee}
        bookingActionLoading={detailBookingActionLoading}
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
        onChangeTable={openChangeTableForActiveBooking}
        onCancelBooking={openDetailCancelBookingConfirm}
        onOpenMergeGroupManage={
          detailMergeGroup
            ? () => setOpenedMergeGroupId(detailMergeGroup.id)
            : undefined
        }
      />

      <ChangeBookingTableModal
        opened={changeTableBooking != null}
        onClose={() => {
          if (!detailBookingActionLoading) {
            setChangeTableBooking(null);
          }
        }}
        booking={changeTableBooking}
        customerName={
          changeTableBooking
            ? (state.customers.find((item) => item.id === changeTableBooking.customerId)
                ?.fullName ?? "")
            : ""
        }
        customers={state.customers}
        areas={state.areas}
        tables={state.tables}
        bookings={state.bookings}
        defaultAreaId={areaId}
        loading={detailBookingActionLoading}
        onConfirm={handleSubmitChangeTable}
      />

      <Modal
        opened={mergeGroupsListModalOpen}
        onClose={() => setMergeGroupsListModalOpen(false)}
        title="Danh sách bàn gộp"
        size="xl"
      >
        <MergeGroupsPanel
          key={areaId ?? "all-areas"}
          embedded
          mergeGroups={state.mergeGroups}
          tables={state.tables}
          areas={state.areas}
          branches={state.branches}
          bookings={state.bookings}
          filteredBranchIds={filteredBranchIds}
          busyGroupId={mergeGroupReleaseBusyId}
          initialAreaFilter={areaId}
          onRequestRelease={(groupId) => {
            setReleaseMergeGroupId(groupId);
          }}
          onRowSelect={(group) => {
            const navDate = resolveMergeGroupNavigationDate(group, floorMapSelectedDate);
            setFloorMapSelectedDate(dayjs(navDate));
            if (group.areaId !== areaId) {
              setActiveAreaId(group.areaId);
            }
            setDetailTable(null);
            setDetailMergeGroup(null);
            setMergeGroupsListModalOpen(false);
          }}
        />
      </Modal>

      <Modal
        opened={mergeModalOpen}
        onClose={() => setMergeModalOpen(false)}
        title="Gộp bàn — chọn thời gian"
        size="md"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Cụm gộp chỉ hiển thị trong khoảng ngày đã chọn; sau ngày kết thúc hệ thống tự bỏ gộp
            để trả bàn lẻ.
          </Text>
          {mergeSelectedTableNames.length > 0 ? (
            <Text size="sm">
              Bàn đã chọn:{" "}
              <Text component="span" fw={600}>
                {mergeSelectedTableNames.join(", ")}
              </Text>
            </Text>
          ) : null}
          <Group grow align="flex-end">
            <DatePickerInput
              label="Từ ngày"
              value={mergeStartDate}
              onChange={(value) => {
                setMergeStartDate(value);
                if (value && mergeEndDate && dayjs(mergeEndDate).isBefore(value, "day")) {
                  setMergeEndDate(value);
                }
              }}
              valueFormat="DD/MM/YYYY"
              dropdownType="modal"
              disabled={mergeSaving}
            />
            <DatePickerInput
              label="Đến ngày"
              value={mergeEndDate}
              onChange={setMergeEndDate}
              valueFormat="DD/MM/YYYY"
              dropdownType="modal"
              minDate={mergeStartDate ? dayjs(mergeStartDate).toDate() : undefined}
              disabled={mergeSaving}
            />
          </Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setMergeModalOpen(false)}>
              Quay lại
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
        opened={splitModalOpen}
        onClose={() => setSplitModalOpen(false)}
        title="Tách bàn — chọn thời gian"
        size="md"
      >
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Bản sao chỉ hiển thị trong khoảng ngày đã chọn và có thể nhận booking độc lập với bàn
            gốc.
          </Text>
          {splitSelectedTableName ? (
            <Text size="sm">
              Bàn đã chọn:{" "}
              <Text component="span" fw={600}>
                {splitSelectedTableName}
              </Text>
            </Text>
          ) : null}
          {splitSelectedTableName ? (
            <Text size="xs" c="dimmed">
              Bản sao sẽ được đặt tên theo dạng &quot;{"{tên bàn} - n"}&quot; (n = 1, 2, 3…).
            </Text>
          ) : null}
          <Group grow align="flex-end">
            <DatePickerInput
              label="Từ ngày"
              value={splitStartDate}
              onChange={(value) => {
                setSplitStartDate(value);
                if (value && splitEndDate && dayjs(splitEndDate).isBefore(value, "day")) {
                  setSplitEndDate(value);
                }
              }}
              valueFormat="DD/MM/YYYY"
              dropdownType="modal"
              disabled={splitSaving}
            />
            <DatePickerInput
              label="Đến ngày"
              value={splitEndDate}
              onChange={setSplitEndDate}
              valueFormat="DD/MM/YYYY"
              dropdownType="modal"
              minDate={splitStartDate ? dayjs(splitStartDate).toDate() : undefined}
              disabled={splitSaving}
            />
          </Group>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setSplitModalOpen(false)}>
              Quay lại
            </Button>
            <Button
              loading={splitSaving}
              disabled={!splitSelectedTableId}
              onClick={() =>
                splitSelectedTableId
                  ? void handleCreateSplitClone(splitSelectedTableId)
                  : undefined
              }
            >
              Tách bàn
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
        isEmployee={isEmployee}
        onClose={() => setOpenedMergeGroupId(null)}
        onRequestRelease={(groupId) => setReleaseMergeGroupId(groupId)}
        onRequestRemoveMember={async (groupId, tableId) => {
          const result = await removeTableFromMergeGroup({
            groupId,
            tableId,
            layoutDate: selectedLayoutDate,
          });
          if (result.ok) {
            await refreshDayLayout();
          }
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
        onUpdateDates={async (groupId, startDate, endDate) => {
          const result = await updateTableMergeGroupDates({
            groupId,
            startDate,
            endDate,
          });
          notifications.show({
            color: result.ok ? "green" : "red",
            message: result.message,
          });
        }}
      />

      <FloorLayoutTemplatesModal
        opened={layoutTemplatesOpen}
        onClose={() => setLayoutTemplatesOpen(false)}
        areaId={areaId}
        layoutDate={selectedLayoutDate}
        layoutDateLabel={floorMapSelectedDate.format("DD/MM/YYYY")}
        hasDayOverride={resolvedLayout.hasDayOverride}
        currentSnapshot={currentLayoutSnapshot}
        listTemplates={listFloorLayoutTemplates}
        createTemplate={createFloorLayoutTemplate}
        deleteTemplate={deleteFloorLayoutTemplate}
        applyTemplate={applyFloorLayoutTemplateToDate}
        onClearDayLayout={clearDayLayoutOverride}
        onApplied={() => void refreshDayLayout()}
      />

      <CreateBookingModal
        opened={createBookingModalOpened}
        onClose={() => setCreateBookingModalOpened(false)}
        onFocusExistingBooking={(booking) => {
          dayListModalRef.current?.openDayListModalForBooking(booking);
        }}
        onViewCreatedBookingInFloorMap={(payload) => {
          const booking = state.bookings.find((item) => item.id === payload.bookingId);
          const date = dayjs(booking?.bookingAt ?? payload.bookingAt);
          setFloorMapSelectedDate(date);
        }}
      />

      <BookingCreatedNextStepModal
        opened={registerCreatedNextStepOpened}
        onClose={() => {
          setRegisterCreatedNextStepOpened(false);
          setRegisterCreatedNextStep(null);
        }}
        payload={registerCreatedNextStep}
        onViewInFloorMap={(payload) => {
          const booking = state.bookings.find((item) => item.id === payload.bookingId);
          const date = dayjs(booking?.bookingAt ?? payload.bookingAt);
          setFloorMapSelectedDate(date);
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

      {!isEmployee ? (
        <BookingDayListModal
          ref={dayListModalRef}
          selectedDate={floorMapSelectedDate}
          onSelectedDateChange={setFloorMapSelectedDate}
          onDayBookingRowClick={(booking) => setDayListDetailBooking(booking)}
          onNavigateToFloorMap={setFloorMapSelectedDate}
        />
      ) : null}

      <BookingOrderDetailModal
        booking={dayListDetailBooking}
        opened={dayListDetailBooking != null}
        onClose={() => setDayListDetailBooking(null)}
        source="list"
        isBookingRowBusy={isBookingRowBusy}
        onEdit={(b) => {
          setDayListDetailBooking(null);
          openEditBookingModal(b);
        }}
        onChangeTable={(b) => {
          setDayListDetailBooking(null);
          setMgmtChangeTableBooking(b);
        }}
        onAssign={(b) => {
          setDayListDetailBooking(null);
          openAssignOptions(b);
        }}
        onCheckIn={(id) => void runCheckIn(id)}
        onComplete={(b) => {
          setDayListDetailBooking(null);
          openCompleteBookingConfirm(b);
        }}
        onCancel={(b) => {
          setDayListDetailBooking(null);
          openCancelBookingConfirm(b);
        }}
      />
      {bookingManagementModals}
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
  isEmployee: boolean;
  onClose: () => void;
  onRequestRelease: (groupId: string) => void;
  onRequestRemoveMember: (groupId: string, tableId: string) => Promise<void>;
  onAssignPendingBooking: (booking: Booking, group: TableMergeGroup) => Promise<void>;
  onUpdateDates: (groupId: string, startDate: string, endDate: string) => Promise<void>;
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
  isEmployee,
  onClose,
  onRequestRelease,
  onRequestRemoveMember,
  onAssignPendingBooking,
  onUpdateDates,
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
  const [editStartDate, setEditStartDate] = useState<string | null>(group?.startDate ?? null);
  const [editEndDate, setEditEndDate] = useState<string | null>(group?.endDate ?? null);
  const [datesSaving, setDatesSaving] = useState(false);

  useEffect(() => {
    if (!group) {
      return;
    }
    setEditStartDate(group.startDate);
    setEditEndDate(group.endDate);
  }, [group?.endDate, group?.id, group?.startDate]);

  if (!group) {
    return null;
  }

  const datesDirty =
    editStartDate !== group.startDate || editEndDate !== group.endDate;
  const hasSeatedBookingInGroup = groupBookings.some((booking) => booking.status === "seated");

  const handleSaveDates = async () => {
    if (!editStartDate || !editEndDate) {
      return;
    }
    const dateCheck = validateMergeGroupDateRange({
      startDate: editStartDate,
      endDate: editEndDate,
    });
    if (!dateCheck.ok) {
      notifications.show({ color: "red", message: dateCheck.message });
      return;
    }
    setDatesSaving(true);
    try {
      await onUpdateDates(group.id, editStartDate, editEndDate);
    } finally {
      setDatesSaving(false);
    }
  };

  return (
    <Modal opened={Boolean(groupId)} onClose={onClose} title={group.mergedName} size="md">
      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <Stack gap={2}>
            {!isEditMode ? (
              <Text size="xs" c="dimmed">
                Hiệu lực: {formatMergeGroupDateRange(group.startDate, group.endDate)}
              </Text>
            ) : null}
            {isMergeGroupExpired(group) ? (
              <Text size="xs" c="orange">
                Đã qua ngày kết thúc — hệ thống sẽ tự bỏ gộp khi tải lại dữ liệu.
              </Text>
            ) : null}
          </Stack>
          {isEditMode ? (
            <Button color="red" variant="light" onClick={() => onRequestRelease(group.id)}>
              Bỏ gộp
            </Button>
          ) : null}
        </Group>
        {isEditMode ? (
          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Khoảng hiệu lực
            </Text>
            <Group grow align="flex-end">
              <DatePickerInput
                label="Từ ngày"
                value={editStartDate}
                onChange={(value) => {
                  setEditStartDate(value);
                  if (value && editEndDate && dayjs(editEndDate).isBefore(value, "day")) {
                    setEditEndDate(value);
                  }
                }}
                valueFormat="DD/MM/YYYY"
                dropdownType="modal"
                disabled={datesSaving}
              />
              <DatePickerInput
                label="Đến ngày"
                value={editEndDate}
                onChange={setEditEndDate}
                valueFormat="DD/MM/YYYY"
                dropdownType="modal"
                minDate={editStartDate ? dayjs(editStartDate).toDate() : undefined}
                disabled={datesSaving}
              />
            </Group>
            <Group justify="flex-end">
              <Button
                size="xs"
                variant="light"
                disabled={!datesDirty || datesSaving}
                onClick={() => {
                  setEditStartDate(group.startDate);
                  setEditEndDate(group.endDate);
                }}
              >
                Hoàn tác
              </Button>
              <Button
                size="xs"
                loading={datesSaving}
                disabled={!datesDirty || !editStartDate || !editEndDate}
                onClick={() => void handleSaveDates()}
              >
                Lưu ngày
              </Button>
            </Group>
          </Stack>
        ) : null}
        <Divider label="Bàn thành viên" labelPosition="left" />
        <Stack gap="xs">
          {memberTables.map((table) => (
            <Group key={table.id} justify="space-between" wrap="nowrap">
              <Stack gap={0}>
                <Text size="sm" fw={500}>
                  {table.name}
                </Text>
              </Stack>
              {!isEmployee ? (
                <Tooltip
                  label={
                    hasSeatedBookingInGroup
                      ? "Không thể tách bàn khi cụm đang có khách ngồi."
                      : memberTables.length <= 2
                        ? "Cụm cần ít nhất 2 bàn — bỏ tiếp sẽ tự huỷ cụm."
                        : "Tách bàn khỏi cụm"
                  }
                >
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    loading={removingTableId === table.id}
                    disabled={hasSeatedBookingInGroup}
                    onClick={async () => {
                      if (hasSeatedBookingInGroup) {
                        notifications.show({
                          color: "yellow",
                          message: "Không thể tách bàn khi cụm đang có khách ngồi.",
                        });
                        return;
                      }
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
              ) : null}
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
                  <Badge variant="light" color={bookingStatusColor[booking.status]}>
                    {bookingStatusLabel[booking.status]}
                  </Badge>
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
            (booking.areaId === group.areaId || !booking.areaId)
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
