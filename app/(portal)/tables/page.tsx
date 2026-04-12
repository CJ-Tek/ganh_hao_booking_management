"use client";

import { Badge, Button, Card, Group, NumberInput, Select, Stack, TextInput, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { DataTable } from "mantine-datatable";
import { useMemo, useState } from "react";
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
      <Title order={2}>Quản lý bàn</Title>

      <Card withBorder>
        <Group align="end">
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
            w={260}
          />
          <Select
            label="Khu vực"
            value={areaId}
            onChange={(value) => setAreaId(value ?? "")}
            data={areas.map((area) => ({ value: area.id, label: area.name }))}
            w={220}
          />
          <TextInput label="Tên bàn" value={name} onChange={(event) => setName(event.currentTarget.value)} />
          <NumberInput
            label="Số ghế"
            value={seats}
            onChange={(value) => setSeats(Number(value || 1))}
            min={1}
            w={120}
          />
          <Button onClick={() => void handleAddTable()}>Thêm bàn</Button>
        </Group>
      </Card>

      <Card withBorder>
        <DataTable
          withTableBorder
          records={records}
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
                <Group gap={6}>
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
      </Card>
    </Stack>
  );
}
