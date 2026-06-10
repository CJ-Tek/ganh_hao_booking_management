import dayjs from "dayjs";
import {
  deriveMergeGroupStatusFromDayBookings,
  deriveMergeMemberTableStatusFromDayBookings,
  deriveTableStatusFromDayBookings,
} from "@/lib/booking-meta";
import { filterBookingsForFloorLayoutDate } from "@/lib/floor-map-day-bookings";
import { isTableOnFloorGrid } from "@/lib/floor-map-merge-layout";
import {
  computeMergeGroupBboxes,
  type MergeGroupBbox,
  type MergeGroupBboxTableInput,
} from "@/lib/floor-map-merge-bbox";
import { resolveFloorLayoutForDate } from "@/lib/floor-layout-resolve";
import { buildFloorMapRglGridConfig, type FloorMapRglGridConfig } from "@/lib/floor-map-rgl";
import { isMergeGroupEffectiveOnDate } from "@/lib/merge-group-utils";
import { filterTablesForFloorMapDay } from "@/lib/table-split-clone-utils";
import type { AreaFloorLayoutByDate } from "@/lib/floor-layout-snapshot";
import type {
  Area,
  Booking,
  DiningTable,
  TableMergeGroup,
  TableStatus,
} from "@/lib/types";

/** Picker-only card size — tighter than floor-map blocks. */
export const PICKER_TABLE_WIDTH_PX = 112;
export const PICKER_TABLE_HEIGHT_PX = 56;
/** Gap between table cards — between floor-map spacing and the previous 4px pack. */
export const PICKER_COL_GAP_PX = 14;
export const PICKER_ROW_GAP_PX = 14;
export const PICKER_STACK_OFFSET_PX = 10;
export const PICKER_TABLE_FONT_SIZE = 35;
export const PICKER_MERGE_LABEL_FONT_SIZE = 17;
export const PICKER_TEXT_INSET_PX = 2;

function pickerCompactCenterPx(
  compactCol: number,
  compactRow: number,
  stackIndex: number
): { x: number; y: number } {
  const stepX = PICKER_TABLE_WIDTH_PX + PICKER_COL_GAP_PX;
  const stepY = PICKER_TABLE_HEIGHT_PX + PICKER_ROW_GAP_PX;
  const stack = stackIndex * PICKER_STACK_OFFSET_PX;
  return {
    x: compactCol * stepX + PICKER_TABLE_WIDTH_PX / 2 + stack,
    y: compactRow * stepY + PICKER_TABLE_HEIGHT_PX / 2 + stack,
  };
}

function mergeBboxTableInputFromPlacedTables(
  placedTables: readonly PickerPlacedTable[]
): Map<string, MergeGroupBboxTableInput> {
  const halfW = PICKER_TABLE_WIDTH_PX / 2;
  const halfH = PICKER_TABLE_HEIGHT_PX / 2;
  const map = new Map<string, MergeGroupBboxTableInput>();
  for (const table of placedTables) {
    map.set(table.id, {
      id: table.id,
      centerX: table.centerX,
      centerY: table.centerY,
      halfWidth: halfW,
      halfHeight: halfH,
    });
  }
  return map;
}

export type PickerPlacedTable = {
  id: string;
  name: string;
  col: number;
  row: number;
  centerX: number;
  centerY: number;
  stackIndex: number;
  status: TableStatus;
  mergeGroupId: string | null;
};

/** Tight world-space bounds around placed tables + merge overlays (excludes empty grid). */
export type PickerContentBounds = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

export type BookingTablePickerLayoutModel = {
  gridConfig: FloorMapRglGridConfig;
  /** Full RGL canvas — used for table positions only, not viewport fit. */
  contentWidth: number;
  contentHeight: number;
  /** Bounds of actual blocks; picker scales to this. */
  bounds: PickerContentBounds;
  placedTables: PickerPlacedTable[];
  mergeBboxes: MergeGroupBbox[];
  mergeGroupIdByTableId: Map<string, string>;
  paletteTableCount: number;
  dayBookings: Booking[];
};

const PICKER_BOUNDS_PAD_PX = 6;

