"use client";

import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
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
import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyAction } from "@/components/portal-page";
import { RouteGuard } from "@/components/route-guard";
import { useAppContext } from "@/contexts/app-context";
import { AppUser, Role } from "@/lib/types";

const roleLabel: Record<Role, string> = {
  admin: "Admin",
  general_manager: "Quản lý tổng",
  manager: "Quản lý chi nhánh",
};

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "general_manager", label: "Quản lý tổng" },
  { value: "manager", label: "Quản lý chi nhánh" },
];

export default function UserManagementPage() {
  const { state, addUser, updateUser, deleteUser, currentUser } = useAppContext();
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

  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editFullName, setEditFullName] = useState("");
  const [editRole, setEditRole] = useState<Role>("manager");
  const [editBranchIds, setEditBranchIds] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return state.users.filter((user) => {
      if (currentUser?.role === "general_manager" && user.role === "admin") {
        return false;
      }
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
  }, [search, state.branches, state.users, currentUser?.role]);

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

  const canAssignAdmin = currentUser?.role === "admin";

  const roleSelectDataScoped = useMemo(
    () =>
      canAssignAdmin ? ROLE_OPTIONS : ROLE_OPTIONS.filter((item) => item.value !== "admin"),
    [canAssignAdmin]
  );

  /** Quản lý tổng must not change Admin accounts (highest role). */
  const gmCannotManageUser = (user: AppUser) =>
    currentUser?.role === "general_manager" && user.role === "admin";

  useEffect(() => {
    if (currentUser?.role === "general_manager" && role === "admin") {
      setRole("manager");
    }
  }, [currentUser?.role, role]);

  const openEdit = (user: AppUser) => {
    if (gmCannotManageUser(user)) {
      return;
    }
    setEditingUser(user);
    setEditUsername(user.username);
    setEditPassword("");
    setEditFullName(user.fullName);
    setEditRole(user.role);
    setEditBranchIds(user.branchIds);
    setEditOpen(true);
  };

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

  const handleSaveEdit = async () => {
    if (!editingUser) {
      return;
    }
    if (!editUsername.trim() || !editFullName.trim()) {
      notifications.show({ color: "red", message: "Vui lòng nhập tên đăng nhập và họ tên." });
      return;
    }
    setEditSaving(true);
    try {
      const result = await updateUser(editingUser.id, {
        username: editUsername.trim(),
        password: editPassword.trim() || undefined,
        fullName: editFullName.trim(),
        role: editRole,
        branchIds: editBranchIds,
      });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        setEditOpen(false);
        setEditingUser(null);
      }
    } finally {
      setEditSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteLoading(true);
    try {
      const result = await deleteUser(deleteTarget.id);
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

  const branchMultiData = state.branches.map((b) => ({ value: b.id, label: b.name }));

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
              data={roleSelectDataScoped}
            />
            <MultiSelect
              label="Chi nhánh quản lý"
              value={branchIds}
              onChange={setBranchIds}
              data={branchMultiData}
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
                <Stack gap="sm">
                  <Group justify="space-between" wrap="nowrap">
                    <Text fw={700}>{user.username}</Text>
                    <Group gap={4}>
                      <ActionIcon
                        variant="light"
                        aria-label="Sửa"
                        disabled={user.id === currentUser?.id || gmCannotManageUser(user)}
                        onClick={() => openEdit(user)}
                      >
                        <Pencil size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="light"
                        color="red"
                        aria-label="Xóa"
                        disabled={
                          user.id === currentUser?.id || gmCannotManageUser(user)
                        }
                        onClick={() => setDeleteTarget(user)}
                      >
                        <Trash2 size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
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
                render: (u) => <Badge>{roleLabel[u.role]}</Badge>,
              },
              {
                accessor: "branchIds",
                title: "Chi nhánh",
                sortable: true,
                render: (u) =>
                  u.branchIds
                    .map((id) => state.branches.find((branch) => branch.id === id)?.name ?? id)
                    .join(", "),
              },
              {
                accessor: "actions",
                title: "Thao tác",
                textAlign: "right",
                render: (u) => (
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <ActionIcon
                      variant="subtle"
                      aria-label="Sửa"
                      disabled={u.id === currentUser?.id || gmCannotManageUser(u)}
                      onClick={() => openEdit(u)}
                    >
                      <Pencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Xóa"
                      disabled={u.id === currentUser?.id || gmCannotManageUser(u)}
                      onClick={() => setDeleteTarget(u)}
                    >
                      <Trash2 size={16} />
                    </ActionIcon>
                  </Group>
                ),
              },
            ]}
          />
        </PortalSectionCard>

        <Modal
          opened={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditingUser(null);
          }}
          title="Sửa tài khoản"
          size="md"
        >
          <Stack gap="sm">
            <TextInput
              label="Tên đăng nhập"
              value={editUsername}
              onChange={(e) => setEditUsername(e.currentTarget.value)}
            />
            <PasswordInput
              label="Mật khẩu mới"
              placeholder="Để trống nếu không đổi mật khẩu"
              value={editPassword}
              onChange={(e) => setEditPassword(e.currentTarget.value)}
            />
            <TextInput
              label="Họ tên"
              value={editFullName}
              onChange={(e) => setEditFullName(e.currentTarget.value)}
            />
            <Select
              label="Vai trò"
              value={editRole}
              onChange={(value) => setEditRole((value as Role) || "manager")}
              data={roleSelectDataScoped}
            />
            <MultiSelect
              label="Chi nhánh quản lý"
              value={editBranchIds}
              onChange={setEditBranchIds}
              data={branchMultiData}
            />
            <Group justify="flex-end" mt="md">
              <Button variant="default" onClick={() => setEditOpen(false)}>
                Hủy
              </Button>
              <Button loading={editSaving} onClick={() => void handleSaveEdit()}>
                Lưu
              </Button>
            </Group>
          </Stack>
        </Modal>

        <Modal
          opened={deleteTarget !== null}
          onClose={() => setDeleteTarget(null)}
          title="Xóa tài khoản"
          size="sm"
        >
          <Stack gap="md">
            <Text size="sm">
              Xóa vĩnh viễn tài khoản{" "}
              <Text span fw={700}>
                {deleteTarget?.username}
              </Text>
              ? Thao tác này không hoàn tác. Nếu tài khoản còn dữ liệu liên quan (ví dụ booking), hệ
              thống có thể từ chối xóa.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setDeleteTarget(null)}>
                Hủy
              </Button>
              <Button color="red" loading={deleteLoading} onClick={() => void handleConfirmDelete()}>
                Xóa
              </Button>
            </Group>
          </Stack>
        </Modal>
      </Stack>
    </RouteGuard>
  );
}
