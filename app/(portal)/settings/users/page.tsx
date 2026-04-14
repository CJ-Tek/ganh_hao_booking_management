"use client";

import {
  Badge,
  Button,
  MultiSelect,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyAction } from "@/components/portal-page";
import { RouteGuard } from "@/components/route-guard";
import { useAppContext } from "@/contexts/app-context";
import { Role } from "@/lib/types";

const roleLabel: Record<Role, string> = {
  admin: "Admin",
  general_manager: "Quản lý tổng",
  manager: "Quản lý chi nhánh",
};

export default function UserManagementPage() {
  const { state, addUser } = useAppContext();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [branchIds, setBranchIds] = useState<string[]>([]);

  const handleCreateUser = async () => {
    const result = await addUser({ username, password, fullName, role, branchIds });
    notifications.show({
      color: result.ok ? "green" : "red",
      message: result.message,
    });
    if (result.ok) {
      setUsername("");
      setPassword("");
      setFullName("");
      setRole("manager");
      setBranchIds([]);
    }
  };

  return (
    <RouteGuard allowedRoles={["admin", "general_manager"]}>
      <Stack>
        <PortalPageTitle>User management & phân quyền</PortalPageTitle>
        <PortalSectionCard>
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="sm">
            <TextInput
              label="Tên đăng nhập"
              value={username}
              onChange={(event) => setUsername(event.currentTarget.value)}
            />
            <PasswordInput
              label="Mật khẩu"
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <TextInput
              label="Họ tên"
              value={fullName}
              onChange={(event) => setFullName(event.currentTarget.value)}
            />
            <Select
              label="Vai trò"
              value={role}
              onChange={(value) => setRole((value as Role) || "manager")}
              data={[
                { value: "admin", label: "Admin" },
                { value: "general_manager", label: "Quản lý tổng" },
                { value: "manager", label: "Quản lý chi nhánh" },
              ]}
            />
            <MultiSelect
              label="Chi nhánh quản lý"
              value={branchIds}
              onChange={setBranchIds}
              data={state.branches.map((branch) => ({
                value: branch.id,
                label: branch.name,
              }))}
            />
            <PortalStickyAction>
              <Button fullWidth onClick={() => void handleCreateUser()} mt={{ base: 0, sm: 25 }}>
                Tạo tài khoản
              </Button>
            </PortalStickyAction>
          </SimpleGrid>
        </PortalSectionCard>

        <PortalSectionCard>
          <Stack hiddenFrom="sm" gap="sm">
            {state.users.map((user) => (
              <PortalSectionCard p="sm" key={user.id}>
                <Stack gap={4}>
                  <Text fw={700}>{user.username}</Text>
                  <Text size="sm">{user.fullName}</Text>
                  <Badge w="fit-content">{roleLabel[user.role]}</Badge>
                  <Text size="sm" c="dimmed">
                    {user.branchIds
                      .map((id) => state.branches.find((branch) => branch.id === id)?.name ?? id)
                      .join(", ")}
                  </Text>
                </Stack>
              </PortalSectionCard>
            ))}
          </Stack>

          <Table.ScrollContainer minWidth={740} visibleFrom="sm">
            <Table striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Tài khoản</Table.Th>
                  <Table.Th>Họ tên</Table.Th>
                  <Table.Th>Vai trò</Table.Th>
                  <Table.Th>Chi nhánh</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {state.users.map((user) => (
                  <Table.Tr key={user.id}>
                    <Table.Td>{user.username}</Table.Td>
                    <Table.Td>{user.fullName}</Table.Td>
                    <Table.Td>
                      <Badge>{roleLabel[user.role]}</Badge>
                    </Table.Td>
                    <Table.Td>
                      {user.branchIds
                        .map((id) => state.branches.find((branch) => branch.id === id)?.name ?? id)
                        .join(", ")}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </PortalSectionCard>
      </Stack>
    </RouteGuard>
  );
}
