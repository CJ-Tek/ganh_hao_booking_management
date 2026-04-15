"use client";

import {
  Button,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useEffect, useMemo, useState } from "react";
import {
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyAction,
  PortalStickyPanel,
} from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";

type AreaRow = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  capacity: number;
  tableCount: number;
};

export default function AreasTablesSettingsPage() {
  const { state, filteredBranchIds, addArea, currentUser } = useAppContext();
  const [branchId, setBranchId] = useState(filteredBranchIds[0] ?? "");

  useEffect(() => {
    if (currentUser?.role === "manager") {
      return;
    }
    const next = filteredBranchIds[0] ?? "";
    setBranchId(next);
  }, [currentUser?.role, filteredBranchIds]);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<number>(30);
  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<AreaRow>>({
    columnAccessor: "name",
    direction: "asc",
  });
  const [page, setPage] = useState(1);
  const pageSize = 10;

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
        })),
    [filteredBranchIds, state.areas, state.branches, state.tables]
  );
  const filteredAreas = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return areaRows.filter((area) => {
      if (!keyword) {
        return true;
      }
      return area.name.toLowerCase().includes(keyword) || area.branchName.toLowerCase().includes(keyword);
    });
  }, [areaRows, search]);

  const sortedAreas = useMemo(() => {
    return [...filteredAreas].sort((a, b) => {
      let compare = 0;
      if (sortStatus.columnAccessor === "branchName") {
        compare = a.branchName.localeCompare(b.branchName, "vi");
      } else if (sortStatus.columnAccessor === "capacity") {
        compare = a.capacity - b.capacity;
      } else if (sortStatus.columnAccessor === "tableCount") {
        compare = a.tableCount - b.tableCount;
      } else {
        compare = a.name.localeCompare(b.name, "vi");
      }
      return sortStatus.direction === "asc" ? compare : -compare;
    });
  }, [filteredAreas, sortStatus]);

  const pagedAreas = useMemo(
    () => {
      const totalPages = Math.max(1, Math.ceil(sortedAreas.length / pageSize));
      const currentPage = Math.min(page, totalPages);
      return sortedAreas.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    },
    [page, pageSize, sortedAreas]
  );

  const handleAddArea = async () => {
    if (!branchId || !name) {
      notifications.show({ color: "red", message: "Vui lòng nhập đầy đủ thông tin." });
      return;
    }
    await addArea(branchId, name, capacity);
    setName("");
    setCapacity(30);
    notifications.show({ color: "green", message: "Đã tạo khu vực mới." });
  };

  return (
    <Stack>
      <PortalPageTitle>Cấu hình khu vực & sức chứa</PortalPageTitle>
      <PortalStickyPanel>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="sm">
          <Select
            label="Chi nhánh"
            value={branchId}
            onChange={(value) => setBranchId(value ?? "")}
            data={state.branches
              .filter((branch) => filteredBranchIds.includes(branch.id))
              .map((branch) => ({ value: branch.id, label: branch.name }))}
          />
          <TextInput
            label="Tên khu vực"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <NumberInput
            label="Sức chứa"
            value={capacity}
            onChange={(value) => setCapacity(Number(value || 1))}
            min={1}
          />
          <PortalStickyAction>
            <Button fullWidth onClick={() => void handleAddArea()} mt={{ base: 0, lg: 26 }}>
              Thêm khu vực
            </Button>
          </PortalStickyAction>
        </SimpleGrid>
      </PortalStickyPanel>

      <PortalSectionCard>
        <Text fw={600} mb="sm">
          Danh sách khu vực
        </Text>
        <TextInput
          label="Tìm khu vực"
          placeholder="Tên khu vực hoặc chi nhánh"
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          mb="sm"
        />
        <Stack hiddenFrom="sm" gap="sm">
          {sortedAreas.map((area) => (
            <PortalSectionCard p="sm" key={area.id}>
              <Stack gap={4}>
                <Text fw={700}>{area.name}</Text>
                <Text size="sm">
                  Chi nhánh: {area.branchName}
                </Text>
                <Text size="sm" c="dimmed">
                  Sức chứa: {area.capacity}
                </Text>
                <Text size="sm" c="dimmed">
                  Số bàn: {area.tableCount}
                </Text>
              </Stack>
            </PortalSectionCard>
          ))}
        </Stack>

        <DataTable
          visibleFrom="sm"
          minHeight={240}
          withTableBorder
          records={pagedAreas}
          totalRecords={sortedAreas.length}
          recordsPerPage={pageSize}
          page={Math.min(page, Math.max(1, Math.ceil(sortedAreas.length / pageSize)))}
          onPageChange={setPage}
          sortStatus={sortStatus}
          onSortStatusChange={(next) => {
            setSortStatus(next);
            setPage(1);
          }}
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
          ]}
        />
      </PortalSectionCard>
    </Stack>
  );
}
