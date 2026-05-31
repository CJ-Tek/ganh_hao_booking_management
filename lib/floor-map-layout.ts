/**
 * Floor map layout — single source of truth for table card size vs grid spacing.
 * Keep `page.module.css` `.tableBlock` width equal to {@link FLOOR_TABLE_BLOCK_WIDTH_PX}.
 * Table cards are centered on each grid node in the app using `transform: translate(-50%, -50%)`
 * from `(left, top) =` node coordinates (see floor-map `tableFloorAnchor` styles).
 */

/** Table card width on the canvas (px). */
export const FLOOR_TABLE_BLOCK_WIDTH_PX = 152;

/**
 * Bounding height for fit/zoom and stack math (px). Cards use `height: auto`; keep this
 * ≥ typical rendered height so “Fit” and bounds stay correct.
 */
export const FLOOR_TABLE_BLOCK_HEIGHT_PX = 168;

/** View-mode card without booking peek — title + status badge rows (px). */
export const FLOOR_TABLE_BLOCK_COMPACT_HEIGHT_PX = 60;

/** Edit-mode card — name row only (px). */
export const FLOOR_TABLE_BLOCK_EDIT_HEIGHT_PX = 52;

/** Booking peek block: customer + reservation time (px). */
export const FLOOR_TABLE_BLOCK_BOOKING_PEEK_HEIGHT_PX = 54;

/** Extra peek line when seated / checked-in shows check-in time (px). */
export const FLOOR_TABLE_BLOCK_CHECKIN_PEEK_HEIGHT_PX = 18;

/** Split-clone availability line under the card (px). */
export const FLOOR_TABLE_BLOCK_SPLIT_CLONE_PEEK_HEIGHT_PX = 28;

export type EstimateFloorTableBlockHeightInput = {
  showBookingPeek?: boolean;
  showCheckInLine?: boolean;
  showSplitCloneAvailability?: boolean;
};

/** Mirrors {@link FloorTableBlockView} vertical layout for merge-group bbox math. */
export function estimateFloorTableBlockHeightPx(
  input: EstimateFloorTableBlockHeightInput = {}
): number {
  let height = FLOOR_TABLE_BLOCK_COMPACT_HEIGHT_PX;
  if (input.showBookingPeek) {
    height += FLOOR_TABLE_BLOCK_BOOKING_PEEK_HEIGHT_PX;
    if (input.showCheckInLine) {
      height += FLOOR_TABLE_BLOCK_CHECKIN_PEEK_HEIGHT_PX;
    }
  }
  if (input.showSplitCloneAvailability) {
    height += FLOOR_TABLE_BLOCK_SPLIT_CLONE_PEEK_HEIGHT_PX;
  }
  return height;
}

/** RGL row / grid-cell height (px). Cards are shorter than the bounds box and centered in the cell. */
export const FLOOR_GRID_ROW_HEIGHT_PX = 112;

/** Stagger when multiple tables share one grid node (px). */
export const FLOOR_TABLE_STACK_OFFSET_PX = 12;

/**
 * `DiningTable.positionX` / `positionY` when the table is in the "Bàn khả dụng" palette (not on
 * the floor grid yet). Must be outside `0..gridSize-1` so floor map `isTableInGrid` is false.
 */
export const FLOOR_TABLE_PALETTE_SENTINEL = -1;

/**
 * Target visual gap between adjacent table cards when using the default node spacing
 * (center distance − max(card width, card height)).
 */
export const FLOOR_GRID_NODE_GAP_PX = 40;

/** Default distance between grid node centers (px). */
export const FLOOR_DEFAULT_NODE_SPACING_PX =
  Math.max(FLOOR_TABLE_BLOCK_WIDTH_PX, FLOOR_TABLE_BLOCK_HEIGHT_PX) + FLOOR_GRID_NODE_GAP_PX;

/** Minimum center distance so default-width cards do not overlap (px). */
export const FLOOR_NODE_SPACING_MIN_PX = FLOOR_TABLE_BLOCK_WIDTH_PX + 24;

export const FLOOR_NODE_SPACING_MAX_PX = 280;

export function clampFloorNodeSpacing(raw: number): number {
  return Math.min(
    FLOOR_NODE_SPACING_MAX_PX,
    Math.max(FLOOR_NODE_SPACING_MIN_PX, Math.round(raw))
  );
}
