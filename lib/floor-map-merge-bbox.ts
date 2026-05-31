import {
  FLOOR_TABLE_BLOCK_COMPACT_HEIGHT_PX,
  FLOOR_TABLE_BLOCK_WIDTH_PX,
} from "@/lib/floor-map-layout";
import { gridCellCenterPx, type FloorMapRglGridConfig } from "@/lib/floor-map-rgl";

export const MERGE_GROUP_HEADER_BASE_HEIGHT_PX = 28;
export const MERGE_GROUP_HEADER_BOOKED_HEIGHT_PX = 54;
export const MERGE_GROUP_HEADER_TABLE_GAP_PX = 6;
const MERGE_BBOX_MARGIN_X_PX = 10;
const MERGE_BBOX_MARGIN_Y_PX = MERGE_GROUP_HEADER_TABLE_GAP_PX;

export type MergeGroupBbox = {
  groupId: string;
  mergedName: string;
  memberCount: number;
  tableIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  headerHeight: number;
};

export type MergeGroupBboxTableInput = {
  id: string;
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
};

export type ComputeMergeGroupBboxesInput = {
  groups: ReadonlyArray<{
    id: string;
    mergedName: string;
    tableIds: readonly string[];
  }>;
  tableById: ReadonlyMap<string, MergeGroupBboxTableInput>;
  /** When false, use taller header (booked merge bar). Picker uses compact header only. */
  compactHeader?: boolean;
  groupHasBookingOnDay?: (groupId: string) => boolean;
};

/**
 * Geometry for each merge-group bbox — same math as floor-map `mergeBBoxes` useMemo.
 */
export function computeMergeGroupBboxes(
  input: ComputeMergeGroupBboxesInput
): MergeGroupBbox[] {
  const rects: MergeGroupBbox[] = [];
  const compactHeader = input.compactHeader ?? true;

  for (const group of input.groups) {
    let memberCount = 0;
    let tableXMin = Number.POSITIVE_INFINITY;
    let tableXMax = Number.NEGATIVE_INFINITY;
    let minTableTop = Number.POSITIVE_INFINITY;
    let maxTableBottom = Number.NEGATIVE_INFINITY;

    for (const tableId of group.tableIds) {
      const table = input.tableById.get(tableId);
      if (!table) {
        continue;
      }
      memberCount += 1;
      tableXMin = Math.min(tableXMin, table.centerX - table.halfWidth);
      tableXMax = Math.max(tableXMax, table.centerX + table.halfWidth);
      minTableTop = Math.min(minTableTop, table.centerY - table.halfHeight);
      maxTableBottom = Math.max(maxTableBottom, table.centerY + table.halfHeight);
    }

    if (memberCount === 0) {
      continue;
    }

    const headerHeight =
      compactHeader || !(input.groupHasBookingOnDay?.(group.id) ?? false)
        ? MERGE_GROUP_HEADER_BASE_HEIGHT_PX
        : MERGE_GROUP_HEADER_BOOKED_HEIGHT_PX;
    const xMin = tableXMin - MERGE_BBOX_MARGIN_X_PX;
    const xMax = tableXMax + MERGE_BBOX_MARGIN_X_PX;
    const yMin = minTableTop - headerHeight - MERGE_BBOX_MARGIN_Y_PX;
    const yMax = maxTableBottom + MERGE_BBOX_MARGIN_Y_PX;

    rects.push({
      groupId: group.id,
      mergedName: group.mergedName,
      memberCount,
      tableIds: [...group.tableIds],
      x: xMin,
      y: yMin,
      width: Math.max(0, xMax - xMin),
      height: Math.max(headerHeight, yMax - yMin),
      headerHeight,
    });
  }

  return rects;
}

/** Build table centers for merge bbox from grid layout (floor map card size). */
export function mergeBboxTableInputFromGrid(
  tableIds: readonly string[],
  positions: ReadonlyMap<string, { col: number; row: number }>,
  gridConfig: FloorMapRglGridConfig,
  options?: { tableWidthPx?: number; tableHeightPx?: number }
): Map<string, MergeGroupBboxTableInput> {
  const w = options?.tableWidthPx ?? FLOOR_TABLE_BLOCK_WIDTH_PX;
  const h = options?.tableHeightPx ?? FLOOR_TABLE_BLOCK_COMPACT_HEIGHT_PX;
  const halfW = w / 2;
  const halfH = h / 2;
  const map = new Map<string, MergeGroupBboxTableInput>();

  for (const id of tableIds) {
    const pos = positions.get(id);
    if (!pos) {
      continue;
    }
    const center = gridCellCenterPx(pos.col, pos.row, gridConfig);
    map.set(id, {
      id,
      centerX: center.x,
      centerY: center.y,
      halfWidth: halfW,
      halfHeight: halfH,
    });
  }
  return map;
}