export function computePickerContentBounds(input: {
  placedTables: readonly PickerPlacedTable[];
  mergeBboxes: readonly MergeGroupBbox[];
  tableWidthPx?: number;
  tableHeightPx?: number;
}): PickerContentBounds {
  const halfW = (input.tableWidthPx ?? PICKER_TABLE_WIDTH_PX) / 2;
  const halfH = (input.tableHeightPx ?? PICKER_TABLE_HEIGHT_PX) / 2;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includeRect = (left: number, top: number, right: number, bottom: number) => {
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  };

  for (const table of input.placedTables) {
    includeRect(
      table.centerX - halfW,
      table.centerY - halfH,
      table.centerX + halfW,
      table.centerY + halfH
    );
  }

  for (const bbox of input.mergeBboxes) {
    includeRect(bbox.x, bbox.y, bbox.x + bbox.width, bbox.y + bbox.height);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { minX: 0, minY: 0, width: 200, height: 120 };
  }

  minX -= PICKER_BOUNDS_PAD_PX;
  minY -= PICKER_BOUNDS_PAD_PX;
  maxX += PICKER_BOUNDS_PAD_PX;
  maxY += PICKER_BOUNDS_PAD_PX;

  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function filterMergeGroupsForPicker(
  mergeGroups: readonly TableMergeGroup[],
  branchId: string,
  areaId: string,
  layoutDate: string
): TableMergeGroup[] {
  const day = dayjs(layoutDate);
  return mergeGroups.filter(
    (group) =>
      group.status === "active" &&
      group.branchId === branchId &&
      group.areaId === areaId &&
      isMergeGroupEffectiveOnDate(group, day)
  );
}

export function buildBookingTablePickerLayout(input: {
  area: Pick<Area, "id" | "floorGridColumns" | "floorGridRows" | "floorNodeSpacing">;
  tablesInArea: DiningTable[];
  mergeGroupsInArea: readonly TableMergeGroup[];
  dayOverride: AreaFloorLayoutByDate | null | undefined;
  bookings: readonly Booking[];
  branchIds: readonly string[];
  layoutDate: string;
}): BookingTablePickerLayoutModel {
  const layoutDay = dayjs(input.layoutDate);
  const tablesInArea = filterTablesForFloorMapDay(input.tablesInArea, layoutDay);

  const resolved = resolveFloorLayoutForDate({
    area: input.area,
    tablesInArea,
    dayOverride: input.dayOverride ?? null,
  });

  const gridConfig = buildFloorMapRglGridConfig(
    resolved.floorGridColumns,
    resolved.floorGridRows,
    resolved.floorNodeSpacing
  );

  const dayBookings = filterBookingsForFloorLayoutDate(
    input.bookings,
    input.layoutDate,
    input.branchIds
  );

  const activeGroups = input.mergeGroupsInArea;
  const mergeGroupIdByTableId = new Map<string, string>();
  for (const group of activeGroups) {
    for (const tableId of group.tableIds) {
      mergeGroupIdByTableId.set(tableId, group.id);
    }
  }

  const cellStacks = new Map<string, number>();
  const staged: Array<{
    table: DiningTable;
    col: number;
    row: number;
    stackIndex: number;
    mergeGroupId: string | null;
    status: TableStatus;
  }> = [];
  let paletteTableCount = 0;

  const sorted = [...input.tablesInArea].sort((a, b) => a.name.localeCompare(b.name, "vi"));

  for (const table of sorted) {
    const pos = resolved.positions[table.id] ?? {
      x: table.positionX,
      y: table.positionY,
    };
    if (
      !isTableOnFloorGrid(
        { positionX: pos.x, positionY: pos.y },
        resolved.floorGridColumns,
        resolved.floorGridRows
      )
    ) {
      paletteTableCount += 1;
      continue;
    }

    const cellKey = `${pos.x},${pos.y}`;
    const stackIndex = cellStacks.get(cellKey) ?? 0;
    cellStacks.set(cellKey, stackIndex + 1);

    const mergeGroupId = mergeGroupIdByTableId.get(table.id) ?? null;
    const status: TableStatus = mergeGroupId
      ? deriveMergeMemberTableStatusFromDayBookings(table, mergeGroupId, dayBookings)
      : deriveTableStatusFromDayBookings(table, dayBookings);

    staged.push({
      table,
      col: pos.x,
      row: pos.y,
      stackIndex,
      mergeGroupId,
      status,
    });
  }

  let minCol = 0;
  let minRow = 0;
  if (staged.length > 0) {
    minCol = Math.min(...staged.map((item) => item.col));
    minRow = Math.min(...staged.map((item) => item.row));
  }

  const placedTables: PickerPlacedTable[] = staged.map((item) => {
    const compactCol = item.col - minCol;
    const compactRow = item.row - minRow;
    const center = pickerCompactCenterPx(compactCol, compactRow, item.stackIndex);
    return {
      id: item.table.id,
      name: item.table.name,
      col: item.col,
      row: item.row,
      centerX: center.x,
      centerY: center.y,
      stackIndex: item.stackIndex,
      status: item.status,
      mergeGroupId: item.mergeGroupId,
    };
  });

  const tableById = mergeBboxTableInputFromPlacedTables(placedTables);

  const mergeBboxes = computeMergeGroupBboxes({
    groups: activeGroups,
    tableById,
    compactHeader: true,
  });

  const bounds = computePickerContentBounds({ placedTables, mergeBboxes });

  return {
    gridConfig,
    contentWidth: gridConfig.width,
    contentHeight: gridConfig.height,
    bounds,
    placedTables,
    mergeBboxes,
    mergeGroupIdByTableId,
    paletteTableCount,
    dayBookings,
  };
}

export function derivePickerMergeGroupStatuses(
  mergeGroups: readonly TableMergeGroup[],
  dayBookings: readonly Booking[]
): Map<string, TableStatus> {
  const map = new Map<string, TableStatus>();
  for (const group of mergeGroups) {
    map.set(group.id, deriveMergeGroupStatusFromDayBookings(group.id, dayBookings));
  }
  return map;
}
