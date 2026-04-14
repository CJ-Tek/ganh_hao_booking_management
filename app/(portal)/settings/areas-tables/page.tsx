"use client";

import {
  Button,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import {
  PortalPageTitle,
  PortalSectionCard,
  PortalStickyAction,
  PortalStickyPanel,
} from "@/components/portal-page";
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
        <Stack hiddenFrom="sm" gap="sm">
          {areas.map((area) => (
            <PortalSectionCard p="sm" key={area.id}>
              <Stack gap={4}>
                <Text fw={700}>{area.name}</Text>
                <Text size="sm">
                  Chi nhánh: {state.branches.find((branch) => branch.id === area.branchId)?.name}
                </Text>
                <Text size="sm" c="dimmed">
                  Sức chứa: {area.capacity}
                </Text>
                <Text size="sm" c="dimmed">
                  Số bàn: {state.tables.filter((table) => table.areaId === area.id).length}
                </Text>
              </Stack>
            </PortalSectionCard>
          ))}
        </Stack>

        <Table.ScrollContainer minWidth={680} visibleFrom="sm">
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
        </Table.ScrollContainer>
      </PortalSectionCard>
    </Stack>
  );
}
