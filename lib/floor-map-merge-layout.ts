import type { DiningTable } from "@/lib/types";

export const MAX_FLOOR_GRID_ROWS = 18;
export const MIN_FLOOR_GRID_ROWS = 4;

export function isTableOnFloorGrid(
  table: Pick<DiningTable, "positionX" | "positionY">,
  gridColumns: number,
  gridRows: number
): boolean {
  return (
    Number.isInteger(table.positionX) &&
    Number.isInteger(table.positionY) &&
    table.positionX >= 0 &&
    table.positionX < gridColumns &&
    table.positionY >= 0 &&
    table.positionY < gridRows
  );
}

function cellKey(row: number, col: number) {
  return `${row}-${col}`;
}

function parseCellKey(key: string): { row: number; col: number } | null {
  const parts = key.split("-");
  if (parts.length !== 2) {
    return null;
  }
  const row = Number(parts[0]);
  const col = Number(parts[1]);
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return null;
  }
  return { row, col };
}

/**
 * Place `cellCount` consecutive grid cells starting at (startRow, startCol). When a row runs
 * out of columns, continue on the next row starting at `startCol` (below the strip anchor),
 * not column 0 — stays inside the floor grid.
 */
export function layoutWrappedMergeCells(
  startRow: number,
  startCol: number,
  cellCount: number,
  gridColumns: number,
  gridRows: number
): Array<{ row: number; col: number }> | null {
  if (cellCount <= 0 || startRow < 0 || startCol < 0 || startCol >= gridColumns) {
    return null;
  }
  const wrapCol = startCol;
  const cells: Array<{ row: number; col: number }> = [];
  let row = startRow;
  let col = startCol;
  for (let index = 0; index < cellCount; index++) {
    if (row >= gridRows) {
      return null;
    }
    if (col >= gridColumns) {
      row += 1;
      col = wrapCol;
      if (row >= gridRows) {
        return null;
      }
    }
    cells.push({ row, col });
    col += 1;
  }
  return cells;
}

function layoutWrappedMergeCellsWithRowGrowth(
  startRow: number,
  startCol: number,
  cellCount: number,
  gridColumns: number,
  startGridRows: number
): { layout: Array<{ row: number; col: number }>; gridRows: number } | null {
  for (let gridRows = startGridRows; gridRows <= MAX_FLOOR_GRID_ROWS; gridRows++) {
    const layout = layoutWrappedMergeCells(
      startRow,
      startCol,
      cellCount,
      gridColumns,
      gridRows
    );
    if (layout) {
      return { layout, gridRows };
    }
  }
  return null;
}

function findTableAtCell(
  positions: Map<string, { row: number; col: number }>,
  row: number,
  col: number,
  exceptId?: string
): string | null {
  const key = cellKey(row, col);
  for (const [tableId, pos] of positions) {
    if (tableId === exceptId) {
      continue;
    }
    if (cellKey(pos.row, pos.col) === key) {
      return tableId;
    }
  }
  return null;
}

function findNonMemberTablesAtCell(
  positions: Map<string, { row: number; col: number }>,
  row: number,
  col: number,
  memberIds: Set<string>
): string[] {
  const key = cellKey(row, col);
  const occupants: string[] = [];
  for (const [tableId, pos] of positions) {
    if (memberIds.has(tableId)) {
      continue;
    }
    if (cellKey(pos.row, pos.col) === key) {
      occupants.push(tableId);
    }
  }
  return occupants;
}

function manhattanDistance(
  a: { row: number; col: number },
  b: { row: number; col: number }
): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function buildOccupiedCellKeys(
  positions: Map<string, { row: number; col: number }>,
  exceptTableId?: string
): Set<string> {
  const occupied = new Set<string>();
  for (const [tableId, pos] of positions) {
    if (tableId === exceptTableId) {
      continue;
    }
    occupied.add(cellKey(pos.row, pos.col));
  }
  return occupied;
}

