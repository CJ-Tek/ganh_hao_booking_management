"use client";

import {
  Badge,
  Button,
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
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { type DiningTable, TableStatus } from "@/lib/types";

export default function TablesPage() {
  const { state, filteredBranchIds, upsertTable, upsertTablesBatch, deleteTables, updateTableStatus } = useAppContext();

  const [branchId, setBranchId] = useState(filteredBranchIds[0] ?? "");
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
    await upsertTable({
      branchId,
      areaId,
      name: singleName.trim(),
      seats: Math.max(1, Number(singleSeats || 1)),
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
    const payload = Array.from({ length: quantity }, (_, index) => ({
      branchId,
      areaId,
      name: `${batchPrefix.trim()} ${start + index}`,
      seats: Math.max(1, Number(batchSeats || 1)),
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

  return (
    <Stack>
      <PortalPageTitle>Quản lý bàn</PortalPageTitle>

      <PortalStickyPanel>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            1) Chọn phạm vi thao tác, 2) dùng tab để thêm/xóa hàng loạt, 3) kiểm soát danh sách bàn bên dưới.
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
            <Select
              label="Chi nhánh thao tác"
              value={branchId}
              onChange={(value) => {
                setBranchId(value ?? "");
                setAreaId("");
                setPage(1);
              }}
              data={state.branches
                .filter((branch) => filteredBranchIds.includes(branch.id))
                .map((branch) => ({ value: branch.id, label: branch.name }))}
            />
            <Select
              label="Khu vực thao tác"
              value={areaId}
              onChange={(value) => {
                setAreaId(value ?? "");
                setPage(1);
              }}
              data={areas.map((area) => ({ value: area.id, label: area.name }))}
            />
            <TextInput label="Tổng bàn theo phạm vi" value={String(baseRecords.length)} readOnly />
            <TextInput
              label="Bàn trống theo phạm vi"
              value={String(baseRecords.filter((item) => item.status === "available").length)}
              readOnly
            />
          </SimpleGrid>
        </Stack>
      </PortalStickyPanel>

      <PortalSectionCard>
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="single">Thêm nhanh 1 bàn</Tabs.Tab>
            <Tabs.Tab value="batch-add">Thêm hàng loạt</Tabs.Tab>
            <Tabs.Tab value="batch-remove">Xóa hàng loạt</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="single" pt="md">
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
              <TextInput
                label="Tên bàn"
                placeholder="VD: Bàn 12"
                value={singleName}
                onChange={(event) => setSingleName(event.currentTarget.value)}
              />
              <NumberInput
                label="Số ghế"
                min={1}
                value={singleSeats}
                onChange={(value) => setSingleSeats(Number(value || 1))}
              />
              <div />
              <Button mt={{ base: 0, lg: 26 }} onClick={() => void handleAddSingleTable()}>
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
              />
              <NumberInput
                label="Số lượng"
                min={1}
                value={batchCount}
                onChange={(value) => setBatchCount(Number(value || 1))}
              />
              <NumberInput
                label="Bắt đầu từ số"
                min={1}
                value={batchStart}
                onChange={(value) => setBatchStart(Number(value || 1))}
              />
              <NumberInput
                label="Số ghế"
                min={1}
                value={batchSeats}
                onChange={(value) => setBatchSeats(Number(value || 1))}
              />
              <Button mt={{ base: 0, lg: 26 }} onClick={() => void handleBatchAdd()}>
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
                />
                <NumberInput
                  label="Số lượng cần xóa"
                  min={1}
                  value={removeCount}
                  onChange={(value) => setRemoveCount(Number(value || 1))}
                />
                <TextInput
                  label="Tiền tố tên (tùy chọn)"
                  placeholder="VD: Bàn VIP"
                  value={removePrefix}
                  onChange={(event) => setRemovePrefix(event.currentTarget.value)}
                />
                <Button variant="light" mt={{ base: 0, lg: 26 }} onClick={handlePickRemovalsByRule}>
                  Chọn nhanh theo điều kiện
                </Button>
              </SimpleGrid>

              <Group align="end">
                <MultiSelect
                  label="Chọn bàn cần xóa"
                  placeholder="Tìm theo tên bàn"
                  searchable
                  data={removeOptions}
                  value={removeIds}
                  onChange={setRemoveIds}
                  flex={1}
                />
                <Button color="red" variant="light" onClick={() => void handleBatchRemove()}>
                  Xóa đã chọn
                </Button>
              </Group>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </PortalSectionCard>

      <PortalSectionCard>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm" mb="md">
          <TextInput
            label="Tìm kiếm bàn"
            placeholder="Tên bàn, chi nhánh, khu vực"
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setPage(1);
            }}
          />
          <Select
            label="Lọc trạng thái"
            value={statusFilter}
            onChange={(value) => {
              setStatusFilter(value ?? "all");
              setPage(1);
            }}
            data={[
              { value: "all", label: "Tất cả trạng thái" },
              ...(["available", "hold", "arriving", "occupied"] as TableStatus[]).map((status) => ({
                value: status,
                label: tableStatusLabel[status],
              })),
            ]}
          />
          <Select
            label="Lọc số ghế"
            value={seatsFilter}
            onChange={(value) => {
              setSeatsFilter(value ?? "all");
              setPage(1);
            }}
            data={seatFilterOptions}
          />
        </SimpleGrid>
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
      </PortalSectionCard>
    </Stack>
  );
}
