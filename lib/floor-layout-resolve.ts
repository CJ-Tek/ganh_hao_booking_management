import {
  FLOOR_DEFAULT_NODE_SPACING_PX,
  clampFloorNodeSpacing,
} from "@/lib/floor-map-layout";
import type {
  AreaFloorLayoutByDate,
  FloorLayoutPositionsRecord,
  FloorLayoutSnapshot,
} from "@/lib/floor-layout-snapshot";
import {
  positionsRecordFromSnapshot,
  snapshotFromGlobalArea,
  snapshotFromPositionsRecord,
} from "@/lib/floor-layout-snapshot";
import type { Area, DiningTable } from "@/lib/types";

const DEFAULT_GRID_COLUMNS = 12;
const DEFAULT_GRID_ROWS = 8;

export type ResolvedFloorLayout = {
  floorGridColumns: number;
  floorGridRows: number;
  floorNodeSpacing: number;
  positions: FloorLayoutPositionsRecord;
  /** True when a per-day override row exists for this date. */
  hasDayOverride: boolean;
  sourceTemplateId: string | null;
};

export function resolveFloorLayoutForDate(input: {
  area: Pick<Area, "id" | "floorGridColumns" | "floorGridRows" | "floorNodeSpacing">;
  tablesInArea: DiningTable[];
  dayOverride: AreaFloorLayoutByDate | null | undefined;
}): ResolvedFloorLayout {
  const globalSnapshot = snapshotFromGlobalArea(input.area, input.tablesInArea);

  if (!input.dayOverride) {
    return {
      floorGridColumns: globalSnapshot.floorGridColumns,
      floorGridRows: globalSnapshot.floorGridRows,
      floorNodeSpacing: globalSnapshot.floorNodeSpacing,
      positions: positionsRecordFromSnapshot(globalSnapshot),
      hasDayOverride: false,
      sourceTemplateId: null,
    };
  }

  const dayPositions = { ...input.dayOverride.tablePositions };
  for (const table of input.tablesInArea) {
    if (!(table.id in dayPositions)) {
      dayPositions[table.id] = { x: table.positionX, y: table.positionY };
    }
  }

  return {
    floorGridColumns: input.dayOverride.floorGridColumns,
    floorGridRows: input.dayOverride.floorGridRows,
    floorNodeSpacing: clampFloorNodeSpacing(input.dayOverride.floorNodeSpacing),
    positions: dayPositions,
    hasDayOverride: true,
    sourceTemplateId: input.dayOverride.sourceTemplateId,
  };
}

export function resolvedLayoutToSnapshot(
  resolved: ResolvedFloorLayout,
  tablesInArea: DiningTable[]
): FloorLayoutSnapshot {
  return snapshotFromPositionsRecord(
    {
      floorGridColumns: resolved.floorGridColumns,
      floorGridRows: resolved.floorGridRows,
      floorNodeSpacing: resolved.floorNodeSpacing,
    },
    resolved.positions,
    tablesInArea.map((t) => t.id)
  );
}

export function globalGridFromArea(
  area: Pick<Area, "floorGridColumns" | "floorGridRows" | "floorNodeSpacing"> | undefined
): Pick<ResolvedFloorLayout, "floorGridColumns" | "floorGridRows" | "floorNodeSpacing"> {
  return {
    floorGridColumns: area?.floorGridColumns ?? DEFAULT_GRID_COLUMNS,
    floorGridRows: area?.floorGridRows ?? DEFAULT_GRID_ROWS,
    floorNodeSpacing: clampFloorNodeSpacing(
      area?.floorNodeSpacing ?? FLOOR_DEFAULT_NODE_SPACING_PX
    ),
  };
}
