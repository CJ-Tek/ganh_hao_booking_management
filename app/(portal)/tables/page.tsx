"use client";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Collapse,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type DataTableSortStatus } from "mantine-datatable";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalPageTitle, PortalSectionCard, PortalStickyPanel } from "@/components/portal-page";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { useAppContext } from "@/contexts/app-context";
import { getAreaSeatBudget } from "@/lib/area-capacity";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { FLOOR_TABLE_PALETTE_SENTINEL } from "@/lib/floor-map-layout";
import { bookingCardBusyProps, bookingRowBusyStyle } from "@/lib/busy-row-style";
import { useBusyId } from "@/lib/use-busy-id";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type DiningTable, TableStatus } from "@/lib/types";

type BatchSeatGroup = { count: number; seats: number };

function branchScopeKey(branchIds: string[]) {
  return [...branchIds].sort().join("|") || "none";
}

export default function TablesPage() {
  const { filteredBranchIds } = useAppContext();
  return <TablesPageContent key={branchScopeKey(filteredBranchIds)} />;
}

function TablesPageContent() {
  const {
    state,
    filteredBranchIds,
    upsertTable,
    upsertTablesBatch,
    deleteTables,
    updateTableStatus,
  } = useAppContext();

  const isCompact = usePortalCompact();
  const { isBusy: isTableRowBusy, run: runTableRowAction } = useBusyId();
  const [isAddingSingle, setIsAddingSingle] = useState(false);
  const [isBatchAdding, setIsBatchAdding] = useState(false);
  const [isBatchRemoving, setIsBatchRemoving] = useState(false);
  const [isRemovingSelected, setIsRemovingSelected] = useState(false);
  const [batchToolsOpen, setBatchToolsOpen] = useState(false);
  const [stickyStatsOpen, setStickyStatsOpen] = useState(true);

  const branchId = filteredBranchIds[0] ?? "";

  const [areaId, setAreaId] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>("single");

  const [singleName, setSingleName] = useState("");
  const [singleSeats, setSingleSeats] = useState<number>(4);

  const [batchPrefix, setBatchPrefix] = useState("Bàn");
  const [batchStart, setBatchStart] = useState<number>(1);
  const [batchGroups, setBatchGroups] = useState<BatchSeatGroup[]>([
    { count: 4, seats: 2 },
    { count: 3, seats: 4 },
    { count: 2, seats: 5 },
  ]);

  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [removeBySeats, setRemoveBySeats] = useState<number>(2);
  const [removeCount, setRemoveCount] = useState<number>(24);
  const [removePrefix, setRemovePrefix] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [seatsFilter, setSeatsFilter] = useState<string>("all");
  const [selectedRows, setSelectedRows] = useState<DiningTable[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<DiningTable>>({
    columnAccessor: "name",
    direction: "asc",
  });

  const branchNameById = useMemo(
    () => Object.fromEntries(state.branches.map((item) => [item.id, item.name])),
    [state.branches]
  );
  const areaNameById = useMemo(
    () => Object.fromEntries(state.areas.map((item) => [item.id, item.name])),
    [state.areas]
  );

  const areas = useMemo(
    () => state.areas.filter((area) => area.branchId === branchId),
    [branchId, state.areas]
  );

  const areaSeatBudget = useMemo(
    () => (areaId ? getAreaSeatBudget(state.areas, state.tables, areaId) : null),
    [areaId, state.areas, state.tables]
  );

  const batchPlan = useMemo(() => {
    const groups = batchGroups
      .map((g) => ({
        count: Math.max(0, Math.floor(Number(g.count) || 0)),
        seats: Math.max(1, Math.floor(Number(g.seats) || 1)),
      }))
      .filter((g) => g.count > 0);
    const tableCount = groups.reduce((s, g) => s + g.count, 0);
    const seatTotal = groups.reduce((s, g) => s + g.count * g.seats, 0);
    return { groups, tableCount, seatTotal };
  }, [batchGroups]);

  const baseRecords = useMemo(
    () =>
      state.tables
        .filter((table) => filteredBranchIds.includes(table.branchId))
        .filter((table) => (!branchId || table.branchId === branchId))
        .filter((table) => (!areaId || table.areaId === areaId)),
    [areaId, branchId, filteredBranchIds, state.tables]
  );

  const availableTableCount = useMemo(
    () => baseRecords.filter((item) => item.status === "available").length,
    [baseRecords]
  );

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return baseRecords.filter((row) => {
      const hitKeyword =
        !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        (branchNameById[row.branchId] ?? "").toLowerCase().includes(keyword) ||
        (areaNameById[row.areaId] ?? "").toLowerCase().includes(keyword);
      const hitStatus = statusFilter === "all" || row.status === statusFilter;
      const hitSeats = seatsFilter === "all" || row.seats === Number(seatsFilter);
      return hitKeyword && hitStatus && hitSeats;
    });
  }, [areaNameById, baseRecords, branchNameById, search, seatsFilter, statusFilter]);

  const sortTableRecords = useCallback(
    (records: DiningTable[], sortStatus: DataTableSortStatus<DiningTable>) => {
      const getValue = (item: DiningTable) => {
        if (sortStatus.columnAccessor === "branchId") {
          return branchNameById[item.branchId] ?? "";
        }
        if (sortStatus.columnAccessor === "areaId") {
          return areaNameById[item.areaId] ?? "";
        }
        if (sortStatus.columnAccessor === "seats") {
          return item.seats;
        }
        if (sortStatus.columnAccessor === "status") {
          return tableStatusLabel[item.status];
        }
        return item.name;
      };
      return [...records].sort((a, b) => {
        const left = getValue(a);
        const right = getValue(b);
        const compare =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "vi");
        return sortStatus.direction === "asc" ? compare : -compare;
      });
    },
    [areaNameById, branchNameById]
  );

  const sortedRecords = useMemo(
    () => sortTableRecords(filteredRecords, sortStatus),
    [filteredRecords, sortStatus, sortTableRecords]
  );

  const totalPages = Math.max(1, Math.ceil(sortedRecords.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagedRecords = useMemo(
    () => sortedRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, sortedRecords]
  );

  const seatFilterOptions = useMemo(
    () => [
      { value: "all", label: "Tất cả số ghế" },
      ...Array.from(new Set(baseRecords.map((item) => item.seats)))
        .sort((a, b) => a - b)
        .map((value) => ({ value: String(value), label: `${value} ghế` })),
    ],
    [baseRecords]
  );

  const removeOptions = useMemo(
    () =>
      sortedRecords.map((row) => ({
        value: row.id,
        label: `${row.name} - ${areaNameById[row.areaId] ?? "Không rõ khu vực"}`,
      })),
    [areaNameById, sortedRecords]
  );

  const handleAddSingleTable = async () => {
    if (!branchId || !areaId || !singleName.trim()) {
      notifications.show({ color: "red", message: "Vui lòng chọn phạm vi thao tác và nhập tên bàn." });
      return;
    }
    const seats = Math.max(1, Number(singleSeats || 1));
    if (areaSeatBudget && seats > areaSeatBudget.remaining) {
      notifications.show({
        color: "red",
        message: `Vượt sức chứa khu: còn ${areaSeatBudget.remaining} chỗ (${areaSeatBudget.used}/${areaSeatBudget.capacity} đã dùng).`,
      });
      return;
    }
    setIsAddingSingle(true);
    try {
      await upsertTable({
        branchId,
        areaId,
        name: singleName.trim(),
        seats,
        status: "available",
        positionX: FLOOR_TABLE_PALETTE_SENTINEL,
        positionY: FLOOR_TABLE_PALETTE_SENTINEL,
      });
      setSingleName("");
      setSingleSeats(4);
      notifications.show({ color: "green", message: "Đã thêm bàn mới." });
    } finally {
      setIsAddingSingle(false);
    }
  };

  const handleBatchAdd = async () => {
    if (!branchId || !areaId || !batchPrefix.trim()) {
      notifications.show({ color: "red", message: "Vui lòng chọn phạm vi thao tác và tiền tố tên bàn." });
      return;
    }
    const start = Math.max(1, Number(batchStart || 1));
    const { groups, tableCount, seatTotal } = batchPlan;
    if (groups.length === 0) {
      notifications.show({
        color: "red",
        message: "Thêm ít nhất một nhóm với số bàn > 0.",
      });
      return;
    }
    if (areaSeatBudget && seatTotal > areaSeatBudget.remaining) {
      notifications.show({
        color: "red",
        message: `Vượt sức chứa khu: cần ${seatTotal} ghế nhưng còn ${areaSeatBudget.remaining} (${areaSeatBudget.used}/${areaSeatBudget.capacity} đã dùng).`,
      });
      return;
    }
    let nextNum = start;
    const payload: Array<{
      branchId: string;
      areaId: string;
      name: string;
      seats: number;
      status: "available";
      positionX: number;
      positionY: number;
    }> = [];
    for (const g of groups) {
      for (let i = 0; i < g.count; i++) {
        payload.push({
          branchId,
          areaId,
          name: `${batchPrefix.trim()} ${nextNum}`,
          seats: g.seats,
          status: "available",
          positionX: FLOOR_TABLE_PALETTE_SENTINEL,
          positionY: FLOOR_TABLE_PALETTE_SENTINEL,
        });
        nextNum++;
      }
    }
    setIsBatchAdding(true);
    try {
      await upsertTablesBatch(payload);
      notifications.show({ color: "green", message: `Đã thêm ${tableCount} bàn mới.` });
    } finally {
      setIsBatchAdding(false);
    }
  };

  const handlePickRemovalsByRule = () => {
    const prefix = removePrefix.trim().toLowerCase();
    const matches = sortedRecords
      .filter((item) => item.seats === Math.max(1, Number(removeBySeats || 1)))
      .filter((item) => !prefix || item.name.toLowerCase().startsWith(prefix))
      .slice(0, Math.max(1, Number(removeCount || 1)))
      .map((item) => item.id);
    setRemoveIds(matches);
    notifications.show({
      color: "blue",
      message: `Đã chọn ${matches.length} bàn theo điều kiện.`,
    });
  };

  const handleBatchRemove = async () => {
    if (removeIds.length === 0) {
      notifications.show({ color: "red", message: "Vui lòng chọn ít nhất một bàn cần xóa." });
      return;
    }
    setIsBatchRemoving(true);
    try {
      await deleteTables(removeIds);
      notifications.show({ color: "green", message: `Đã xóa ${removeIds.length} bàn.` });
      setRemoveIds([]);
    } finally {
      setIsBatchRemoving(false);
    }
  };

  const handleRemoveSelectedFromTable = async () => {
    if (selectedRows.length === 0) {
      notifications.show({ color: "red", message: "Vui lòng chọn bàn trực tiếp trong bảng để xóa." });
      return;
    }
    const selectedIds = selectedRows.map((item) => item.id);
    setIsRemovingSelected(true);
    try {
      await deleteTables(selectedIds);
      notifications.show({ color: "green", message: `Đã xóa ${selectedIds.length} bàn đã chọn từ bảng.` });
      setSelectedRows([]);
      setRemoveIds((prev) => prev.filter((id) => !selectedIds.includes(id)));
    } finally {
      setIsRemovingSelected(false);
    }
  };

  const handleTableStatusChange = async (tableId: string, status: TableStatus) => {
    await runTableRowAction(tableId, async () => {
      try {
        await updateTableStatus(tableId, status);
      } catch (error) {
        notifications.show({
          color: "red",
          message: error instanceof Error ? error.message : "Không thể cập nhật trạng thái.",
        });
      }
    });
  };

  const tableCards = (
    <Stack gap="sm">
      {sortedRecords.length > 0 ? (
        <Select
          label="Số thẻ mỗi trang"
          size="sm"
          data={["6", "8", "10", "12", "20"].map((value) => ({ value, label: value }))}
          value={String(pageSize)}
          onChange={(value) => {
            if (!value) return;
            setPageSize(Number(value));
            setPage(1);
          }}
          allowDeselect={false}
        />
      ) : null}
      {pagedRecords.length === 0 ? (
        <Text c="dimmed" size="sm">
          Không có bàn phù hợp.
        </Text>
      ) : (
        pagedRecords.map((row) => {
          const cardBusy = bookingCardBusyProps(isTableRowBusy(row.id));
          return (
          <Card
            key={row.id}
            withBorder
            radius="md"
            padding="md"
            className={cardBusy.className}
            style={cardBusy.style}
          >
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={800} size="lg">
                    {row.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {areaNameById[row.areaId]} · {row.seats} ghế
                  </Text>
                </div>
                <Badge color={tableStatusColor[row.status]} variant="light" size="lg">
                  {tableStatusLabel[row.status]}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                {branchNameById[row.branchId]}
              </Text>
              <SimpleGrid cols={2} spacing="xs">
                {(["available", "hold", "occupied", "locked"] as TableStatus[]).map((status) => (
                  <Button
                    key={status}
                    size="compact-sm"
                    variant={row.status === status ? "filled" : "light"}
                    disabled={isTableRowBusy(row.id) || row.status === status}
                    loading={isTableRowBusy(row.id)}
                    onClick={() => void handleTableStatusChange(row.id, status)}
                  >
                    {tableStatusLabel[status]}
                  </Button>
                ))}
              </SimpleGrid>
            </Stack>
          </Card>
        );
        })
      )}
      {sortedRecords.length > pageSize ? (
        <Group justify="center" gap="xs" mt="xs">
          <Button
            variant="default"
            size="compact-sm"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Trước
          </Button>
          <Text size="sm" c="dimmed">
            {currentPage}/{totalPages}
          </Text>
          <Button
            variant="default"
            size="compact-sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Sau
          </Button>
        </Group>
      ) : null}
    </Stack>
  );

  const batchTabs = (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="single">Thêm 1 bàn</Tabs.Tab>
        <Tabs.Tab value="batch-add">Thêm nhiều</Tabs.Tab>
        <Tabs.Tab value="batch-remove">Xóa nhiều</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="single" pt="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <TextInput
            label="Tên bàn"
            placeholder="VD: Bàn 12"
            value={singleName}
            onChange={(event) => setSingleName(event.currentTarget.value)}
            size={isCompact ? "md" : "sm"}
          />
          <NumberInput
            label="Số ghế"
            min={1}
            max={areaSeatBudget && areaSeatBudget.remaining > 0 ? areaSeatBudget.remaining : undefined}
            value={singleSeats}
            onChange={(value) => setSingleSeats(Number(value || 1))}
            size={isCompact ? "md" : "sm"}
          />
          <div />
          <Button
            mt={{ base: 0, lg: 26 }}
            disabled={Boolean(areaSeatBudget && areaSeatBudget.remaining <= 0) || isAddingSingle}
            loading={isAddingSingle}
            onClick={() => void handleAddSingleTable()}
          >
            Thêm bàn
          </Button>
        </SimpleGrid>
      </Tabs.Panel>

      <Tabs.Panel value="batch-add" pt="md">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <TextInput
              label="Tiền tố tên bàn"
              value={batchPrefix}
              onChange={(event) => setBatchPrefix(event.currentTarget.value)}
              size={isCompact ? "md" : "sm"}
            />
            <NumberInput
              label="Bắt đầu từ số"
              min={1}
              value={batchStart}
              onChange={(value) => setBatchStart(Number(value || 1))}
              size={isCompact ? "md" : "sm"}
            />
          </SimpleGrid>
          <div>
            <Text size="sm" fw={600}>
              Nhóm bàn
            </Text>
            <Text size="xs" c="dimmed">
              Mỗi dòng: số bàn và số ghế mỗi bàn (ví dụ 6 bàn × 2 ghế, rồi 4 bàn × 4 ghế). Tên bàn tăng dần
              theo thứ tự nhóm.
            </Text>
          </div>
          <Stack gap="xs">
            {batchGroups.map((row, index) => (
              <Group key={index} align="flex-end" wrap="nowrap" gap="sm">
                <NumberInput
                  label={index === 0 ? "Số bàn" : undefined}
                  placeholder="0"
                  min={0}
                  value={row.count}
                  onChange={(value) =>
                    setBatchGroups((prev) =>
                      prev.map((g, i) =>
                        i === index ? { ...g, count: Math.max(0, Number(value ?? 0)) } : g
                      )
                    )
                  }
                  style={{ flex: 1 }}
                  size={isCompact ? "md" : "sm"}
                />
                <NumberInput
                  label={index === 0 ? "Ghế / bàn" : undefined}
                  min={1}
                  value={row.seats}
                  onChange={(value) =>
                    setBatchGroups((prev) =>
                      prev.map((g, i) =>
                        i === index ? { ...g, seats: Math.max(1, Number(value ?? 1)) } : g
                      )
                    )
                  }
                  style={{ flex: 1 }}
                  size={isCompact ? "md" : "sm"}
                />
                <ActionIcon
                  variant="light"
                  color="red"
                  aria-label="Xóa nhóm"
                  disabled={batchGroups.length <= 1}
                  size={isCompact ? "lg" : "md"}
                  onClick={() =>
                    setBatchGroups((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
                  }
                >
                  <Trash2 size={18} />
                </ActionIcon>
              </Group>
            ))}
          </Stack>
          <Button
            variant="light"
            leftSection={<Plus size={18} />}
            size={isCompact ? "md" : "sm"}
            onClick={() => setBatchGroups((prev) => [...prev, { count: 1, seats: 4 }])}
          >
            Thêm nhóm
          </Button>
          {batchPlan.tableCount > 0 ? (
            <Text size="sm" c="dimmed">
              Tổng dự kiến: {batchPlan.tableCount} bàn · {batchPlan.seatTotal} ghế
              {areaSeatBudget && batchPlan.seatTotal > areaSeatBudget.remaining ? (
                <Text span c="red" fw={600}>
                  {" "}
                  (vượt sức chứa còn lại)
                </Text>
              ) : null}
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              Nhập ít nhất một dòng có số bàn lớn hơn 0.
            </Text>
          )}
          <Button
            disabled={Boolean(
              areaSeatBudget &&
                (areaSeatBudget.remaining <= 0 ||
                  batchPlan.tableCount === 0 ||
                  batchPlan.seatTotal > areaSeatBudget.remaining)
            ) || isBatchAdding}
            loading={isBatchAdding}
            size={isCompact ? "md" : "sm"}
            onClick={() => void handleBatchAdd()}
          >
            Thêm hàng loạt
          </Button>
        </Stack>
      </Tabs.Panel>

      <Tabs.Panel value="batch-remove" pt="md">
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
            <NumberInput
              label="Số ghế cần xóa"
              min={1}
              value={removeBySeats}
              onChange={(value) => setRemoveBySeats(Number(value || 1))}
              size={isCompact ? "md" : "sm"}
            />
            <NumberInput
              label="Số lượng cần xóa"
              min={1}
              value={removeCount}
              onChange={(value) => setRemoveCount(Number(value || 1))}
              size={isCompact ? "md" : "sm"}
            />
            <TextInput
              label="Tiền tố tên (tùy chọn)"
              placeholder="VD: Bàn VIP"
              value={removePrefix}
              onChange={(event) => setRemovePrefix(event.currentTarget.value)}
              size={isCompact ? "md" : "sm"}
            />
            <Button variant="light" mt={{ base: 0, lg: 26 }} onClick={handlePickRemovalsByRule}>
              Chọn nhanh
            </Button>
          </SimpleGrid>

          <Group align="end" wrap="wrap">
            <MultiSelect
              label="Chọn bàn cần xóa"
              placeholder="Tìm theo tên bàn"
              searchable
              data={removeOptions}
              value={removeIds}
              onChange={setRemoveIds}
              flex={1}
              style={{ minWidth: 200 }}
              size={isCompact ? "md" : "sm"}
            />
            <Button
              color="red"
              variant="light"
              loading={isBatchRemoving}
              disabled={isBatchRemoving}
              onClick={() => void handleBatchRemove()}
            >
              Xóa đã chọn
            </Button>
          </Group>
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );

  return (
    <Stack>
      <PortalPageTitle order={isCompact ? 3 : 2}>
        {isCompact ? "Bàn" : "Quản lý bàn"}
      </PortalPageTitle>

      <PortalStickyPanel>
        <Stack gap="md">
          <Group align="flex-end" gap="sm" wrap="nowrap">
            <Select
              label="Khu vực"
              placeholder="Chọn khu"
              value={areaId}
              onChange={(value) => {
                setAreaId(value ?? "");
                setPage(1);
              }}
              data={areas.map((area) => ({ value: area.id, label: area.name }))}
              size={isCompact ? "md" : "sm"}
              style={{ flex: 1, minWidth: 0 }}
            />
            <ActionIcon
              variant="default"
              size={isCompact ? "xl" : "lg"}
              aria-label={stickyStatsOpen ? "Thu gọn chỉ số" : "Mở rộng chỉ số"}
              onClick={() => setStickyStatsOpen((open) => !open)}
            >
              {stickyStatsOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </ActionIcon>
          </Group>
          <Collapse expanded={stickyStatsOpen}>
            <Stack gap="md">
              {!isCompact ? (
                <Text size="sm" c="dimmed">
                  1) Chọn phạm vi thao tác, 2) dùng tab để thêm/xóa hàng loạt, 3) kiểm soát danh sách
                  bàn bên dưới.
                </Text>
              ) : null}
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Paper withBorder radius="md" p="md" shadow="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                    Tổng bàn
                  </Text>
                  <Text size="xl" fw={800} lh={1.15}>
                    {baseRecords.length}
                  </Text>
                  <Text size="xs" c="dimmed" mt={6}>
                    {areaId ? "Trong khu đã chọn" : "Toàn chi nhánh (chưa chọn khu)"}
                  </Text>
                </Paper>
                <Paper withBorder radius="md" p="md" shadow="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600} mb={6}>
                    Bàn trống
                  </Text>
                  <Text size="xl" fw={800} lh={1.15} c="green">
                    {availableTableCount}
                  </Text>
                  <Text size="xs" c="dimmed" mt={6}>
                    Trạng thái sẵn sàng
                  </Text>
                </Paper>
              </SimpleGrid>
              {areaSeatBudget ? (
                <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xs">
                  <Paper withBorder radius="sm" p="sm" bg="var(--mantine-color-default-hover)">
                    <Text size="xs" c="dimmed" mb={4}>
                      Sức chứa tối đa
                    </Text>
                    <Text fw={700} size="md">
                      {areaSeatBudget.capacity}
                      <Text span size="xs" c="dimmed" fw={400}>
                        {" "}
                        chỗ
                      </Text>
                    </Text>
                  </Paper>
                  <Paper withBorder radius="sm" p="sm" bg="var(--mantine-color-default-hover)">
                    <Text size="xs" c="dimmed" mb={4}>
                      Đã gán trên bàn
                    </Text>
                    <Text fw={700} size="md">
                      {areaSeatBudget.used}
                      <Text span size="xs" c="dimmed" fw={400}>
                        {" "}
                        ghế
                      </Text>
                    </Text>
                  </Paper>
                  <Paper withBorder radius="sm" p="sm" bg="var(--mantine-color-default-hover)">
                    <Text size="xs" c="dimmed" mb={4}>
                      Còn lại
                    </Text>
                    <Text fw={700} size="md" c={areaSeatBudget.remaining <= 0 ? "red" : undefined}>
                      {areaSeatBudget.remaining}
                      <Text span size="xs" c="dimmed" fw={400}>
                        {" "}
                        chỗ
                      </Text>
                    </Text>
                  </Paper>
                </SimpleGrid>
              ) : (
                <Text size="xs" c="dimmed">
                  Chọn khu vực để xem sức chứa và ngân sách ghế.
                </Text>
              )}
            </Stack>
          </Collapse>
        </Stack>
      </PortalStickyPanel>

      {isCompact ? (
        <>
          <Button variant="light" onClick={() => setBatchToolsOpen(true)}>
            Thêm hoặc xóa nhiều bàn
          </Button>
          <Modal
            opened={batchToolsOpen}
            onClose={() => setBatchToolsOpen(false)}
            title="Thêm hoặc xóa nhiều bàn"
            size="lg"
          >
            {batchTabs}
          </Modal>
        </>
      ) : (
        <PortalSectionCard>{batchTabs}</PortalSectionCard>
      )}

      <PortalSectionCard>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm" mb="md">
          <TextInputWithVoice
            label="Tìm bàn"
            placeholder="Tên, chi nhánh, khu vực"
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setPage(1);
            }}
            size={isCompact ? "md" : "sm"}
            voiceIconSize={isCompact ? "md" : "sm"}
          />
          <Select
            label="Trạng thái"
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value ?? "all");
              setPage(1);
            }}
            data={[
              { value: "all", label: "Tất cả" },
              ...(["available", "hold", "occupied", "locked"] as TableStatus[]).map((status) => ({
                value: status,
                label: tableStatusLabel[status],
              })),
            ]}
            size={isCompact ? "md" : "sm"}
          />
          <Select
            label="Số ghế"
            value={seatsFilter}
            onChange={(value) => {
              setSeatsFilter(value ?? "all");
              setPage(1);
            }}
            data={seatFilterOptions}
            size={isCompact ? "md" : "sm"}
          />
        </SimpleGrid>
        {!isCompact ? (
          <>
            <Group justify="space-between" mb="sm">
              <Text size="sm" c="dimmed">
                Đã chọn trong bảng: {selectedRows.length} bàn
              </Text>
              <Button
                color="red"
                variant="light"
                loading={isRemovingSelected}
                onClick={() => void handleRemoveSelectedFromTable()}
                disabled={selectedRows.length === 0 || isRemovingSelected}
              >
                Xóa bàn đã chọn trong bảng
              </Button>
            </Group>

            <PortalDataTable<DiningTable>
              records={filteredRecords}
              hideSearch
              withToolbar={false}
              sortRecords={sortTableRecords}
              sortStatus={sortStatus}
              onSortStatusChange={(next) => {
                setSortStatus(next);
                setPage(1);
              }}
              page={currentPage}
              onPageChange={setPage}
              recordsPerPage={pageSize}
              minHeight={260}
              idAccessor="id"
              rowStyle={(row) => bookingRowBusyStyle(isTableRowBusy(row.id))}
              selectedRecords={selectedRows}
              onSelectedRecordsChange={setSelectedRows}
              noRecordsText="Không có bàn phù hợp với bộ lọc hiện tại."
              columns={[
                { accessor: "name", title: "Bàn", sortable: true },
                {
                  accessor: "branchId",
                  title: "Chi nhánh",
                  sortable: true,
                  render: (row) => branchNameById[row.branchId],
                },
                {
                  accessor: "areaId",
                  title: "Khu vực",
                  sortable: true,
                  render: (row) => areaNameById[row.areaId],
                },
                { accessor: "seats", title: "Số ghế", sortable: true },
                {
                  accessor: "status",
                  title: "Trạng thái",
                  sortable: true,
                  render: (row) => (
                    <Badge color={tableStatusColor[row.status]} variant="light">
                      {tableStatusLabel[row.status]}
                    </Badge>
                  ),
                },
                {
                  accessor: "actions",
                  title: "Cập nhật nhanh",
                  render: (row) => (
                    <Group gap={6} wrap="wrap">
                      {(["available", "hold", "occupied", "locked"] as TableStatus[]).map((status) => (
                        <Button
                          key={status}
                          size="compact-xs"
                          variant={row.status === status ? "filled" : "light"}
                          disabled={isTableRowBusy(row.id) || row.status === status}
                          loading={isTableRowBusy(row.id)}
                          onClick={() => void handleTableStatusChange(row.id, status)}
                        >
                          {tableStatusLabel[status]}
                        </Button>
                      ))}
                    </Group>
                  ),
                },
              ]}
            />
          </>
        ) : (
          tableCards
        )}
      </PortalSectionCard>
    </Stack>
  );
}