function isGridCellAvailable(
  row: number,
  col: number,
  occupied: Set<string>,
  reservedCells: Set<string>,
  gridColumns: number,
  gridRows: number
): boolean {
  if (row < 0 || col < 0 || row >= gridRows || col >= gridColumns) {
    return false;
  }
  const key = cellKey(row, col);
  if (reservedCells.has(key) || occupied.has(key)) {
    return false;
  }
  return true;
}

/**
 * Nearest empty grid node by Manhattan distance; stable tie-break (top-left first).
 */
export function findNearestEmptyGridCell(
  origin: { row: number; col: number },
  occupied: Set<string>,
  reservedCells: Set<string>,
  gridColumns: number,
  gridRows: number
): { row: number; col: number } | null {
  const maxDistance = gridRows + gridColumns;
  for (let distance = 0; distance <= maxDistance; distance++) {
    const candidates: Array<{ row: number; col: number }> = [];
    for (let row = 0; row < gridRows; row++) {
      for (let col = 0; col < gridColumns; col++) {
        if (manhattanDistance(origin, { row, col }) === distance) {
          candidates.push({ row, col });
        }
      }
    }
    candidates.sort((first, second) => first.row - second.row || first.col - second.col);
    for (const candidate of candidates) {
      if (
        isGridCellAvailable(
          candidate.row,
          candidate.col,
          occupied,
          reservedCells,
          gridColumns,
          gridRows
        )
      ) {
        return candidate;
      }
    }
  }
  return null;
}

/**
 * Move a non-member off merge-strip cells to the nearest empty grid dot; cascades if the
 * destination is occupied.
 */
function displaceTableToNearestEmpty(
  tableId: string,
  positions: Map<string, { row: number; col: number }>,
  reservedCells: Set<string>,
  memberIds: Set<string>,
  gridColumns: number,
  gridRows: number
): boolean {
  const origin = positions.get(tableId);
  if (!origin) {
    return false;
  }

  const occupied = buildOccupiedCellKeys(positions, tableId);
  const target = findNearestEmptyGridCell(
    origin,
    occupied,
    reservedCells,
    gridColumns,
    gridRows
  );
  if (!target) {
    return false;
  }

  const blockerId = findTableAtCell(positions, target.row, target.col, tableId);
  positions.set(tableId, target);
  if (blockerId && !memberIds.has(blockerId)) {
    return displaceTableToNearestEmpty(
      blockerId,
      positions,
      reservedCells,
      memberIds,
      gridColumns,
      gridRows
    );
  }
  return true;
}

