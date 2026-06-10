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
import { ChevronDown, ChevronUp } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { MergeGroupsPanel } from "@/components/merge-groups/merge-groups-panel";
import { SplitClonesPanel } from "@/components/split-clones/split-clones-panel";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalMinimalModal } from "@/components/portal-minimal-modal/portal-minimal-modal";
import { EditableNumberInput } from "@/components/editable-number-input";
import { PortalPageTitle, PortalSectionCard, PortalStickyPanel } from "@/components/portal-page";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { useAppContext } from "@/contexts/app-context";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { FLOOR_TABLE_PALETTE_SENTINEL } from "@/lib/floor-map-layout";
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
    releaseTableMergeGroup,
    deleteTable,
  } = useAppContext();
  const [mainTab, setMainTab] = useState<string | null>("single");
  const [mergeGroupBusyId, setMergeGroupBusyId] = useState<string | null>(null);
  const [mergeGroupReleaseTarget, setMergeGroupReleaseTarget] = useState<string | null>(null);
  const [splitCloneBusyId, setSplitCloneBusyId] = useState<string | null>(null);
  const [splitCloneDeleteTarget, setSplitCloneDeleteTarget] = useState<string | null>(null);

  const isCompact = usePortalCompact();
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
  const [batchPrefix, setBatchPrefix] = useState("Bàn");
  const [batchStart, setBatchStart] = useState<number>(1);
  const [batchCount, setBatchCount] = useState<number>(5);

  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [removeCount, setRemoveCount] = useState<number>(24);
  const [removePrefix, setRemovePrefix] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
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

  const batchTableCount = useMemo(
    () => Math.max(0, Math.floor(Number(batchCount) || 0)),
    [batchCount]
  );

  const baseRecords = useMemo(
    () =>
      state.tables
        .filter((table) => filteredBranchIds.includes(table.branchId))
        .filter((table) => (!branchId || table.branchId === branchId))
        .filter((table) => (!areaId || table.areaId === areaId))
        .filter((table) => !table.splitSourceTableId),
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
      return hitKeyword && hitStatus;
    });
  }, [areaNameById, baseRecords, branchNameById, search, statusFilter]);

  const sortTableRecords = useCallback(
    (records: DiningTable[], sortStatus: DataTableSortStatus<DiningTable>) => {
      const getValue = (item: DiningTable) => {
        if (sortStatus.columnAccessor === "branchId") {
          return branchNameById[item.branchId] ?? "";
        }
        if (sortStatus.columnAccessor === "areaId") {
          return areaNameById[item.areaId] ?? "";
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
    setIsAddingSingle(true);
    try {
      await upsertTable({
        branchId,
        areaId,
        name: singleName.trim(),
        status: "available",
        positionX: FLOOR_TABLE_PALETTE_SENTINEL,
        positionY: FLOOR_TABLE_PALETTE_SENTINEL,
      });
      setSingleName("");
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
    const tableCount = batchTableCount;
    if (tableCount === 0) {
      notifications.show({
        color: "red",
        message: "Nhập số bàn lớn hơn 0.",
      });
      return;
    }
    const payload: Array<{
      branchId: string;
      areaId: string;
      name: string;
      status: "available";
      positionX: number;
      positionY: number;
    }> = [];
    for (let i = 0; i < tableCount; i++) {
      payload.push({
        branchId,
        areaId,
        name: `${batchPrefix.trim()} ${start + i}`,
        status: "available",
        positionX: FLOOR_TABLE_PALETTE_SENTINEL,
        positionY: FLOOR_TABLE_PALETTE_SENTINEL,
      });
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
        pagedRecords.map((row) => (
          <Card key={row.id} withBorder radius="md" padding="md">
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div style={{ minWidth: 0 }}>
                  <Text fw={800} size="lg">
                    {row.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {areaNameById[row.areaId]}
                  </Text>
                </div>
                <Badge color={tableStatusColor[row.status]} variant="light" size="lg">
                  {tableStatusLabel[row.status]}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                {branchNameById[row.branchId]}
              </Text>
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
          <Button
            mt={{ base: 0, lg: 26 }}
            loading={isAddingSingle}
            onClick={() => void handleAddSingleTable()}
          >
            Thêm bàn
          </Button>
        </SimpleGrid>
      </Tabs.Panel>

      <Tabs.Panel value="batch-add" pt="md">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
            <TextInput
              label="Tiền tố tên bàn"
              value={batchPrefix}
              onChange={(event) => setBatchPrefix(event.currentTarget.value)}
              size={isCompact ? "md" : "sm"}
            />
            <EditableNumberInput
              label="Bắt đầu từ số"
              required
              value={batchStart}
              onChange={(value) => setBatchStart(value ?? 1)}
              size={isCompact ? "md" : "sm"}
            />
            <EditableNumberInput
              label="Số bàn"
              required
              min={1}
              value={batchCount}
              onChange={(value) => setBatchCount(value ?? 1)}
              size={isCompact ? "md" : "sm"}
            />
          </SimpleGrid>
          {batchTableCount > 0 ? (
            <Text size="sm" c="dimmed">
              Tổng dự kiến: {batchTableCount} bàn ({batchPrefix.trim()} {batchStart}–
              {batchStart + batchTableCount - 1}).
            </Text>
          ) : (
            <Text size="sm" c="dimmed">
              Nhập số bàn lớn hơn 0.
            </Text>
          )}
          <Button
            disabled={batchTableCount === 0 || isBatchAdding}
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
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <EditableNumberInput
              label="Số lượng cần xóa"
              required
              value={removeCount}
              onChange={(value) => setRemoveCount(value ?? 1)}
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
              placeholder="Chọn bàn"
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

  const handleReleaseMergeGroup = async (groupId: string) => {
    setMergeGroupBusyId(groupId);
    try {
      const result = await releaseTableMergeGroup({ groupId });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setMergeGroupReleaseTarget(null);
      }
    } finally {
      setMergeGroupBusyId(null);
    }
  };

  const splitCloneDeleteTargetName = useMemo(() => {
    if (!splitCloneDeleteTarget) {
      return null;
    }
    return state.tables.find((table) => table.id === splitCloneDeleteTarget)?.name ?? null;
  }, [splitCloneDeleteTarget, state.tables]);

  const splitCloneDeleteActiveBookings = useMemo(() => {
    if (!splitCloneDeleteTarget) {
      return 0;
    }
    return state.bookings.filter(
      (booking) =>
        booking.tableId === splitCloneDeleteTarget &&
        !["completed", "cancelled", "no_show"].includes(booking.status)
    ).length;
  }, [splitCloneDeleteTarget, state.bookings]);

  const handleDeleteSplitClone = async (cloneId: string) => {
    setSplitCloneBusyId(cloneId);
    try {
      await deleteTable(cloneId);
      notifications.show({ color: "green", message: "Đã xóa bàn tách." });
      setSplitCloneDeleteTarget(null);
    } catch (error) {
      notifications.show({
        color: "red",
        message: error instanceof Error ? error.message : "Không thể xóa tách.",
      });
    } finally {
      setSplitCloneBusyId(null);
    }
  };

  const singleTablesPanel = (
    <Stack>
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
              ]}
            />
          </>
        ) : (
          tableCards
        )}
      </PortalSectionCard>
    </Stack>
  );

  return (
    <Stack>
      <PortalPageTitle order={isCompact ? 3 : 2}>
        {isCompact ? "Bàn" : "Quản lý bàn"}
      </PortalPageTitle>

      <Tabs value={mainTab} onChange={setMainTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="single">Bàn lẻ</Tabs.Tab>
          <Tabs.Tab value="merge">Bàn gộp</Tabs.Tab>
          <Tabs.Tab value="split">Bàn tách</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="single" pt="md">
          {singleTablesPanel}
        </Tabs.Panel>

        <Tabs.Panel value="merge" pt="md">
          <MergeGroupsPanel
            mergeGroups={state.mergeGroups}
            tables={state.tables}
            areas={state.areas}
            branches={state.branches}
            bookings={state.bookings}
            filteredBranchIds={filteredBranchIds}
            busyGroupId={mergeGroupBusyId}
            onRequestRelease={(groupId) => setMergeGroupReleaseTarget(groupId)}
          />
        </Tabs.Panel>

        <Tabs.Panel value="split" pt="md">
          <SplitClonesPanel
            tables={state.tables}
            areas={state.areas}
            branches={state.branches}
            bookings={state.bookings}
            filteredBranchIds={filteredBranchIds}
            busyCloneId={splitCloneBusyId}
            onRequestDelete={(cloneId) => setSplitCloneDeleteTarget(cloneId)}
          />
        </Tabs.Panel>
      </Tabs>

      <PortalMinimalModal
        opened={splitCloneDeleteTarget !== null}
        onClose={() => setSplitCloneDeleteTarget(null)}
        title="Xóa bàn tách"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Xóa tách{" "}
            <Text component="span" fw={600}>
              {splitCloneDeleteTargetName ?? "—"}
            </Text>
            ? Bàn sẽ biến mất khỏi sơ đồ trong mọi ngày.
          </Text>
          {splitCloneDeleteActiveBookings > 0 ? (
            <Text size="sm" c="orange">
              Có {splitCloneDeleteActiveBookings} booking đang giữ bàn tách này. Hoàn thành hoặc chuyển
              booking trước khi xóa.
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setSplitCloneDeleteTarget(null)}>
              Huỷ
            </Button>
            <Button
              color="red"
              loading={splitCloneBusyId === splitCloneDeleteTarget}
              disabled={splitCloneDeleteActiveBookings > 0}
              onClick={() => {
                if (splitCloneDeleteTarget) {
                  void handleDeleteSplitClone(splitCloneDeleteTarget);
                }
              }}
            >
              Xóa tách
            </Button>
          </Group>
        </Stack>
      </PortalMinimalModal>

      <PortalMinimalModal
        opened={mergeGroupReleaseTarget !== null}
        onClose={() => setMergeGroupReleaseTarget(null)}
        title="Bỏ gộp bàn"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Hệ thống sẽ cố gắng chuyển các booking đang giữ cụm này về bàn lẻ phù hợp. Nếu có booking
            vượt quá sức chứa của mọi bàn thành viên (over-exceed) và chưa kết thúc / huỷ / no-show,
            thao tác sẽ bị chặn.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setMergeGroupReleaseTarget(null)}>
              Huỷ
            </Button>
            <Button
              color="red"
              loading={mergeGroupBusyId === mergeGroupReleaseTarget}
              onClick={() => {
                if (mergeGroupReleaseTarget) {
                  void handleReleaseMergeGroup(mergeGroupReleaseTarget);
                }
              }}
            >
              Bỏ gộp
            </Button>
          </Group>
        </Stack>
      </PortalMinimalModal>
    </Stack>
  );
}

