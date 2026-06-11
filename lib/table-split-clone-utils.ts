import dayjs, { type Dayjs } from "dayjs";
import type { DiningTable } from "@/lib/types";
import {
  formatMergeGroupDate,
  formatMergeGroupDateRange,
  validateMergeGroupDateRange,
} from "@/lib/merge-group-utils";

export type SplitCloneLifecycle = "scheduled" | "active" | "expired";

export function formatSplitCloneDateRange(startDate: string, endDate: string): string {
  return formatMergeGroupDateRange(startDate, endDate);
}

/** True when the clone's end date is before the given calendar day (default: today). */
export function isSplitCloneExpired(
  clone: Pick<DiningTable, "splitStartDate" | "splitEndDate">,
  date: Dayjs = dayjs()
): boolean {
  if (!clone.splitEndDate) {
    return false;
  }
  return date.startOf("day").isAfter(clone.splitEndDate, "day");
}

export function getSplitCloneLifecycleStatus(
  clone: Pick<DiningTable, "splitStartDate" | "splitEndDate">,
  date: Dayjs = dayjs()
): SplitCloneLifecycle {
  if (!clone.splitStartDate || !clone.splitEndDate) {
    return "active";
  }
  const day = date.startOf("day");
  if (day.isBefore(clone.splitStartDate, "day")) {
    return "scheduled";
  }
  if (day.isAfter(clone.splitEndDate, "day")) {
    return "expired";
  }
  return "active";
}

/** Calendar day to open on Sơ đồ when jumping to a split clone. */
export function resolveSplitCloneNavigationDate(
  clone: Pick<DiningTable, "splitStartDate" | "splitEndDate">,
  referenceDate: Dayjs = dayjs()
): string {
  if (!clone.splitStartDate || !clone.splitEndDate) {
    return formatMergeGroupDate(referenceDate);
  }
  const start = dayjs(clone.splitStartDate, "YYYY-MM-DD", true).startOf("day");
  const end = dayjs(clone.splitEndDate, "YYYY-MM-DD", true).startOf("day");
  const ref = referenceDate.startOf("day");
  if (!ref.isBefore(start, "day") && !ref.isAfter(end, "day")) {
    return formatMergeGroupDate(ref);
  }
  const today = dayjs().startOf("day");
  if (!today.isBefore(start, "day") && !today.isAfter(end, "day")) {
    return formatMergeGroupDate(today);
  }
  return clone.splitStartDate;
}

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

const SPLIT_CLONE_NEIGHBOR_OFFSETS: ReadonlyArray<{ dc: number; dr: number }> = [
  { dc: -1, dr: 0 },
  { dc: 1, dr: 0 },
  { dc: 0, dr: -1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: -1 },
  { dc: 1, dr: -1 },
  { dc: -1, dr: 1 },
  { dc: 1, dr: 1 },
];

function splitCloneNeighborPriority(dc: number, dr: number): number {
  const index = SPLIT_CLONE_NEIGHBOR_OFFSETS.findIndex(
    (offset) => offset.dc === dc && offset.dr === dr
  );
  return index >= 0 ? index : SPLIT_CLONE_NEIGHBOR_OFFSETS.length;
}

/**
 * Place a split clone beside its source table.
 * When any immediate neighbor is free: left → right → top → below → corners.
 * When all eight neighbors are taken: the globally nearest free grid cell.
 */
export function findAdjacentFreeGridCell(input: {
  sourceCol: number;
  sourceRow: number;
  occupiedCells: ReadonlySet<string>;
  gridColumns: number;
  gridRows: number;
}): { col: number; row: number } | null {
  const { sourceCol, sourceRow, occupiedCells, gridColumns, gridRows } = input;

  const isFree = (col: number, row: number): boolean => {
    if (col < 0 || col >= gridColumns || row < 0 || row >= gridRows) {
      return false;
    }
    return !occupiedCells.has(`${col}-${row}`);
  };

  for (const { dc, dr } of SPLIT_CLONE_NEIGHBOR_OFFSETS) {
    const col = sourceCol + dc;
    const row = sourceRow + dr;
    if (isFree(col, row)) {
      return { col, row };
    }
  }

  let nearest: { col: number; row: number } | null = null;
  let nearestChebyshev = Number.POSITIVE_INFINITY;
  let nearestManhattan = Number.POSITIVE_INFINITY;
  let nearestPriority = Number.POSITIVE_INFINITY;

  for (let row = 0; row < gridRows; row += 1) {
    for (let col = 0; col < gridColumns; col += 1) {
      if (!isFree(col, row)) {
        continue;
      }
      const dc = col - sourceCol;
      const dr = row - sourceRow;
      const chebyshev = Math.max(Math.abs(dc), Math.abs(dr));
      const manhattan = Math.abs(dc) + Math.abs(dr);
      const priority = splitCloneNeighborPriority(dc, dr);

      if (
        chebyshev < nearestChebyshev ||
        (chebyshev === nearestChebyshev && manhattan < nearestManhattan) ||
        (chebyshev === nearestChebyshev &&
          manhattan === nearestManhattan &&
          priority < nearestPriority)
      ) {
        nearest = { col, row };
        nearestChebyshev = chebyshev;
        nearestManhattan = manhattan;
        nearestPriority = priority;
      }
    }
  }

  return nearest;
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