function resolveMergeStripCollisions(input: {
  memberTableIds: string[];
  memberPositions: Map<string, { row: number; col: number }>;
  reservedCells: Set<string>;
  areaTables: Array<Pick<DiningTable, "id" | "positionX" | "positionY">>;
  gridColumns: number;
  gridRows: number;
}): { ok: boolean; positions: Map<string, { row: number; col: number }>; gridRows: number } {
  const memberIds = new Set(input.memberTableIds);
  const positions = new Map<string, { row: number; col: number }>();

  for (const table of input.areaTables) {
    if (!isTableOnFloorGrid(table, input.gridColumns, input.gridRows)) {
      continue;
    }
    positions.set(table.id, { row: table.positionY, col: table.positionX });
  }

  for (const [tableId, pos] of input.memberPositions) {
    positions.set(tableId, pos);
  }

  const toDisplace = new Set<string>();
  for (const key of input.reservedCells) {
    const parsed = parseCellKey(key);
    if (!parsed) {
      continue;
    }
    for (const occupantId of findNonMemberTablesAtCell(
      positions,
      parsed.row,
      parsed.col,
      memberIds
    )) {
      toDisplace.add(occupantId);
    }
  }

  const ordered = [...toDisplace].sort((firstId, secondId) => {
    const first = positions.get(firstId);
    const second = positions.get(secondId);
    if (!first || !second) {
      return firstId.localeCompare(secondId);
    }
    return first.row - second.row || first.col - second.col || firstId.localeCompare(secondId);
  });

  for (const tableId of ordered) {
    const pos = positions.get(tableId);
    if (!pos) {
      continue;
    }
    if (!input.reservedCells.has(cellKey(pos.row, pos.col))) {
      continue;
    }
    const ok = displaceTableToNearestEmpty(
      tableId,
      positions,
      input.reservedCells,
      memberIds,
      input.gridColumns,
      input.gridRows
    );
    if (!ok) {
      return { ok: false, positions, gridRows: input.gridRows };
    }
  }

  let requiredRows = input.gridRows;
  for (const pos of positions.values()) {
    requiredRows = Math.max(requiredRows, pos.row + 1);
  }
  requiredRows = Math.min(MAX_FLOOR_GRID_ROWS, Math.max(MIN_FLOOR_GRID_ROWS, requiredRows));

  for (const pos of positions.values()) {
    if (pos.row >= requiredRows || pos.col < 0 || pos.col >= input.gridColumns) {
      return { ok: false, positions, gridRows: requiredRows };
    }
  }

  const occupiedKeys = buildOccupiedCellKeys(positions);
  for (const key of occupiedKeys) {
    if (input.reservedCells.has(key)) {
      const parsed = parseCellKey(key);
      if (!parsed) {
        continue;
      }
      if (findNonMemberTablesAtCell(positions, parsed.row, parsed.col, memberIds).length > 0) {
        return { ok: false, positions, gridRows: requiredRows };
      }
    }
  }

  return { ok: true, positions, gridRows: requiredRows };
}

/**
 * Anchor (strip start) so the cell dropped on the former "+" plug slot — the last member
 * before the new plug — lands on `(plugRow, plugCol)`.
 */
export function findMergeStripAnchorForPlug(
  plugRow: number,
  plugCol: number,
  slotCount: number,
  gridColumns: number,
  gridRows: number
): { row: number; col: number } | null {
  const memberSlotIndex = slotCount >= 2 ? slotCount - 2 : 0;

  const search = (rows: number) => {
    for (let anchorRow = 0; anchorRow < rows; anchorRow++) {
      for (let anchorCol = 0; anchorCol < gridColumns; anchorCol++) {
        const wrapped = layoutWrappedMergeCellsWithRowGrowth(
          anchorRow,
          anchorCol,
          slotCount,
          gridColumns,
          rows
        );
        if (!wrapped) {
          continue;
        }
        const memberSlot = wrapped.layout[memberSlotIndex];
        if (memberSlot && memberSlot.row === plugRow && memberSlot.col === plugCol) {
          return { row: anchorRow, col: anchorCol };
        }
      }
    }
    return null;
  };

  const withinGrid = search(gridRows);
  if (withinGrid) {
    return withinGrid;
  }
  for (let rows = gridRows + 1; rows <= MAX_FLOOR_GRID_ROWS; rows++) {
    const found = search(rows);
    if (found) {
      return found;
    }
  }
  return null;
}

export type MergeGroupPackResult = {
  /** Merge members and any tables pushed to make room for the strip. */
  positionUpdates: Map<string, { row: number; col: number }>;
  gridRows: number;
};

/**
 * Pack merge members plus one trailing "+" plug cell. Rows wrap at the grid edge.
 * Non-member tables on the strip move to the nearest empty grid dot; rows grow when needed (up to 18).
 */
