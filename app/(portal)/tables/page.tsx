"use client";

import {
  Badge,
  Button,
  Group,
  NumberInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { DataTable } from "mantine-datatable";
import { useMemo, useState } from "react";
import {
  PortalActionGrid,
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyPanel,
} from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { TableStatus } from "@/lib/types";

export default function TablesPage() {
  const { state, filteredBranchIds, upsertTable, updateTableStatus } = useAppContext();

  const [branchId, setBranchId] = useState(filteredBranchIds[0] ?? "");
  const [areaId, setAreaId] = useState("");
  const [name, setName] = useState("");
  const [seats, setSeats] = useState<number>(4);

  const records = useMemo(
    () => state.tables.filter((table) => filteredBranchIds.includes(table.branchId)),
    [filteredBranchIds, state.tables]
  );

  const areas = state.areas.filter((area) => area.branchId === branchId);

  const handleAddTable = async () => {
    if (!branchId || !areaId || !name) {
      notifications.show({ color: "red", message: "Vui lòng nhập đầy đủ thông tin bàn." });
      return;
    }
    await upsertTable({
      branchId,
      areaId,
      name,
      seats,
      status: "available",
      positionX: 40,
      positionY: 40,
    });
    setName("");
    setSeats(4);
    notifications.show({ color: "green", message: "Đã thêm bàn mới." });
  };

  return (
    <Stack>
      <PortalPageTitle>Quản lý bàn</PortalPageTitle>

      <PortalStickyPanel>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }} spacing="sm">
          <Select
            label="Chi nhánh"
            value={branchId}
            onChange={(value) => {
              setBranchId(value ?? "");
              setAreaId("");
            }}
            data={state.branches
              .filter((branch) => filteredBranchIds.includes(branch.id))
              .map((branch) => ({ value: branch.id, label: branch.name }))}
          />
          <Select
            label="Khu vực"
            value={areaId}
            onChange={(value) => setAreaId(value ?? "")}
            data={areas.map((area) => ({ value: area.id, label: area.name }))}
          />
          <TextInput label="Tên bàn" value={name} onChange={(event) => setName(event.currentTarget.value)} />
          <NumberInput
            label="Số ghế"
            value={seats}
            onChange={(value) => setSeats(Number(value || 1))}
            min={1}
          />
          <Button onClick={() => void handleAddTable()} mt={{ base: 0, lg: 26 }}>
            Thêm bàn
          </Button>
        </SimpleGrid>
      </PortalStickyPanel>

      <PortalSectionCard>
        <Stack hiddenFrom="sm" gap="sm">
          {records.length === 0 ? (
            <PortalSectionCard p="sm">
              <Text c="dimmed" size="sm">
                Chưa có bàn nào trong phạm vi chi nhánh đã chọn.
              </Text>
            </PortalSectionCard>
          ) : (
            records.map((row) => (
              <PortalSectionCard key={row.id} p="sm">
                <Group justify="space-between" mb={6}>
                  <Text fw={700}>{row.name}</Text>
                  <Badge color={tableStatusColor[row.status]} variant="light">
                    {tableStatusLabel[row.status]}
                  </Badge>
                </Group>
                <Stack gap={4}>
                  <Text size="sm">Chi nhánh: {state.branches.find((item) => item.id === row.branchId)?.name}</Text>
                  <Text size="sm" c="dimmed">
                    Khu vực: {state.areas.find((item) => item.id === row.areaId)?.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    Số ghế: {row.seats}
                  </Text>
                </Stack>
                <PortalActionGrid cols={2} mt="sm">
                  {(["available", "hold", "arriving", "occupied"] as TableStatus[]).map((status) => (
                    <Button
                      key={status}
                      size="sm"
                      variant={row.status === status ? "filled" : "light"}
                      onClick={() => void updateTableStatus(row.id, status)}
                    >
                      {tableStatusLabel[status]}
                    </Button>
                  ))}
                </PortalActionGrid>
              </PortalSectionCard>
            ))
          )}
        </Stack>

        <ScrollArea type="auto" visibleFrom="sm">
          <DataTable
            minHeight={240}
            withTableBorder
            records={records}
            noRecordsText="Chưa có bàn nào trong phạm vi chi nhánh đã chọn."
            columns={[
              { accessor: "name", title: "Bàn" },
              {
                accessor: "branchId",
                title: "Chi nhánh",
                render: (row) => state.branches.find((item) => item.id === row.branchId)?.name,
              },
              {
                accessor: "areaId",
                title: "Khu vực",
                render: (row) => state.areas.find((item) => item.id === row.areaId)?.name,
              },
              { accessor: "seats", title: "Số ghế" },
              {
                accessor: "status",
                title: "Trạng thái",
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
        </ScrollArea>
      </PortalSectionCard>
    </Stack>
  );
}
