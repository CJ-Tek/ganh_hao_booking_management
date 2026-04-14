"use client";

import {
  ActionIcon,
  Badge,
  Group,
  NumberInput,
  Select,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  ChevronUp,
  Crosshair,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Wrench,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { type DiningTable, type TableStatus } from "@/lib/types";
import classes from "./page.module.css";

const DEFAULT_GRID_COLUMNS = 12;
const DEFAULT_GRID_ROWS = 8;
const LEGACY_CELL_WIDTH = 100;
const LEGACY_CELL_HEIGHT = 70;
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.1;
const DEFAULT_NODE_SPACING = 96;
const CANVAS_PADDING = 64;
const TOUCH_PINCH_FACTOR = 0.005;

function normalizeGridValue(value: number, max: number, legacyStep: number) {
  if (Number.isInteger(value) && value >= 0 && value < max) {
    return value;
  }
  const legacyMapped = Math.round(value / legacyStep);
  return Math.max(0, Math.min(max - 1, legacyMapped));
}

function getTableGridPosition(table: DiningTable, gridColumns: number, gridRows: number) {
  return {
    col: normalizeGridValue(table.positionX, gridColumns, LEGACY_CELL_WIDTH),
    row: normalizeGridValue(table.positionY, gridRows, LEGACY_CELL_HEIGHT),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isTableInGrid(table: DiningTable, gridColumns: number, gridRows: number) {
  return (
    Number.isInteger(table.positionX) &&
    Number.isInteger(table.positionY) &&
    table.positionX >= 0 &&
    table.positionX < gridColumns &&
    table.positionY >= 0 &&
    table.positionY < gridRows
  );
}

type DragState = {
  pointerId: number;
  tableId: string;
  row: number;
  col: number;
};

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type CanvasMode = "view" | "edit";

export default function FloorMapPage() {
  const { state, filteredBranchIds, updateTablePosition } = useAppContext();
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [mode, setMode] = useState<CanvasMode>("edit");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [gridColumns, setGridColumns] = useState(DEFAULT_GRID_COLUMNS);
  const [gridRows, setGridRows] = useState(DEFAULT_GRID_ROWS);
  const [nodeSpacing, setNodeSpacing] = useState(DEFAULT_NODE_SPACING);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 24, y: 24 });
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [isToolsPanelOpen, setIsToolsPanelOpen] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const isEditMode = mode === "edit";

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panStateRef = useRef<PanState | null>(null);
  const pinchRef = useRef<{
    distance: number;
    centerX: number;
    centerY: number;
    scale: number;
  } | null>(null);

  const availableAreas = useMemo(
    () => state.areas.filter((area) => filteredBranchIds.includes(area.branchId)),
    [filteredBranchIds, state.areas]
  );

  const areaId = activeAreaId ?? availableAreas[0]?.id ?? null;

  const tablesInArea = useMemo(
    () => state.tables.filter((table) => table.areaId === areaId),
    [areaId, state.tables]
  );

  const visibleTables = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return tablesInArea.filter((table) => {
      const hitKeyword = !keyword || table.name.toLowerCase().includes(keyword);
      const hitStatus = statusFilter === "all" || table.status === statusFilter;
      return hitKeyword && hitStatus;
    });
  }, [search, statusFilter, tablesInArea]);

  const tableMap = useMemo(
    () => Object.fromEntries(visibleTables.map((table) => [table.id, table])),
    [visibleTables]
  );
  const placedTables = useMemo(
    () => visibleTables.filter((table) => isTableInGrid(table, gridColumns, gridRows)),
    [gridColumns, gridRows, visibleTables]
  );
  const paletteTables = useMemo(
    () =>
      visibleTables
        .filter((table) => !isTableInGrid(table, gridColumns, gridRows))
        .sort((first, second) => first.name.localeCompare(second.name, "vi")),
    [gridColumns, gridRows, visibleTables]
  );

  const basePositionMap = useMemo(() => {
    const grouped = new Map<string, DiningTable[]>();
    for (const table of placedTables) {
      const mapped = getTableGridPosition(table, gridColumns, gridRows);
      const key = `${mapped.row}-${mapped.col}`;
      const current = grouped.get(key) ?? [];
      current.push(table);
      grouped.set(key, current);
    }
    return grouped;
  }, [gridColumns, gridRows, placedTables]);

  const tableByNode = useMemo(() => {
    const grouped = new Map<string, DiningTable[]>();
    for (const [key, tables] of basePositionMap.entries()) {
      grouped.set(key, [...tables]);
    }
    if (dragState) {
      for (const [key, tables] of grouped.entries()) {
        grouped.set(
          key,
          tables.filter((table) => table.id !== dragState.tableId)
        );
      }
      const previewKey = `${dragState.row}-${dragState.col}`;
      const targetTables = grouped.get(previewKey) ?? [];
      const movingTable = tableMap[dragState.tableId];
      if (movingTable) {
        grouped.set(previewKey, [...targetTables, movingTable]);
      }
    }
    return grouped;
  }, [basePositionMap, dragState, tableMap]);

  const commitDrop = async (tableId: string, row: number, col: number) => {
    const source = tableMap[tableId];
    if (!source) {
      return;
    }
    const current = getTableGridPosition(source, gridColumns, gridRows);
    if (current.row === row && current.col === col) {
      return;
    }
    try {
      await updateTablePosition(source.id, col, row);
      notifications.show({
        color: "green",
        message: `Đã đặt ${source.name} vào node C${col + 1}-R${row + 1}.`,
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không thể cập nhật vị trí bàn.",
      });
    } finally {
      setDragState(null);
    }
  };

  const gridNodes = useMemo(
    () =>
      Array.from({ length: gridRows * gridColumns }, (_, index) => ({
        row: Math.floor(index / gridColumns),
        col: index % gridColumns,
      })),
    [gridColumns, gridRows]
  );

  const canvasWidth = CANVAS_PADDING * 2 + Math.max(0, gridColumns - 1) * nodeSpacing;
  const canvasHeight = CANVAS_PADDING * 2 + Math.max(0, gridRows - 1) * nodeSpacing;

  const toWorldCoordinate = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return { x: 0, y: 0 };
    }
    const rect = viewport.getBoundingClientRect();
    return {
      x: (clientX - rect.left - offset.x) / scale,
      y: (clientY - rect.top - offset.y) / scale,
    };
  };

  const nearestNode = (x: number, y: number) => {
    const col = clamp(Math.round((x - CANVAS_PADDING) / nodeSpacing), 0, gridColumns - 1);
    const row = clamp(Math.round((y - CANVAS_PADDING) / nodeSpacing), 0, gridRows - 1);
    return { row, col };
  };

  const zoomAt = (nextScale: number, anchorX: number, anchorY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const safeScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    const worldX = (anchorX - rect.left - offset.x) / scale;
    const worldY = (anchorY - rect.top - offset.y) / scale;
    setScale(safeScale);
    setOffset({
      x: anchorX - rect.left - worldX * safeScale,
      y: anchorY - rect.top - worldY * safeScale,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState && event.pointerId === dragState.pointerId) {
      const world = toWorldCoordinate(event.clientX, event.clientY);
      const snapped = nearestNode(world.x, world.y);
      if (snapped.row !== dragState.row || snapped.col !== dragState.col) {
        setDragState((prev) =>
          prev ? { ...prev, row: snapped.row, col: snapped.col } : prev
        );
      }
      return;
    }
    const panState = panStateRef.current;
    if (panState && event.pointerId === panState.pointerId) {
      setOffset({
        x: panState.originX + (event.clientX - panState.startX),
        y: panState.originY + (event.clientY - panState.startY),
      });
    }
  };

  const handleViewportPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.releasePointerCapture(event.pointerId);
    }
    if (isEditMode && dragState && event.pointerId === dragState.pointerId) {
      void commitDrop(dragState.tableId, dragState.row, dragState.col);
      return;
    }
    if (panStateRef.current && event.pointerId === panStateRef.current.pointerId) {
      panStateRef.current = null;
    }
  };

  const handleViewportPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isEditMode && (event.target as HTMLElement).dataset.tableBlock === "true") {
      return;
    }
    if (!isEditMode || event.button !== 0) {
      return;
    }
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.setPointerCapture(event.pointerId);
    panStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  };

  const handleTablePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    table: DiningTable
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const base = getTableGridPosition(table, gridColumns, gridRows);
    viewport.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      tableId: table.id,
      row: clamp(base.row, 0, gridRows - 1),
      col: clamp(base.col, 0, gridColumns - 1),
    });
  };

  const handlePalettePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
    table: DiningTable
  ) => {
    if (!isEditMode || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    const centerWorldX = (viewport.clientWidth / 2 - offset.x) / scale;
    const centerWorldY = (viewport.clientHeight / 2 - offset.y) / scale;
    const centerNode = nearestNode(centerWorldX, centerWorldY);
    viewport.setPointerCapture(event.pointerId);
    setDragState({
      pointerId: event.pointerId,
      tableId: table.id,
      row: centerNode.row,
      col: centerNode.col,
    });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -SCALE_STEP : SCALE_STEP;
    zoomAt(scale + delta, event.clientX, event.clientY);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) {
      pinchRef.current = null;
      return;
    }
    event.preventDefault();
    const [first, second] = Array.from(event.touches);
    const dx = second.clientX - first.clientX;
    const dy = second.clientY - first.clientY;
    const distance = Math.hypot(dx, dy);
    const centerX = (first.clientX + second.clientX) / 2;
    const centerY = (first.clientY + second.clientY) / 2;
    if (!pinchRef.current) {
      pinchRef.current = { distance, centerX, centerY, scale };
      return;
    }
    const factor = distance - pinchRef.current.distance;
    zoomAt(pinchRef.current.scale + factor * TOUCH_PINCH_FACTOR, centerX, centerY);
  };

  const centerCanvasView = () => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    setOffset({
      x: (viewport.clientWidth - canvasWidth * scale) / 2,
      y: (viewport.clientHeight - canvasHeight * scale) / 2,
    });
  };

  return (
    <Stack className={classes.pageRoot}>
      <Group justify="space-between" align="end">
        <div>
          <PortalPageTitle>Sơ đồ nhà hàng</PortalPageTitle>
          <Text c="dimmed">
            Bàn sẽ bám vào node gần nhất trong canvas. Dùng cuộn chuột hoặc chụm/ngón tay để zoom.
          </Text>
        </div>
        <Badge variant="light">
          Node Grid {gridColumns} x {gridRows}
        </Badge>
      </Group>

      <PortalSectionCard>
        <div className={classes.canvasFrame}>
          <div
            ref={viewportRef}
            className={classes.canvasViewport}
            onPointerDown={handleViewportPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handleViewportPointerUp}
            onPointerCancel={handleViewportPointerUp}
            onWheel={handleWheel}
            onTouchMove={handleTouchMove}
          >
            <div
              className={classes.canvasContent}
              style={{
                width: canvasWidth,
                height: canvasHeight,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            >
              <svg className={classes.gridSvg} viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}>
                {gridNodes.map((node) => {
                  const x = CANVAS_PADDING + node.col * nodeSpacing;
                  const y = CANVAS_PADDING + node.row * nodeSpacing;
                  return (
                    <g key={`${node.row}-${node.col}`}>
                      <circle className={classes.gridNode} cx={x} cy={y} r={6} />
                      <text className={classes.gridNodeLabel} x={x + 10} y={y - 10}>
                        C{node.col + 1}-R{node.row + 1}
                      </text>
                    </g>
                  );
                })}
              </svg>
              {gridNodes.map((node) => {
                const key = `${node.row}-${node.col}`;
                const tables = tableByNode.get(key) ?? [];
                const x = CANVAS_PADDING + node.col * nodeSpacing;
                const y = CANVAS_PADDING + node.row * nodeSpacing;
                return tables.map((table, stackIndex) => (
                  <div
                    key={`${table.id}-${node.row}-${node.col}-${stackIndex}`}
                    data-table-block="true"
                    className={`${classes.tableBlock} ${
                      dragState?.tableId === table.id ? classes.tableBlockDragging : ""
                    } ${!isEditMode ? classes.tableBlockReadonly : ""}`}
                    style={{
                      left: x - 56 + stackIndex * 8,
                      top: y - 28 + stackIndex * 8,
                    }}
                    onPointerDown={(event) => handleTablePointerDown(event, table)}
                  >
                    <Text fw={600} size="sm" lineClamp={1}>
                      {table.name}
                    </Text>
                    <Group justify="space-between" gap={6}>
                      <Badge color={tableStatusColor[table.status]} variant="light" size="xs">
                        {tableStatusLabel[table.status]}
                      </Badge>
                      <Text size="xs">{table.seats} ghế</Text>
                    </Group>
                  </div>
                ));
              })}
            </div>
          </div>
          <div className={classes.canvasOverlay}>
            <div className={classes.canvasTopToolbar}>
              <div className={classes.toolbarPopoverAnchor}>
                <ActionIcon
                  variant={isSearchPanelOpen ? "filled" : "light"}
                  size="lg"
                  aria-label="Search filters"
                  onClick={() => {
                    setIsSearchPanelOpen((value) => !value);
                    setIsToolsPanelOpen(false);
                  }}
                >
                  <Search size={16} />
                </ActionIcon>
                <div
                  className={`${classes.canvasPopoverPanel} ${
                    isSearchPanelOpen ? classes.canvasPopoverPanelOpen : ""
                  } ${classes.toolbarPopoverLeft}`}
                  aria-hidden={!isSearchPanelOpen}
                >
                  <Stack gap="sm">
                    <TextInput
                      label="Tìm bàn"
                      placeholder="Theo tên bàn"
                      value={search}
                      onChange={(event) => setSearch(event.currentTarget.value)}
                    />
                    <Select
                      label="Lọc trạng thái"
                      value={statusFilter}
                      onChange={(value) => setStatusFilter(value ?? "all")}
                      data={[
                        { value: "all", label: "Tất cả trạng thái" },
                        ...(["available", "hold", "arriving", "occupied"] as TableStatus[]).map(
                          (status) => ({
                            value: status,
                            label: tableStatusLabel[status],
                          })
                        ),
                      ]}
                    />
                  </Stack>
                </div>
              </div>

              <div className={classes.toolbarPopoverAnchor}>
                <ActionIcon
                  variant={isToolsPanelOpen ? "filled" : "light"}
                  size="lg"
                  aria-label="Grid tools"
                  disabled={!isEditMode}
                  onClick={() => {
                    setIsToolsPanelOpen((value) => !value);
                    setIsSearchPanelOpen(false);
                  }}
                >
                  <Wrench size={16} />
                </ActionIcon>
                <div
                  className={`${classes.canvasPopoverPanel} ${
                    isToolsPanelOpen ? classes.canvasPopoverPanelOpen : ""
                  } ${classes.toolbarPopoverLeft}`}
                  aria-hidden={!isToolsPanelOpen}
                >
                  <Stack gap="sm">
                    <Group align="end" gap="xs" wrap="nowrap">
                      <NumberInput
                        label="Cột"
                        value={gridColumns}
                        onChange={(value) =>
                          setGridColumns(clamp(Number(value) || DEFAULT_GRID_COLUMNS, 4, 24))
                        }
                        min={4}
                        max={24}
                        clampBehavior="strict"
                        style={{ flex: 1 }}
                      />
                      <NumberInput
                        label="Hàng"
                        value={gridRows}
                        onChange={(value) =>
                          setGridRows(clamp(Number(value) || DEFAULT_GRID_ROWS, 4, 18))
                        }
                        min={4}
                        max={18}
                        clampBehavior="strict"
                        style={{ flex: 1 }}
                      />
                    </Group>
                    <NumberInput
                      label="Khoảng cách node"
                      value={nodeSpacing}
                      onChange={(value) =>
                        setNodeSpacing(clamp(Number(value) || DEFAULT_NODE_SPACING, 64, 160))
                      }
                      min={64}
                      max={160}
                      step={4}
                      clampBehavior="strict"
                    />
                    <ActionIcon
                      variant="light"
                      size="lg"
                      onClick={() => {
                        setScale(1);
                        setOffset({ x: 24, y: 24 });
                      }}
                      aria-label="Reset view"
                    >
                      <RotateCcw size={16} />
                    </ActionIcon>
                  </Stack>
                </div>
              </div>

              <SegmentedControl
                value={mode}
                onChange={(value) => {
                  const nextMode = value as CanvasMode;
                  setMode(nextMode);
                  if (nextMode === "view") {
                    setIsToolsPanelOpen(false);
                    setIsSearchPanelOpen(false);
                    setDragState(null);
                  }
                }}
                data={[
                  { label: "View", value: "view" },
                  { label: "Edit", value: "edit" },
                ]}
                className={classes.toolbarModeControl}
              />

              <Select
                label="Khu vực"
                value={areaId}
                onChange={setActiveAreaId}
                data={availableAreas.map((area) => ({
                  value: area.id,
                  label: `${area.name} - ${state.branches.find((branch) => branch.id === area.branchId)?.name}`,
                }))}
                searchable
                className={classes.toolbarAreaSelect}
              />
            </div>

            <div
              className={`${classes.canvasZoomDock} ${
                isEditMode && isPaletteOpen ? classes.canvasZoomDockRaised : ""
              }`}
            >
              <ActionIcon
                variant="light"
                size="lg"
                onClick={() => setScale((current) => clamp(current - SCALE_STEP, MIN_SCALE, MAX_SCALE))}
                aria-label="Zoom out"
              >
                <Minus size={16} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                size="lg"
                onClick={() => setScale((current) => clamp(current + SCALE_STEP, MIN_SCALE, MAX_SCALE))}
                aria-label="Zoom in"
              >
                <Plus size={16} />
              </ActionIcon>
              <ActionIcon
                variant="light"
                size="lg"
                onClick={centerCanvasView}
                aria-label="Center view"
              >
                <Crosshair size={16} />
              </ActionIcon>
              <Text size="xs" c="dimmed" ta="center">
                {Math.round(scale * 100)}%
              </Text>
            </div>
            {isEditMode ? (
              isPaletteOpen ? (
                <div className={classes.tablePalette}>
                  <Stack gap={8}>
                    <Group justify="space-between" align="center" wrap="nowrap">
                      <Text size="sm" fw={600}>
                        Bàn khả dụng
                      </Text>
                      <ActionIcon
                        variant="light"
                        size="sm"
                        onClick={() => setIsPaletteOpen(false)}
                        aria-label="Ẩn kho bàn"
                      >
                        <ChevronUp size={14} />
                      </ActionIcon>
                    </Group>
                    <div className={classes.tablePaletteList}>
                      {paletteTables.length === 0 ? (
                        <Text size="sm" c="dimmed">
                          Trống - tất cả bàn đã có trên lưới.
                        </Text>
                      ) : (
                        paletteTables.map((table) => (
                          <div
                            key={`palette-${table.id}`}
                            className={classes.paletteTableBlock}
                            onPointerDown={(event) => handlePalettePointerDown(event, table)}
                          >
                            <Text size="sm" fw={600} lineClamp={1}>
                              {table.name}
                            </Text>
                            <Group justify="space-between" gap={6}>
                              <Badge
                                color={tableStatusColor[table.status]}
                                variant="light"
                                size="xs"
                              >
                                {tableStatusLabel[table.status]}
                              </Badge>
                              <Text size="xs">{table.seats} ghế</Text>
                            </Group>
                          </div>
                        ))
                      )}
                    </div>
                  </Stack>
                </div>
              ) : (
                <div className={classes.tablePaletteToggleDock}>
                  <ActionIcon
                    variant="filled"
                    size="lg"
                    onClick={() => setIsPaletteOpen(true)}
                    aria-label="Hiện kho bàn"
                  >
                    <ChevronUp size={16} />
                  </ActionIcon>
                </div>
              )
            ) : null}
          </div>
        </div>
      </PortalSectionCard>
    </Stack>
  );
}