export function packMergeGroupTablePositions(input: {
  memberTableIds: string[];
  areaTables: Array<Pick<DiningTable, "id" | "positionX" | "positionY">>;
  gridColumns: number;
  gridRows: number;
  preferredAnchor?: { row: number; col: number };
}): MergeGroupPackResult | null {
  if (input.memberTableIds.length === 0) {
    return null;
  }
  const memberSet = new Set(input.memberTableIds);
  const slotCount = input.memberTableIds.length + 1;

  const memberCells = new Map<string, { row: number; col: number }>();
  for (const table of input.areaTables) {
    if (!isTableOnFloorGrid(table, input.gridColumns, input.gridRows)) {
      continue;
    }
    if (memberSet.has(table.id)) {
      memberCells.set(table.id, { row: table.positionY, col: table.positionX });
    }
  }

  let prefRow = 0;
  let prefCol = 0;
  if (input.preferredAnchor) {
    prefRow = input.preferredAnchor.row;
    prefCol = input.preferredAnchor.col;
  } else if (memberCells.size > 0) {
    let sumR = 0;
    let sumC = 0;
    for (const pos of memberCells.values()) {
      sumR += pos.row;
      sumC += pos.col;
    }
    prefRow = Math.round(sumR / memberCells.size);
    prefCol = Math.round(sumC / memberCells.size);
  }

  const initialSnapshot = new Map<string, { row: number; col: number }>();
  for (const table of input.areaTables) {
    if (isTableOnFloorGrid(table, input.gridColumns, input.gridRows)) {
      initialSnapshot.set(table.id, { row: table.positionY, col: table.positionX });
    }
  }

  type Candidate = {
    score: number;
    positionUpdates: Map<string, { row: number; col: number }>;
    gridRows: number;
  };
  const candidates: Candidate[] = [];

  const anchorRows: number[] = [];
  const anchorCols: number[] = [];
  if (input.preferredAnchor) {
    anchorRows.push(input.preferredAnchor.row);
    anchorCols.push(input.preferredAnchor.col);
  } else {
    for (let row = 0; row < input.gridRows; row++) {
      anchorRows.push(row);
    }
    for (let col = 0; col < input.gridColumns; col++) {
      anchorCols.push(col);
    }
  }

  for (const row of anchorRows) {
    for (const col of anchorCols) {
      const wrapped = layoutWrappedMergeCellsWithRowGrowth(
        row,
        col,
        slotCount,
        input.gridColumns,
        input.gridRows
      );
      if (!wrapped) {
        continue;
      }

      const memberPositions = new Map<string, { row: number; col: number }>();
      input.memberTableIds.forEach((tableId, index) => {
        const cell = wrapped.layout[index];
        if (cell) {
          memberPositions.set(tableId, cell);
        }
      });

      const reservedCells = new Set(
        wrapped.layout.map((cell) => cellKey(cell.row, cell.col))
      );

      const resolved = resolveMergeStripCollisions({
        memberTableIds: input.memberTableIds,
        memberPositions,
        reservedCells,
        areaTables: input.areaTables,
        gridColumns: input.gridColumns,
        gridRows: Math.max(input.gridRows, wrapped.gridRows),
      });

      if (!resolved.ok) {
        continue;
      }

      const positionUpdates = new Map<string, { row: number; col: number }>();
      let displacementCount = 0;
      let memberDisplacementCount = 0;
      for (const [tableId, pos] of resolved.positions) {
        const before = initialSnapshot.get(tableId);
        if (!before || before.row !== pos.row || before.col !== pos.col) {
          positionUpdates.set(tableId, pos);
          if (!memberSet.has(tableId)) {
            displacementCount += 1;
          } else {
            memberDisplacementCount += 1;
          }
        }
      }

      const rowGrowth = resolved.gridRows - input.gridRows;
      const score =
        Math.abs(row - prefRow) * 10 +
        Math.abs(col - prefCol) +
        rowGrowth * 100 +
        displacementCount * 8 +
        memberDisplacementCount * 4;

      candidates.push({
        score,
        positionUpdates,
        gridRows: resolved.gridRows,
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0]!;
  return {
    positionUpdates: best.positionUpdates,
    gridRows: best.gridRows,
  };
}

/** Strip anchor (top-left of wrapped layout) that matches current member cell positions. */
export function findMergeStripAnchorForMemberCells(
  memberTableIds: string[],
  positions: Map<string, { row: number; col: number }>,
  gridColumns: number,
  gridRows: number
): { row: number; col: number } | null {
  const memberCells = new Set<string>();
  for (const tableId of memberTableIds) {
    const pos = positions.get(tableId);
    if (!pos) {
      continue;
    }
    memberCells.add(cellKey(pos.row, pos.col));
  }
  if (memberCells.size === 0) {
    return null;
  }

  const slotCount = memberTableIds.length + 1;
  let bestAnchor: { row: number; col: number } | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let anchorRow = 0; anchorRow < gridRows; anchorRow++) {
    for (let anchorCol = 0; anchorCol < gridColumns; anchorCol++) {
      const wrapped = layoutWrappedMergeCellsWithRowGrowth(
        anchorRow,
        anchorCol,
        slotCount,
        gridColumns,
        gridRows
      );
      if (!wrapped) {
        continue;
      }
      const stripKeys = new Set(
        wrapped.layout
          .slice(0, memberTableIds.length)
          .map((cell) => cellKey(cell.row, cell.col))
      );
      let matches = true;
      for (const key of memberCells) {
        if (!stripKeys.has(key)) {
          matches = false;
          break;
        }
      }
      if (!matches) {
        continue;
      }
      const score = anchorRow * 1000 + anchorCol;
      if (score < bestScore) {
        bestScore = score;
        bestAnchor = { row: anchorRow, col: anchorCol };
      }
    }
  }

  return bestAnchor;
}

/** Member grid positions for a strip anchored at `(anchorRow, anchorCol)` (preview while dragging). */
export function getMergeMemberPositionsAtAnchor(
  memberTableIds: string[],
  anchorRow: number,
  anchorCol: number,
  gridColumns: number,
  gridRows: number
): Map<string, { row: number; col: number }> | null {
  if (memberTableIds.length === 0) {
    return null;
  }
  const wrapped = layoutWrappedMergeCellsWithRowGrowth(
    anchorRow,
    anchorCol,
    memberTableIds.length + 1,
    gridColumns,
    gridRows
  );
  if (!wrapped) {
    return null;
  }
  const result = new Map<string, { row: number; col: number }>();
  memberTableIds.forEach((tableId, index) => {
    const cell = wrapped.layout[index];
    if (cell) {
      result.set(tableId, cell);
    }
  });
  return result;
}

export type MergeGroupLayoutAtAnchorResult = {
  positions: Map<string, { row: number; col: number }>;
  gridRows: number;
};

export type TableDropLayoutResult = {
  ok: boolean;
  positions: Map<string, { row: number; col: number }>;
};

/**
 * Place one table on a grid cell; any non-member already there moves to the nearest empty dot.
 */
export function resolveTableDropAtCell(input: {
  tableId: string;
  targetRow: number;
  targetCol: number;
  areaTables: Array<Pick<DiningTable, "id" | "positionX" | "positionY">>;
  gridColumns: number;
  gridRows: number;
  /** Cells that must stay clear of displaced tables (e.g. merge strip). */
  reservedCells?: Set<string>;
  /** Tables that must not be auto-displaced (merge members). */
  protectedTableIds?: Set<string>;
}): TableDropLayoutResult {
  const reservedCells = input.reservedCells ?? new Set<string>();
  const protectedIds = input.protectedTableIds ?? new Set<string>();
  const positions = new Map<string, { row: number; col: number }>();

  for (const table of input.areaTables) {
    if (!isTableOnFloorGrid(table, input.gridColumns, input.gridRows)) {
      continue;
    }
    positions.set(table.id, { row: table.positionY, col: table.positionX });
  }

  positions.set(input.tableId, { row: input.targetRow, col: input.targetCol });

  const targetKey = cellKey(input.targetRow, input.targetCol);
  const occupants = findNonMemberTablesAtCell(
    positions,
    input.targetRow,
    input.targetCol,
    new Set([...protectedIds, input.tableId])
  );

  for (const occupantId of occupants) {
    if (protectedIds.has(occupantId) || occupantId === input.tableId) {
      continue;
    }
    const ok = displaceTableToNearestEmpty(
      occupantId,
      positions,
      reservedCells,
      protectedIds,
      input.gridColumns,
      input.gridRows
    );
    if (!ok) {
      return { ok: false, positions };
    }
  }

  if (reservedCells.has(targetKey)) {
    const stillBlocked = findNonMemberTablesAtCell(
      positions,
      input.targetRow,
      input.targetCol,
      new Set([...protectedIds, input.tableId])
    );
    if (stillBlocked.length > 0) {
      return { ok: false, positions };
    }
  }

  for (const pos of positions.values()) {
    if (pos.row >= input.gridRows || pos.col < 0 || pos.col >= input.gridColumns) {
      return { ok: false, positions };
    }
  }

  return { ok: true, positions };
}

/**
 * Full layout while dragging a merge group: member strip at anchor plus non-members pushed
 * to the nearest empty grid dots.
 */
export function resolveMergeGroupLayoutAtAnchor(input: {
  memberTableIds: string[];
  anchorRow: number;
  anchorCol: number;
  areaTables: Array<Pick<DiningTable, "id" | "positionX" | "positionY">>;
  gridColumns: number;
  gridRows: number;
}): MergeGroupLayoutAtAnchorResult | null {
  if (input.memberTableIds.length === 0) {
    return null;
  }

  const slotCount = input.memberTableIds.length + 1;
  for (let rows = input.gridRows; rows <= MAX_FLOOR_GRID_ROWS; rows++) {
    const wrapped = layoutWrappedMergeCellsWithRowGrowth(
      input.anchorRow,
      input.anchorCol,
      slotCount,
      input.gridColumns,
      rows
    );
    if (!wrapped) {
      continue;
    }

    const memberPositions = new Map<string, { row: number; col: number }>();
    input.memberTableIds.forEach((tableId, index) => {
      const cell = wrapped.layout[index];
      if (cell) {
        memberPositions.set(tableId, cell);
      }
    });

    const reservedCells = new Set(
      wrapped.layout.map((cell) => cellKey(cell.row, cell.col))
    );

    const resolved = resolveMergeStripCollisions({
      memberTableIds: input.memberTableIds,
      memberPositions,
      reservedCells,
      areaTables: input.areaTables,
      gridColumns: input.gridColumns,
      gridRows: Math.max(rows, wrapped.gridRows),
    });

    if (resolved.ok) {
      return {
        positions: resolved.positions,
        gridRows: resolved.gridRows,
      };
    }
  }

  return null;
}

/** Member cells and the "+" plug cell derived from packed/wrapped layout. */
export function getMergeGroupStripCells(
  memberTableIds: string[],
  positions: Map<string, { row: number; col: number }>,
  gridColumns: number,
  gridRows: number
): { memberCells: Set<string>; plugRow: number; plugCol: number } | null {
  const memberCells = new Set<string>();
  for (const tableId of memberTableIds) {
    const pos = positions.get(tableId);
    if (!pos) {
      continue;
    }
    memberCells.add(cellKey(pos.row, pos.col));
  }
  if (memberCells.size === 0) {
    return null;
  }

  const anchor = findMergeStripAnchorForMemberCells(
    memberTableIds,
    positions,
    gridColumns,
    gridRows
  );
  if (!anchor) {
    return null;
  }

  const wrapped = layoutWrappedMergeCellsWithRowGrowth(
    anchor.row,
    anchor.col,
    memberTableIds.length + 1,
    gridColumns,
    gridRows
  );
  const plug = wrapped?.layout[memberTableIds.length];
  if (!plug) {
    return null;
  }
  return { memberCells, plugRow: plug.row, plugCol: plug.col };
}
