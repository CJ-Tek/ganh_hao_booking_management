"use client";

import {
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { useAppContext } from "@/contexts/app-context";

export default function AreasTablesSettingsPage() {
  const { state, filteredBranchIds, addArea } = useAppContext();
  const [branchId, setBranchId] = useState(filteredBranchIds[0] ?? "");
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState<number>(30);

  const areas = state.areas.filter((area) => filteredBranchIds.includes(area.branchId));

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
      <Title order={2}>Cấu hình khu vực & sức chứa</Title>
      <Card withBorder>
        <Group align="end">
          <Select
            label="Chi nhánh"
            value={branchId}
            onChange={(value) => setBranchId(value ?? "")}
            data={state.branches
              .filter((branch) => filteredBranchIds.includes(branch.id))
              .map((branch) => ({ value: branch.id, label: branch.name }))}
            w={280}
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
            w={140}
          />
          <Button onClick={() => void handleAddArea()}>Thêm khu vực</Button>
        </Group>
      </Card>

      <Card withBorder>
        <Text fw={600} mb="sm">
          Danh sách khu vực
        </Text>
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Chi nhánh</Table.Th>
              <Table.Th>Khu vực</Table.Th>
              <Table.Th>Sức chứa</Table.Th>
              <Table.Th>Số bàn</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {areas.map((area) => (
              <Table.Tr key={area.id}>
                <Table.Td>
                  {state.branches.find((branch) => branch.id === area.branchId)?.name}
                </Table.Td>
                <Table.Td>{area.name}</Table.Td>
                <Table.Td>{area.capacity}</Table.Td>
                <Table.Td>{state.tables.filter((table) => table.areaId === area.id).length}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Card>
    </Stack>
  );
}
