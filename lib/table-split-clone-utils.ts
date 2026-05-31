import dayjs, { type Dayjs } from "dayjs";
import type { DiningTable } from "@/lib/types";
import { validateMergeGroupDateRange } from "@/lib/merge-group-utils";

export function isSplitCloneTable(
  table: Pick<DiningTable, "splitSourceTableId">
): boolean {
  return Boolean(table.splitSourceTableId);
}

export function isSplitCloneEffectiveOnDate(
  table: Pick<DiningTable, "splitSourceTableId" | "splitStartDate" | "splitEndDate">,
  date: Dayjs
): boolean {
  if (!isSplitCloneTable(table) || !table.splitStartDate || !table.splitEndDate) {
    return false;
  }
  const day = date.startOf("day");
  return (
    !day.isBefore(table.splitStartDate, "day") && !day.isAfter(table.splitEndDate, "day")
  );
}

export function filterTablesForFloorMapDay(
  tables: DiningTable[],
  date: Dayjs
): DiningTable[] {
  return tables.filter((table) => {
    if (!isSplitCloneTable(table)) {
      return true;
    }
    return isSplitCloneEffectiveOnDate(table, date);
  });
}

export function formatSplitCloneName(sourceName: string, cloneNumber: number): string {
  return `${sourceName} - ${cloneNumber}`;
}

export function validateSplitCloneDateRange(input: {
  startDate: string;
  endDate: string;
}): { ok: true } | { ok: false; message: string } {
  return validateMergeGroupDateRange(input);
}

export function pickNextSplitCloneNumber(
  existingNumbers: readonly number[]
): number {
  const used = new Set(existingNumbers.filter((n) => Number.isInteger(n) && n > 0));
  let candidate = 1;
  while (used.has(candidate)) {
    candidate += 1;
  }
  return candidate;
}

/** Find the nearest free grid cell adjacent to the source table. */
export function findAdjacentFreeGridCell(input: {
  sourceCol: number;
  sourceRow: number;
  occupiedCells: ReadonlySet<string>;
  gridColumns: number;
  gridRows: number;
}): { col: number; row: number } | null {
  const { sourceCol, sourceRow, occupiedCells, gridColumns, gridRows } = input;
  const deltas: Array<{ col: number; row: number }> = [];
  for (let radius = 1; radius <= Math.max(gridColumns, gridRows); radius += 1) {
    for (let dc = -radius; dc <= radius; dc += 1) {
      for (let dr = -radius; dr <= radius; dr += 1) {
        if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) {
          continue;
        }
        deltas.push({ col: sourceCol + dc, row: sourceRow + dr });
      }
    }
  }
  for (const delta of deltas) {
    if (
      delta.col < 0 ||
      delta.col >= gridColumns ||
      delta.row < 0 ||
      delta.row >= gridRows
    ) {
      continue;
    }
    const key = `${delta.col}-${delta.row}`;
    if (!occupiedCells.has(key)) {
      return delta;
    }
  }
  return null;
}

export function buildOccupiedGridCells(
  tables: Array<Pick<DiningTable, "id" | "positionX" | "positionY">>,
  gridColumns: number,
  gridRows: number,
  excludeTableId?: string
): Set<string> {
  const occupied = new Set<string>();
  for (const table of tables) {
    if (excludeTableId && table.id === excludeTableId) {
      continue;
    }
    const col = table.positionX;
    const row = table.positionY;
    if (
      Number.isInteger(col) &&
      Number.isInteger(row) &&
      col >= 0 &&
      col < gridColumns &&
      row >= 0 &&
      row < gridRows
    ) {
      occupied.add(`${col}-${row}`);
    }
  }
  return occupied;
}
