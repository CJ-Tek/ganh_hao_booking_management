"use client";

import {
  Badge,
  Button,
  MultiSelect,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyAction } from "@/components/portal-page";
import { RouteGuard } from "@/components/route-guard";
import { useAppContext } from "@/contexts/app-context";
import { AppUser, Role } from "@/lib/types";

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
  const [search, setSearch] = useState("");
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<AppUser>>({
    columnAccessor: "username",
    direction: "asc",
  });
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.users.filter((user) => {
      if (!keyword) {
        return true;
      }
      const branchText = user.branchIds
        .map((id) => state.branches.find((branch) => branch.id === id)?.name ?? id)
        .join(", ")
        .toLowerCase();
      return (
        user.username.toLowerCase().includes(keyword) ||
        user.fullName.toLowerCase().includes(keyword) ||
        roleLabel[user.role].toLowerCase().includes(keyword) ||
        branchText.includes(keyword)
      );
    });
  }, [search, state.branches, state.users]);

  const sortedUsers = useMemo(() => {
    return [...filteredUsers].sort((a, b) => {
      let left = "";
      let right = "";
      if (sortStatus.columnAccessor === "fullName") {
        left = a.fullName;
        right = b.fullName;
      } else if (sortStatus.columnAccessor === "role") {
        left = roleLabel[a.role];
        right = roleLabel[b.role];
      } else if (sortStatus.columnAccessor === "branchIds") {
        left = a.branchIds.join(",");
        right = b.branchIds.join(",");
      } else {
        left = a.username;
        right = b.username;
      }
      const compare = left.localeCompare(right, "vi");
      return sortStatus.direction === "asc" ? compare : -compare;
    });
  }, [filteredUsers, sortStatus]);

  const pagedUsers = useMemo(
    () => {
      const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
      const currentPage = Math.min(page, totalPages);
      return sortedUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    },
    [page, pageSize, sortedUsers]
  );

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
          <TextInput
            label="Tìm tài khoản"
            placeholder="Tên đăng nhập, họ tên, vai trò..."
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value);
              setPage(1);
            }}
            mb="sm"
          />
          <Stack hiddenFrom="sm" gap="sm">
            {sortedUsers.map((user) => (
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

          <DataTable
            visibleFrom="sm"
            minHeight={240}
            withTableBorder
            records={pagedUsers}
            totalRecords={sortedUsers.length}
            recordsPerPage={pageSize}
            page={Math.min(page, Math.max(1, Math.ceil(sortedUsers.length / pageSize)))}
            onPageChange={setPage}
            sortStatus={sortStatus}
            onSortStatusChange={(next) => {
              setSortStatus(next);
              setPage(1);
            }}
            columns={[
              { accessor: "username", title: "Tài khoản", sortable: true },
              { accessor: "fullName", title: "Họ tên", sortable: true },
              {
                accessor: "role",
                title: "Vai trò",
                sortable: true,
                render: (user) => <Badge>{roleLabel[user.role]}</Badge>,
              },
              {
                accessor: "branchIds",
                title: "Chi nhánh",
                sortable: true,
                render: (user) =>
                  user.branchIds
                    .map((id) => state.branches.find((branch) => branch.id === id)?.name ?? id)
                    .join(", "),
              },
            ]}
          />
        </PortalSectionCard>
      </Stack>
    </RouteGuard>
  );
}
