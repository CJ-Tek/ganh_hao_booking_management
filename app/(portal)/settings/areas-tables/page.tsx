"use client";

import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type DataTableSortStatus } from "mantine-datatable";
import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import {
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyAction,
  PortalStickyPanel,
} from "@/components/portal-page";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { useAppContext } from "@/contexts/app-context";
import { bookingCardBusyProps, bookingRowBusyStyle } from "@/lib/busy-row-style";
import { usePortalCompact } from "@/lib/use-portal-compact";

type AreaRow = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  capacity: number;
  tableCount: number;
  bookingCount: number;
};

export default function AreasTablesSettingsPage() {
  const { state, filteredBranchIds, addArea, updateArea, deleteArea, hasSupabase } =
    useAppContext();
  const isCompact = usePortalCompact();
  const branchId = filteredBranchIds[0] ?? "";
  const branchName =
    branchId ? state.branches.find((b) => b.id === branchId)?.name ?? "—" : "—";
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<number>(30);
  const [search, setSearch] = useState("");
  const [mobilePage, setMobilePage] = useState(1);
  const mobilePageSize = 10;

  const [editOpen, setEditOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<AreaRow | null>(null);
  const [editBranchId, setEditBranchId] = useState("");
  const [editName, setEditName] = useState("");
  const [editCapacity, setEditCapacity] = useState(30);
  const [editSaving, setEditSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AreaRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [isAddAreaSaving, setIsAddAreaSaving] = useState(false);

  const branchSelectData = useMemo(
    () =>
      state.branches
        .filter((b) => filteredBranchIds.includes(b.id))
        .map((b) => ({ value: b.id, label: b.name })),
    [filteredBranchIds, state.branches]
  );

  const areaRows = useMemo(
    () =>
      state.areas
        .filter((area) => filteredBranchIds.includes(area.branchId))
        .map((area) => ({
          id: area.id,
          branchId: area.branchId,
          branchName: state.branches.find((branch) => branch.id === area.branchId)?.name ?? "-",
          name: area.name,
          capacity: area.capacity,
          tableCount: state.tables.filter((table) => table.areaId === area.id).length,
          bookingCount: state.bookings.filter((b) => b.areaId === area.id).length,
        })),
    [filteredBranchIds, state.areas, state.bookings, state.branches, state.tables]
  );
  const sortAreas = useCallback((records: AreaRow[], sortStatus: DataTableSortStatus<AreaRow>) => {
    return [...records].sort((a, b) => {
      let compare = 0;
      if (sortStatus.columnAccessor === "branchName") {
        compare = a.branchName.localeCompare(b.branchName, "vi");
      } else if (sortStatus.columnAccessor === "capacity") {
        compare = a.capacity - b.capacity;
      } else if (sortStatus.columnAccessor === "tableCount") {
        compare = a.tableCount - b.tableCount;
      } else if (sortStatus.columnAccessor === "bookingCount") {
        compare = a.bookingCount - b.bookingCount;
      } else {
        compare = a.name.localeCompare(b.name, "vi");
      }
      return sortStatus.direction === "asc" ? compare : -compare;
    });
  }, []);

  const getAreaSearchValue = useCallback(
    (area: AreaRow) => `${area.name} ${area.branchName}`.toLowerCase(),
    []
  );

  const mobileSortedAreas = useMemo(
    () => sortAreas(areaRows, { columnAccessor: "name", direction: "asc" }),
    [areaRows, sortAreas]
  );

  const mobileFilteredAreas = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return mobileSortedAreas;
    }
    return mobileSortedAreas.filter((area) => getAreaSearchValue(area).includes(keyword));
  }, [getAreaSearchValue, mobileSortedAreas, search]);

  const mobileTotalPages = Math.max(1, Math.ceil(mobileFilteredAreas.length / mobilePageSize));
  const mobilePageSafe = Math.min(mobilePage, mobileTotalPages);

  const pagedMobileAreas = useMemo(
    () =>
      mobileFilteredAreas.slice(
        (mobilePageSafe - 1) * mobilePageSize,
        mobilePageSafe * mobilePageSize
      ),
    [mobileFilteredAreas, mobilePageSafe, mobilePageSize]
  );

  const handleAddArea = async () => {
    if (!branchId || !name) {
      notifications.show({ color: "red", message: "Vui lòng nhập đầy đủ thông tin." });
      return;
    }
    setIsAddAreaSaving(true);
    try {
      await addArea(branchId, name, capacity);
      setName("");
      setCapacity(30);
      notifications.show({ color: "green", message: "Đã tạo khu vực mới." });
    } finally {
      setIsAddAreaSaving(false);
    }
  };

  const openEdit = (area: AreaRow) => {
    setEditingArea(area);
    setEditBranchId(area.branchId);
    setEditName(area.name);
    setEditCapacity(area.capacity);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingArea || !editName.trim() || !editBranchId) {
      notifications.show({ color: "red", message: "Vui lòng nhập đầy đủ thông tin." });
      return;
    }
    setEditSaving(true);
    try {
      const result = await updateArea(editingArea.id, {
        branchId: editBranchId,
        name: editName.trim(),
        capacity: editCapacity,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setEditOpen(false);
        setEditingArea(null);
      }
    } finally {
      setEditSaving(false);
    }
  };

  const isAreaRowBusy = (areaId: string) =>
    (editSaving && editingArea?.id === areaId) || (deleteLoading && deleteTarget?.id === areaId);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteLoading(true);
    try {
      const result = await deleteArea(deleteTarget.id);
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setDeleteTarget(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Stack>
      <PortalPageTitle order={isCompact ? 3 : 2}>
        {isCompact ? "Khu vực & bàn" : "Cấu hình khu vực & sức chứa"}
      </PortalPageTitle>
      <PortalStickyPanel>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <Stack gap={4}>
            <Text size="xs" fw={600}>
              Chi nhánh
            </Text>
            <Text size="sm" c="dimmed">
              {branchName}
            </Text>
          </Stack>
          <TextInput
            label="Tên khu vực mới"
            placeholder="VD: Tầng 1"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            disabled={isAddAreaSaving}
            size={isCompact ? "md" : "sm"}
          />
          <NumberInput
            label="Sức chứa"
            value={capacity}
            onChange={(value) => setCapacity(Number(value || 1))}
            min={1}
            disabled={isAddAreaSaving}
            size={isCompact ? "md" : "sm"}
          />
          <PortalStickyAction>
            <Button
              fullWidth
              size={isCompact ? "md" : "sm"}
              loading={isAddAreaSaving}
              disabled={isAddAreaSaving}
              onClick={() => void handleAddArea()}
              mt={{ base: 0, lg: 26 }}
            >
              Thêm khu vực
            </Button>
          </PortalStickyAction>
        </SimpleGrid>
      </PortalStickyPanel>

      <PortalSectionCard>
        <Text fw={600} mb="sm" size={isCompact ? "sm" : "md"}>
          Danh sách khu vực
        </Text>
        {isCompact ? (
          <Stack gap="sm">
            <TextInputWithVoice
              label="Tìm khu vực"
              placeholder="Tên hoặc chi nhánh"
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setMobilePage(1);
              }}
              size="md"
              voiceIconSize="md"
            />
            {pagedMobileAreas.length === 0 ? (
              <Text c="dimmed" size="sm">
                Không có khu vực phù hợp.
              </Text>
            ) : (
              pagedMobileAreas.map((area) => {
                const cardBusy = bookingCardBusyProps(isAreaRowBusy(area.id));
                return (
                <Card
                  key={area.id}
                  withBorder
                  radius="md"
                  padding="md"
                  className={cardBusy.className}
                  style={cardBusy.style}
                >
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Text fw={800}>{area.name}</Text>
                        <Text size="xs" c="dimmed">
                          {area.branchName}
                        </Text>
                      </div>
                      <Group gap={6}>
                        <ActionIcon
                          variant="light"
                          aria-label="Sửa khu vực"
                          disabled={!hasSupabase || isAreaRowBusy(area.id)}
                          onClick={() => openEdit(area)}
                        >
                          <Pencil size={16} />
                        </ActionIcon>
                        <ActionIcon
                          variant="light"
                          color="red"
                          aria-label="Xóa khu vực"
                          disabled={!hasSupabase || isAreaRowBusy(area.id)}
                          onClick={() => setDeleteTarget(area)}
                        >
                          <Trash2 size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                    <Group gap="xs">
                      <Badge variant="light">{area.capacity} chỗ</Badge>
                      <Badge variant="light">{area.tableCount} bàn</Badge>
                      <Badge variant="light">{area.bookingCount} đặt</Badge>
                    </Group>
                  </Stack>
                </Card>
              );
              })
            )}
            {mobileFilteredAreas.length > mobilePageSize ? (
              <Group justify="center" gap="xs" mt="xs">
                <Button
                  variant="default"
                  size="compact-sm"
                  disabled={mobilePageSafe <= 1}
                  onClick={() => setMobilePage((p) => Math.max(1, p - 1))}
                >
                  Trước
                </Button>
                <Text size="sm" c="dimmed">
                  {mobilePageSafe}/{mobileTotalPages}
                </Text>
                <Button
                  variant="default"
                  size="compact-sm"
                  disabled={mobilePageSafe >= mobileTotalPages}
                  onClick={() => setMobilePage((p) => Math.min(mobileTotalPages, p + 1))}
                >
                  Sau
                </Button>
              </Group>
            ) : null}
          </Stack>
        ) : (
          <PortalDataTable<AreaRow>
            records={areaRows}
            getRecordSearchValue={getAreaSearchValue}
            sortRecords={sortAreas}
            defaultSort={{ columnAccessor: "name", direction: "asc" }}
            searchLabel="Tìm khu vực"
            searchPlaceholder="Tên hoặc chi nhánh"
            minHeight={240}
            noRecordsText="Không có khu vực phù hợp."
            rowStyle={(area) => bookingRowBusyStyle(isAreaRowBusy(area.id))}
            columns={[
              {
                accessor: "branchName",
                title: "Chi nhánh",
                sortable: true,
              },
              { accessor: "name", title: "Khu vực", sortable: true },
              { accessor: "capacity", title: "Sức chứa", sortable: true },
              {
                accessor: "tableCount",
                title: "Số bàn",
                sortable: true,
              },
              {
                accessor: "bookingCount",
                title: "Đặt bàn",
                sortable: true,
              },
              {
                accessor: "actions",
                title: "Thao tác",
                render: (area) => (
                  <Group gap={4} wrap="nowrap">
                    <ActionIcon
                      variant="subtle"
                      aria-label="Sửa khu vực"
                      disabled={!hasSupabase || isAreaRowBusy(area.id)}
                      onClick={() => openEdit(area)}
                    >
                      <Pencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Xóa khu vực"
                      disabled={!hasSupabase || isAreaRowBusy(area.id)}
                      onClick={() => setDeleteTarget(area)}
                    >
                      <Trash2 size={16} />
                    </ActionIcon>
                  </Group>
                ),
              },
            ]}
          />
        )}
      </PortalSectionCard>

      <Modal
        opened={editOpen}
        onClose={() => {
          if (!editSaving) {
            setEditOpen(false);
            setEditingArea(null);
          }
        }}
        closeOnClickOutside={!editSaving}
        closeOnEscape={!editSaving}
        title="Sửa khu vực"
        size="md"
      >
        <Stack gap="sm">
          <Select
            label="Chi nhánh"
            value={editBranchId}
            onChange={(value) => setEditBranchId(value ?? "")}
            data={branchSelectData}
            disabled={editSaving}
          />
          <TextInput
            label="Tên khu vực"
            value={editName}
            onChange={(event) => setEditName(event.currentTarget.value)}
            disabled={editSaving}
          />
          <NumberInput
            label="Sức chứa"
            value={editCapacity}
            onChange={(value) => setEditCapacity(Number(value || 1))}
            min={1}
            disabled={editSaving}
          />
          <Group justify="flex-end" mt="md">
            <Button variant="default" disabled={editSaving} onClick={() => setEditOpen(false)}>
              Hủy
            </Button>
            <Button loading={editSaving} disabled={editSaving} onClick={() => void handleSaveEdit()}>
              Lưu
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={deleteTarget !== null}
        onClose={() => {
          if (!deleteLoading) {
            setDeleteTarget(null);
          }
        }}
        closeOnClickOutside={!deleteLoading}
        closeOnEscape={!deleteLoading}
        title="Xóa khu vực"
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Xóa khu vực{" "}
            <Text span fw={700}>
              {deleteTarget?.name}
            </Text>
            ? Chỉ xóa được khi không còn bàn và không còn đặt bàn gắn khu vực này (hiện:{" "}
            {deleteTarget?.tableCount ?? 0} bàn, {deleteTarget?.bookingCount ?? 0} đặt bàn).
          </Text>
          <Group justify="flex-end">
            <Button variant="default" disabled={deleteLoading} onClick={() => setDeleteTarget(null)}>
              Hủy
            </Button>
            <Button
              color="red"
              loading={deleteLoading}
              disabled={deleteLoading}
              onClick={() => void handleConfirmDelete()}
            >
              Xóa
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
