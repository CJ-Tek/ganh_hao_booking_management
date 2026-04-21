"use client";

import {
  Badge,
  Button,
  Card,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Tabs,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyPanel } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { getAreaSeatBudget } from "@/lib/area-capacity";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type DiningTable, TableStatus } from "@/lib/types";

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
  const [batchToolsOpen, setBatchToolsOpen] = useState(false);

  const branchId = filteredBranchIds[0] ?? "";
  const branchName =
    branchId ? state.branches.find((b) => b.id === branchId)?.name ?? "—" : "—";

  const [areaId, setAreaId] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>("single");

  const [singleName, setSingleName] = useState("");
  const [singleSeats, setSingleSeats] = useState<number>(4);

  const [batchPrefix, setBatchPrefix] = useState("Bàn");
  const [batchCount, setBatchCount] = useState<number>(24);
  const [batchStart, setBatchStart] = useState<number>(1);
  const [batchSeats, setBatchSeats] = useState<number>(2);

  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [removeBySeats, setRemoveBySeats] = useState<number>(2);
  const [removeCount, setRemoveCount] = useState<number>(24);
  const [removePrefix, setRemovePrefix] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [seatsFilter, setSeatsFilter] = useState<string>("all");
  const [selectedRows, setSelectedRows] = useState<DiningTable[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 10;
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

  const maxBatchTablesByCapacity = useMemo(() => {
    if (!areaSeatBudget) {
      return undefined;
    }
    const perTable = Math.max(1, Number(batchSeats || 1));
    return Math.floor(areaSeatBudget.remaining / perTable);
  }, [areaSeatBudget, batchSeats]);

  const baseRecords = useMemo(
    () =>
      state.tables
        .filter((table) => filteredBranchIds.includes(table.branchId))
        .filter((table) => (!branchId || table.branchId === branchId))
        .filter((table) => (!areaId || table.areaId === areaId)),
    [areaId, branchId, filteredBranchIds, state.tables]
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

  const sortedRecords = useMemo(() => {
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
    return [...filteredRecords].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);
      const compare = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "vi");
      return sortStatus.direction === "asc" ? compare : -compare;
    });
  }, [areaNameById, branchNameById, filteredRecords, sortStatus]);

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
    await upsertTable({
      branchId,
      areaId,
      name: singleName.trim(),
      seats,
      status: "available",
      positionX: 0,
      positionY: 0,
    });
    setSingleName("");
    setSingleSeats(4);
    notifications.show({ color: "green", message: "Đã thêm bàn mới." });
  };

  const handleBatchAdd = async () => {
    if (!branchId || !areaId || !batchPrefix.trim()) {
      notifications.show({ color: "red", message: "Vui lòng chọn phạm vi thao tác và tiền tố tên bàn." });
      return;
    }
    const quantity = Math.max(1, Number(batchCount || 1));
    const start = Math.max(1, Number(batchStart || 1));
    const seatsPer = Math.max(1, Number(batchSeats || 1));
    if (areaSeatBudget) {
      const need = quantity * seatsPer;
      if (need > areaSeatBudget.remaining) {
        const maxQty = Math.floor(areaSeatBudget.remaining / seatsPer);
        notifications.show({
          color: "red",
          message:
            maxQty <= 0
              ? `Không đủ sức chứa khu: còn ${areaSeatBudget.remaining} chỗ (${areaSeatBudget.used}/${areaSeatBudget.capacity} đã dùng).`
              : `Vượt sức chứa khu: tối đa ${maxQty} bàn × ${seatsPer} ghế (còn ${areaSeatBudget.remaining} chỗ).`,
        });
        return;
      }
    }
    const payload = Array.from({ length: quantity }, (_, index) => ({
      branchId,
      areaId,
      name: `${batchPrefix.trim()} ${start + index}`,
      seats: seatsPer,
      status: "available" as const,
      positionX: 0,
      positionY: 0,
    }));
    await upsertTablesBatch(payload);
    notifications.show({ color: "green", message: `Đã thêm ${quantity} bàn mới.` });
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
    await deleteTables(removeIds);
    notifications.show({ color: "green", message: `Đã xóa ${removeIds.length} bàn.` });
    setRemoveIds([]);
  };

  const handleRemoveSelectedFromTable = async () => {
    if (selectedRows.length === 0) {
      notifications.show({ color: "red", message: "Vui lòng chọn bàn trực tiếp trong bảng để xóa." });
      return;
    }
    const selectedIds = selectedRows.map((item) => item.id);
    await deleteTables(selectedIds);
    notifications.show({ color: "green", message: `Đã xóa ${selectedIds.length} bàn đã chọn từ bảng.` });
    setSelectedRows([]);
    setRemoveIds((prev) => prev.filter((id) => !selectedIds.includes(id)));
  };

  const tableCards = (
    <Stack gap="sm">
      {pagedRecords.length === 0 ? (
        <Text c="dimmed" size="sm">
          Không có bàn phù hợp.
        </Text>
      ) : (
        pagedRecords.map((row) => (
          <Card key={row.id} withBorder radius="md" padding="md">
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
                {(["available", "hold", "arriving", "occupied"] as TableStatus[]).map((status) => (
                  <Button
                    key={status}
                    size="compact-sm"
                    variant={row.status === status ? "filled" : "light"}
                    onClick={() => void updateTableStatus(row.id, status)}
                  >
                    {tableStatusLabel[status]}
                  </Button>
                ))}
              </SimpleGrid>
            </Stack>
          </Card>
        ))
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
            disabled={Boolean(areaSeatBudget && areaSeatBudget.remaining <= 0)}
            onClick={() => void handleAddSingleTable()}
          >
            Thêm bàn
          </Button>
        </SimpleGrid>
      </Tabs.Panel>

      <Tabs.Panel value="batch-add" pt="md">
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm">
          <TextInput
            label="Tiền tố tên bàn"
            value={batchPrefix}
            onChange={(event) => setBatchPrefix(event.currentTarget.value)}
            size={isCompact ? "md" : "sm"}
          />
          <NumberInput
            label="Số lượng"
            min={1}
            max={maxBatchTablesByCapacity !== undefined && maxBatchTablesByCapacity > 0
              ? maxBatchTablesByCapacity
              : undefined}
            value={batchCount}
            onChange={(value) => setBatchCount(Number(value || 1))}
            size={isCompact ? "md" : "sm"}
          />
          <NumberInput
            label="Bắt đầu từ số"
            min={1}
            value={batchStart}
            onChange={(value) => setBatchStart(Number(value || 1))}
            size={isCompact ? "md" : "sm"}
          />
          <NumberInput
            label="Số ghế"
            min={1}
            value={batchSeats}
            onChange={(value) => setBatchSeats(Number(value || 1))}
            size={isCompact ? "md" : "sm"}
          />
          <Button
            mt={{ base: 0, lg: 26 }}
            disabled={Boolean(
              areaSeatBudget &&
                (areaSeatBudget.remaining <= 0 ||
                  (maxBatchTablesByCapacity !== undefined && maxBatchTablesByCapacity <= 0))
            )}
            onClick={() => void handleBatchAdd()}
          >
            Thêm hàng loạt
          </Button>
        </SimpleGrid>
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
            <Button color="red" variant="light" onClick={() => void handleBatchRemove()}>
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
        <Stack gap="sm">
          {!isCompact ? (
            <Text size="sm" c="dimmed">
              1) Chọn phạm vi thao tác, 2) dùng tab để thêm/xóa hàng loạt, 3) kiểm soát danh sách bàn bên dưới.
            </Text>
          ) : null}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
            <Stack gap={4}>
              <Text size="xs" fw={600}>
                Chi nhánh
              </Text>
              <Text size="sm" c="dimmed">
                {branchName}
              </Text>
            </Stack>
            <Select
              label="Khu vực"
              placeholder="Chọn khu"
              description={
                areaSeatBudget
                  ? `Sức chứa khu: ${areaSeatBudget.capacity} chỗ tối đa · ${areaSeatBudget.used} đã gán ghế trên bàn · ${areaSeatBudget.remaining} còn lại`
                  : "Chọn khu để xem sức chứa và thêm bàn"
              }
              value={areaId}
              onChange={(value) => {
                setAreaId(value ?? "");
                setPage(1);
              }}
              data={areas.map((area) => ({ value: area.id, label: area.name }))}
              size={isCompact ? "md" : "sm"}
            />
            <TextInput
              label="Tổng bàn (phạm vi)"
              value={String(baseRecords.length)}
              readOnly
              size={isCompact ? "md" : "sm"}
            />
            <TextInput
              label="Bàn trống"
              value={String(baseRecords.filter((item) => item.status === "available").length)}
              readOnly
              size={isCompact ? "md" : "sm"}
            />
          </SimpleGrid>
        </Stack>
      </PortalStickyPanel>

      {isCompact ? (
        <Stack gap="sm">
          <Button variant="light" onClick={() => setBatchToolsOpen((o) => !o)}>
            {batchToolsOpen ? "Ẩn công cụ thêm / xóa nhiều bàn" : "Thêm hoặc xóa nhiều bàn"}
          </Button>
          {batchToolsOpen ? <PortalSectionCard>{batchTabs}</PortalSectionCard> : null}
        </Stack>
      ) : (
        <PortalSectionCard>{batchTabs}</PortalSectionCard>
      )}

      <PortalSectionCard>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm" mb="md">
          <TextInput
            label="Tìm bàn"
            placeholder="Tên, chi nhánh, khu vực"
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setPage(1);
            }}
            size={isCompact ? "md" : "sm"}
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
              ...(["available", "hold", "arriving", "occupied"] as TableStatus[]).map((status) => ({
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
                onClick={() => void handleRemoveSelectedFromTable()}
                disabled={selectedRows.length === 0}
              >
                Xóa bàn đã chọn trong bảng
              </Button>
            </Group>

            <DataTable
              minHeight={260}
              scrollAreaProps={portalDataTableScrollAreaProps}
              withTableBorder
              idAccessor="id"
              records={pagedRecords}
              selectedRecords={selectedRows}
              onSelectedRecordsChange={setSelectedRows}
              totalRecords={sortedRecords.length}
              recordsPerPage={pageSize}
              page={currentPage}
              onPageChange={setPage}
              sortStatus={sortStatus}
              onSortStatusChange={(next) => {
                setSortStatus(next);
                setPage(1);
              }}
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
                      {(["available", "hold", "arriving", "occupied"] as TableStatus[]).map((status) => (
                        <Button
                          key={status}
                          size="compact-xs"
                          variant={row.status === status ? "filled" : "light"}
                          onClick={() => void updateTableStatus(row.id, status)}
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
