import {
  FLOOR_GRID_ROW_HEIGHT_PX,
  FLOOR_TABLE_BLOCK_WIDTH_PX,
} from "@/lib/floor-map-layout";
import { gridCellCenterPx, type FloorMapRglGridConfig } from "@/lib/floor-map-rgl";

export const MERGE_GROUP_HEADER_BASE_HEIGHT_PX = 28;
export const MERGE_GROUP_HEADER_BOOKED_HEIGHT_PX = 54;
/** Taller header when the strip stacks vertically (narrow width). */
export const MERGE_GROUP_HEADER_VERTICAL_BOOKED_HEIGHT_PX = 50;
export const MERGE_GROUP_HEADER_TABLE_GAP_PX = 6;
/** Table card border — keep bbox inset clear of the merge frame. */
export const MERGE_MEMBER_TABLE_BORDER_PX = 1;
/** Merge container dashed border (matches `.mergeGroupContainer`). */
export const MERGE_GROUP_FRAME_BORDER_PX = 2;
const MERGE_BBOX_MARGIN_X_PX = 10 + MERGE_MEMBER_TABLE_BORDER_PX;
const MERGE_BBOX_MARGIN_Y_PX = MERGE_GROUP_HEADER_TABLE_GAP_PX + MERGE_MEMBER_TABLE_BORDER_PX;

export type MergeStripLayout = "horizontal" | "vertical" | "mixed";

export type MergeMemberEdgeMask = {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
};

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
  layout: MergeStripLayout;
  memberEdgeMasksByTableId: ReadonlyMap<string, MergeMemberEdgeMask>;
};

function cellKey(row: number, col: number) {
  return `${row}-${col}`;
}

/** Whether merge members form a single row, a single column, or an L-shape. */
export function deriveMergeStripLayout(
  memberCells: ReadonlyArray<{ row: number; col: number }>
): MergeStripLayout {
  if (memberCells.length <= 1) {
    return "horizontal";
  }
  const rows = new Set(memberCells.map((cell) => cell.row));
  const cols = new Set(memberCells.map((cell) => cell.col));
  if (rows.size > 1 && cols.size === 1) {
    return "vertical";
  }
  if (cols.size > 1 && rows.size === 1) {
    return "horizontal";
  }
  return "mixed";
}

/** External edges only — internal adjacency drops borders to avoid double lines. */
export function mergeMemberEdgeMaskForCell(
  cell: { row: number; col: number },
  memberCells: ReadonlyArray<{ row: number; col: number }>
): MergeMemberEdgeMask {
  const occupied = new Set(memberCells.map((item) => cellKey(item.row, item.col)));
  return {
    top: !occupied.has(cellKey(cell.row - 1, cell.col)),
    right: !occupied.has(cellKey(cell.row, cell.col + 1)),
    bottom: !occupied.has(cellKey(cell.row + 1, cell.col)),
    left: !occupied.has(cellKey(cell.row, cell.col - 1)),
  };
}

export function mergeMemberEdgeMasksForGroup(
  tableIds: readonly string[],
  memberPositions: ReadonlyMap<string, { row: number; col: number }>
): ReadonlyMap<string, MergeMemberEdgeMask> {
  const cells: Array<{ row: number; col: number }> = [];
  for (const tableId of tableIds) {
    const pos = memberPositions.get(tableId);
    if (pos) {
      cells.push(pos);
    }
  }
  const masks = new Map<string, MergeMemberEdgeMask>();
  for (const tableId of tableIds) {
    const pos = memberPositions.get(tableId);
    if (!pos) {
      continue;
    }
    masks.set(tableId, mergeMemberEdgeMaskForCell(pos, cells));
  }
  return masks;
}

/** Per-side borders for merge members — drops internal edges to prevent double lines. */
export function mergeMemberBorderStyleFromMask(
  mask: MergeMemberEdgeMask,
  borderColor: string,
  borderWidthPx = MERGE_MEMBER_TABLE_BORDER_PX
): {
  borderTop: string;
  borderRight: string;
  borderBottom: string;
  borderLeft: string;
} {
  const side = (visible: boolean) =>
    visible ? `${borderWidthPx}px solid ${borderColor}` : "none";
  return {
    borderTop: side(mask.top),
    borderRight: side(mask.right),
    borderBottom: side(mask.bottom),
    borderLeft: side(mask.left),
  };
}

const MERGE_MEMBER_BORDER_BY_STATUS: Record<
  "available" | "hold" | "occupied" | "locked",
  string
> = {
  available: "rgba(32, 201, 151, 0.55)",
  hold: "rgba(250, 197, 21, 0.65)",
  occupied: "rgba(151, 112, 215, 0.55)",
  locked: "rgba(100, 116, 139, 0.55)",
};

export function mergeMemberBorderStyleForStatus(
  mask: MergeMemberEdgeMask,
  status: keyof typeof MERGE_MEMBER_BORDER_BY_STATUS
) {
  return mergeMemberBorderStyleFromMask(mask, MERGE_MEMBER_BORDER_BY_STATUS[status]);
}

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
  /** Grid row/col per member — drives strip layout + per-table border masks. */
  memberPositions?: ReadonlyMap<string, { row: number; col: number }>;
  /** When false, vertical merge groups with a day booking use a taller header. */
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

    const memberCells: Array<{ row: number; col: number }> = [];
    for (const tableId of group.tableIds) {
      const pos = input.memberPositions?.get(tableId);
      if (pos) {
        memberCells.push(pos);
      }
    }
    const layout = deriveMergeStripLayout(memberCells);
    const hasBooking = input.groupHasBookingOnDay?.(group.id) ?? false;
    const headerHeight =
      !compactHeader && layout === "vertical" && hasBooking
        ? MERGE_GROUP_HEADER_VERTICAL_BOOKED_HEIGHT_PX
        : MERGE_GROUP_HEADER_BASE_HEIGHT_PX;
    const xMin = tableXMin - MERGE_BBOX_MARGIN_X_PX;
    const xMax = tableXMax + MERGE_BBOX_MARGIN_X_PX;
    const yMin = minTableTop - headerHeight - MERGE_BBOX_MARGIN_Y_PX;
    const yMax = maxTableBottom + MERGE_BBOX_MARGIN_Y_PX;
    const memberEdgeMasksByTableId = input.memberPositions
      ? mergeMemberEdgeMasksForGroup(group.tableIds, input.memberPositions)
      : new Map<string, MergeMemberEdgeMask>();

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
      layout,
      memberEdgeMasksByTableId,
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
  const h = options?.tableHeightPx ?? FLOOR_GRID_ROW_HEIGHT_PX;
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
