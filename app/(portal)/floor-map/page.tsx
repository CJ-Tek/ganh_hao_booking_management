"use client";

import { Badge, Group, Select, SimpleGrid, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyPanel } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { type DiningTable, type TableStatus } from "@/lib/types";
import classes from "./page.module.css";

const GRID_COLUMNS = 12;
const GRID_ROWS = 8;
const LEGACY_CELL_WIDTH = 100;
const LEGACY_CELL_HEIGHT = 70;

function normalizeGridValue(value: number, max: number, legacyStep: number) {
  if (Number.isInteger(value) && value >= 0 && value < max) {
    return value;
  }
  const legacyMapped = Math.round(value / legacyStep);
  return Math.max(0, Math.min(max - 1, legacyMapped));
}

function getTableGridPosition(table: DiningTable) {
  return {
    col: normalizeGridValue(table.positionX, GRID_COLUMNS, LEGACY_CELL_WIDTH),
    row: normalizeGridValue(table.positionY, GRID_ROWS, LEGACY_CELL_HEIGHT),
  };
}

export default function FloorMapPage() {
  const { state, filteredBranchIds, updateTablePosition } = useAppContext();
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);

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

  const positionedTables = useMemo(
    () =>
      visibleTables.map((table) => ({
        table,
        ...getTableGridPosition(table),
      })),
    [visibleTables]
  );

  const tableByCell = useMemo(() => {
    const grouped = new Map<string, DiningTable[]>();
    for (const item of positionedTables) {
      const key = `${item.row}-${item.col}`;
      const current = grouped.get(key) ?? [];
      current.push(item.table);
      grouped.set(key, current);
    }
    return grouped;
  }, [positionedTables]);

  const handleDrop = async (row: number, col: number) => {
    if (!draggingTableId) {
      return;
    }
    const source = tableMap[draggingTableId];
    if (!source) {
      setDraggingTableId(null);
      return;
    }
    const current = getTableGridPosition(source);
    if (current.row === row && current.col === col) {
      setDraggingTableId(null);
      return;
    }
    try {
      await updateTablePosition(source.id, col, row);
      notifications.show({
        color: "green",
        message: `Đã đặt ${source.name} vào ô C${col + 1}-R${row + 1}.`,
      });
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không thể cập nhật vị trí bàn.",
      });
    } finally {
      setDraggingTableId(null);
    }
  };

  const gridCells = useMemo(
    () =>
      Array.from({ length: GRID_ROWS * GRID_COLUMNS }, (_, index) => ({
        row: Math.floor(index / GRID_COLUMNS),
        col: index % GRID_COLUMNS,
      })),
    []
  );

  return (
    <Stack>
      <Group justify="space-between" align="end">
        <div>
          <PortalPageTitle>Sơ đồ nhà hàng</PortalPageTitle>
          <Text c="dimmed">
            Kéo và thả block bàn vào lưới để sắp xếp bố cục. Vị trí sẽ được lưu trực tiếp vào dữ liệu bàn.
          </Text>
        </div>
        <Badge variant="light">Grid {GRID_COLUMNS} x {GRID_ROWS}</Badge>
      </Group>

      <PortalStickyPanel>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
          <Select
            label="Khu vực"
            value={areaId}
            onChange={setActiveAreaId}
            data={availableAreas.map((area) => ({
              value: area.id,
              label: `${area.name} - ${state.branches.find((branch) => branch.id === area.branchId)?.name}`,
            }))}
            searchable
          />
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
              ...(["available", "hold", "arriving", "occupied"] as TableStatus[]).map((status) => ({
                value: status,
                label: tableStatusLabel[status],
              })),
            ]}
          />
        </SimpleGrid>
      </PortalStickyPanel>

      <PortalSectionCard>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            Tổng bàn hiển thị: {visibleTables.length}. Kéo một bàn từ bất kỳ ô nào và thả sang ô mới để sắp xếp.
          </Text>
          <div className={classes.gridWrapper}>
            {gridCells.map((cell) => {
              const key = `${cell.row}-${cell.col}`;
              const tables = tableByCell.get(key) ?? [];
              return (
                <div
                  key={key}
                  className={`${classes.gridCell} ${draggingTableId ? classes.gridCellDropReady : ""}`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => void handleDrop(cell.row, cell.col)}
                >
                  <Text className={classes.gridCellLabel}>C{cell.col + 1}-R{cell.row + 1}</Text>
                  <Stack gap={6}>
                    {tables.map((table) => (
                      <div
                        key={table.id}
                        className={classes.tableBlock}
                        draggable
                        onDragStart={() => setDraggingTableId(table.id)}
                        onDragEnd={() => setDraggingTableId(null)}
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
                    ))}
                  </Stack>
                </div>
              );
            })}
          </div>
        </Stack>
      </PortalSectionCard>
    </Stack>
  );
}
