import type { Layout, LayoutItem } from "react-grid-layout";
import {
  calcGridCellDimensions,
  calcGridItemPosition,
  getCompactor,
  setTransform,
  type GridCellDimensions,
  type PositionStrategy,
} from "react-grid-layout/core";
import {
  FLOOR_GRID_ROW_HEIGHT_PX,
  FLOOR_TABLE_BLOCK_WIDTH_PX,
} from "@/lib/floor-map-layout";

/** Matches legacy floor-map canvas padding (px). */
export const FLOOR_MAP_CANVAS_PADDING = 64;

/** Slot-based grid: no compaction, overlapping cells allowed (stacked tables). */
export const FLOOR_MAP_RGL_COMPACTOR = getCompactor(null, true, false);

/**
 * RGL position strategy for a grid inside a CSS-transformed canvas (pan + zoom).
 * Sets `scale` so react-draggable and palette drops compensate for zoom, but omits
 * `calcDragPosition` so drag origin stays parent-relative (pan translate is respected).
 */
export function createViewportScaledStrategy(scale: number): PositionStrategy {
  return {
    type: "transform",
    scale,
    calcStyle(pos) {
      return setTransform(pos);
    },
  };
}

export type FloorMapRglGridConfig = {
  cols: number;
  rows: number;
  nodeSpacing: number;
  margin: [number, number];
  rowHeight: number;
  containerPadding: [number, number];
  width: number;
  height: number;
};

export function buildFloorMapRglGridConfig(
  cols: number,
  rows: number,
  nodeSpacing: number
): FloorMapRglGridConfig {
  const marginX = Math.max(0, nodeSpacing - FLOOR_TABLE_BLOCK_WIDTH_PX);
  const marginY = Math.max(0, nodeSpacing - FLOOR_GRID_ROW_HEIGHT_PX);
  const rowHeight = FLOOR_GRID_ROW_HEIGHT_PX;
  const margin: [number, number] = [marginX, marginY];
  const containerPadding: [number, number] = [
    FLOOR_MAP_CANVAS_PADDING,
    FLOOR_MAP_CANVAS_PADDING,
  ];

  const width =
    containerPadding[0] * 2 +
    cols * FLOOR_TABLE_BLOCK_WIDTH_PX +
    Math.max(0, cols - 1) * marginX;

  // Match legacy canvas: node centers span (rows − 1) × nodeSpacing; last row adds rowHeight.
  const height =
    containerPadding[1] * 2 +
    Math.max(0, rows - 1) * nodeSpacing +
    rowHeight;

  return {
    cols,
    rows,
    nodeSpacing,
    margin,
    rowHeight,
    containerPadding,
    width,
    height,
  };
}

export function floorMapRglPositionParams(config: FloorMapRglGridConfig) {
  return {
    margin: config.margin,
    containerPadding: config.containerPadding,
    containerWidth: config.width,
    cols: config.cols,
    rowHeight: config.rowHeight,
    maxRows: config.rows,
  };
}

export function floorMapGridCellDimensions(
  config: FloorMapRglGridConfig
): GridCellDimensions {
  return calcGridCellDimensions({
    width: config.width,
    cols: config.cols,
    rowHeight: config.rowHeight,
    margin: config.margin,
    containerPadding: config.containerPadding,
  });
}

/** Pixel center of a grid cell (for merge boxes and fit bounds). */
export function gridCellCenterPx(
  col: number,
  row: number,
  config: FloorMapRglGridConfig
): { x: number; y: number } {
  const pos = calcGridItemPosition(
    floorMapRglPositionParams(config),
    col,
    row,
    1,
    1
  );
  return {
    x: pos.left + pos.width / 2,
    y: pos.top + pos.height / 2,
  };
}

export function floorMapTablesToRglLayout(
  tableIds: readonly string[],
  positions: Record<string, { x: number; y: number }>,
  options: {
    isEditMode: boolean;
    mergeMemberIds: ReadonlySet<string>;
    gridColumns: number;
    gridRows: number;
  }
): LayoutItem[] {
  const items: LayoutItem[] = [];
  for (const id of tableIds) {
    const pos = positions[id];
    if (!pos) {
      continue;
    }
    if (
      !Number.isInteger(pos.x) ||
      !Number.isInteger(pos.y) ||
      pos.x < 0 ||
      pos.y < 0 ||
      pos.x >= options.gridColumns ||
      pos.y >= options.gridRows
    ) {
      continue;
    }
    const isMergeMember = options.mergeMemberIds.has(id);
    items.push({
      i: id,
      x: pos.x,
      y: pos.y,
      w: 1,
      h: 1,
      static: !options.isEditMode || isMergeMember,
      isDraggable: options.isEditMode && !isMergeMember,
      isResizable: false,
    });
  }
  return items;
}

export function rglLayoutToPositions(layout: Layout): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const item of layout) {
    positions[item.i] = { x: item.x, y: item.y };
  }
  return positions;
}

/** Map world coordinates (inside scaled canvas) to nearest grid cell. */
export function nearestGridCellFromWorldPx(
  worldX: number,
  worldY: number,
  config: FloorMapRglGridConfig
): { col: number; row: number } {
  const dims = floorMapGridCellDimensions(config);
  const stepX = dims.cellWidth + dims.gapX;
  const stepY = dims.cellHeight + dims.gapY;
  const col = Math.round((worldX - dims.offsetX - dims.cellWidth / 2) / stepX);
  const row = Math.round((worldY - dims.offsetY - dims.cellHeight / 2) / stepY);
  return {
    col: Math.min(Math.max(col, 0), config.cols - 1),
    row: Math.min(Math.max(row, 0), config.rows - 1),
  };
}
