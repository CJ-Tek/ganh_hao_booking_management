import type { Json } from "@/lib/database.types";
import {
  FLOOR_DEFAULT_NODE_SPACING_PX,
  clampFloorNodeSpacing,
} from "@/lib/floor-map-layout";
import type { Area, DiningTable } from "@/lib/types";

export type FloorLayoutTablePosition = { tableId: string; x: number; y: number };

export type FloorLayoutSnapshot = {
  floorGridColumns: number;
  floorGridRows: number;
  floorNodeSpacing: number;
  tablePositions: FloorLayoutTablePosition[];
};

export type FloorLayoutPositionsRecord = Record<string, { x: number; y: number }>;

export type AreaFloorLayoutByDate = {
  id: string;
  areaId: string;
  layoutDate: string;
  floorGridColumns: number;
  floorGridRows: number;
  floorNodeSpacing: number;
  tablePositions: FloorLayoutPositionsRecord;
  sourceTemplateId: string | null;
  /** When set, layout is auto-managed for this merge and reverts to global when merge ends. */
  mergeGroupId: string | null;
  updatedAt: string;
  updatedByUserId: string | null;
};

const DEFAULT_GRID_COLUMNS = 12;
const DEFAULT_GRID_ROWS = 8;

export function clampFloorGridColumns(value: number): number {
  return Math.min(24, Math.max(4, Math.round(value)));
}

export function clampFloorGridRows(value: number): number {
  return Math.min(18, Math.max(4, Math.round(value)));
}

export function normalizeFloorLayoutSnapshot(
  input: Partial<FloorLayoutSnapshot> | null | undefined
): FloorLayoutSnapshot {
  return {
    floorGridColumns: clampFloorGridColumns(input?.floorGridColumns ?? DEFAULT_GRID_COLUMNS),
    floorGridRows: clampFloorGridRows(input?.floorGridRows ?? DEFAULT_GRID_ROWS),
    floorNodeSpacing: clampFloorNodeSpacing(
      input?.floorNodeSpacing ?? FLOOR_DEFAULT_NODE_SPACING_PX
    ),
    tablePositions: (input?.tablePositions ?? []).map((p) => ({
      tableId: p.tableId,
      x: Math.round(p.x),
      y: Math.round(p.y),
    })),
  };
}

export function positionsRecordFromSnapshot(
  snapshot: FloorLayoutSnapshot
): FloorLayoutPositionsRecord {
  const record: FloorLayoutPositionsRecord = {};
  for (const pos of snapshot.tablePositions) {
    record[pos.tableId] = { x: pos.x, y: pos.y };
  }
  return record;
}

export function snapshotFromPositionsRecord(
  grid: Pick<FloorLayoutSnapshot, "floorGridColumns" | "floorGridRows" | "floorNodeSpacing">,
  positions: FloorLayoutPositionsRecord,
  tableIds?: string[]
): FloorLayoutSnapshot {
  const ids =
    tableIds ??
    Object.keys(positions).sort((a, b) => a.localeCompare(b, "vi"));
  return normalizeFloorLayoutSnapshot({
    ...grid,
    tablePositions: ids.map((tableId) => {
      const p = positions[tableId];
      return { tableId, x: p?.x ?? -1, y: p?.y ?? -1 };
    }),
  });
}

export function snapshotFromGlobalArea(
  area: Pick<Area, "floorGridColumns" | "floorGridRows" | "floorNodeSpacing">,
  tablesInArea: DiningTable[]
): FloorLayoutSnapshot {
  return normalizeFloorLayoutSnapshot({
    floorGridColumns: area.floorGridColumns,
    floorGridRows: area.floorGridRows,
    floorNodeSpacing: area.floorNodeSpacing,
    tablePositions: tablesInArea.map((t) => ({
      tableId: t.id,
      x: t.positionX,
      y: t.positionY,
    })),
  });
}

export function parseFloorLayoutSnapshotJson(json: Json | null | undefined): FloorLayoutSnapshot | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return null;
  }
  const raw = json as Record<string, unknown>;
  const tablePositionsRaw = raw.tablePositions;
  if (!Array.isArray(tablePositionsRaw)) {
    return null;
  }
  const tablePositions: FloorLayoutTablePosition[] = [];
  for (const item of tablePositionsRaw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as Record<string, unknown>;
    if (typeof row.tableId !== "string") {
      continue;
    }
    tablePositions.push({
      tableId: row.tableId,
      x: typeof row.x === "number" ? row.x : Number(row.x),
      y: typeof row.y === "number" ? row.y : Number(row.y),
    });
  }
  return normalizeFloorLayoutSnapshot({
    floorGridColumns:
      typeof raw.floorGridColumns === "number" ? raw.floorGridColumns : undefined,
    floorGridRows: typeof raw.floorGridRows === "number" ? raw.floorGridRows : undefined,
    floorNodeSpacing:
      typeof raw.floorNodeSpacing === "number" ? raw.floorNodeSpacing : undefined,
    tablePositions,
  });
}

export function floorLayoutSnapshotToJson(snapshot: FloorLayoutSnapshot): Json {
  const normalized = normalizeFloorLayoutSnapshot(snapshot);
  return {
    floorGridColumns: normalized.floorGridColumns,
    floorGridRows: normalized.floorGridRows,
    floorNodeSpacing: normalized.floorNodeSpacing,
    tablePositions: normalized.tablePositions.map((p) => ({
      tableId: p.tableId,
      x: p.x,
      y: p.y,
    })),
  };
}

export function parseTablePositionsJson(json: Json | null | undefined): FloorLayoutPositionsRecord {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {};
  }
  const record: FloorLayoutPositionsRecord = {};
  for (const [tableId, value] of Object.entries(json)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }
    const pos = value as Record<string, unknown>;
    if (typeof pos.x !== "number" || typeof pos.y !== "number") {
      continue;
    }
    record[tableId] = { x: Math.round(pos.x), y: Math.round(pos.y) };
  }
  return record;
}

export function tablePositionsToJson(
  positions: FloorLayoutPositionsRecord
): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const [tableId, pos] of Object.entries(positions)) {
    out[tableId] = { x: Math.round(pos.x), y: Math.round(pos.y) };
  }
  return out;
}

export function applySnapshotToTablesInArea(
  tablesInArea: DiningTable[],
  positions: FloorLayoutPositionsRecord
): DiningTable[] {
  return tablesInArea.map((table) => {
    const pos = positions[table.id];
    if (!pos) {
      return table;
    }
    return { ...table, positionX: pos.x, positionY: pos.y };
  });
}

export function floorLayoutDayKey(areaId: string, layoutDate: string): string {
  return `${areaId}:${layoutDate}`;
}
