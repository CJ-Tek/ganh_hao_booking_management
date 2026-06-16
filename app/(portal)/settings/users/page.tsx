"use client";

import {
  ActionIcon,
  Button,
  Group,
  MultiSelect,
  PasswordInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type DataTableSortStatus } from "mantine-datatable";
import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalMinimalModal } from "@/components/portal-minimal-modal/portal-minimal-modal";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { AppUserCompactCard } from "@/components/settings/app-user-compact-card";
import { AppUserDetailDrawer } from "@/components/settings/app-user-detail-drawer";
import { AppUserRoleBadge } from "@/components/settings/app-user-role-badge";
import { AppUserRoleFilterChips } from "@/components/settings/app-user-role-filter-chips";
import { RouteGuard } from "@/components/route-guard";
import { useAppContext } from "@/contexts/app-context";
import {
  APP_USER_ROLE_LABEL,
  appUserBranchNames,
  appUserDisplayName,
  formatAppUserAuditAt,
  formatAppUserPassword,
  scopedAppUserRoleFilterStatuses,
  userMatchesRoleFilters,
} from "@/lib/app-user-display";
import { bookingCardBusyProps, bookingRowBusyStyle } from "@/lib/busy-row-style";
import { parseExcelUserPaste } from "@/lib/parse-excel-user-paste";
import { portalModalAboveDetailProps } from "@/lib/portal-z-index";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { AppUser, Role } from "@/lib/types";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: APP_USER_ROLE_LABEL.admin },
  { value: "general_manager", label: APP_USER_ROLE_LABEL.general_manager },
  { value: "manager", label: APP_USER_ROLE_LABEL.manager },
  { value: "employee", label: APP_USER_ROLE_LABEL.employee },
];

export default function UserManagementPage() {
  const { state, addUser, updateUser, deleteUser, currentUser } = useAppContext();
  const isCompact = usePortalCompact();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("manager");
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const userRoleFilterStatuses = useMemo(
    () => scopedAppUserRoleFilterStatuses(currentUser?.role),
    [currentUser?.role]
  );
  const [roleFilters, setRoleFilters] = useState<Role[]>(() => [
    ...scopedAppUserRoleFilterStatuses(undefined),
  ]);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
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
  const [isCreateSaving, setIsCreateSaving] = useState(false);
  const [createMode, setCreateMode] = useState<"single" | "paste">("single");
  const [pasteText, setPasteText] = useState("");

  const visibleUsers = useMemo(
    () =>
      state.users.filter(
        (user) => !(currentUser?.role === "general_manager" && user.role === "admin")
      ),
    [currentUser?.role, state.users]
  );

  const getUserSearchValue = useCallback(
    (user: AppUser) => {
      const branchText = user.branchIds
        .map((id) => state.branches.find((branch) => branch.id === id)?.name ?? id)
        .join(", ");
      return [user.username, user.fullName, APP_USER_ROLE_LABEL[user.role], branchText, user.password]
        .concat([
          appUserDisplayName(user.createdByUserId, state.users),
          appUserDisplayName(user.updatedByUserId, state.users),
          formatAppUserAuditAt(user.createdAt),
          formatAppUserAuditAt(user.updatedAt),
        ])
        .join(" ")
        .toLowerCase();
    },
    [state.branches, state.users]
  );

  const roleFilteredUsers = useMemo(
    () => visibleUsers.filter((user) => userMatchesRoleFilters(user.role, roleFilters)),
    [roleFilters, visibleUsers]
  );

  const filteredUserCount = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) {
      return roleFilteredUsers.length;
    }
    return roleFilteredUsers.filter((user) => getUserSearchValue(user).includes(keyword)).length;
  }, [getUserSearchValue, roleFilteredUsers, search]);

  const userListTitle = `Danh sách tài khoản (${filteredUserCount})`;

  const sortUsers = useCallback((records: AppUser[], sortStatus: DataTableSortStatus<AppUser>) => {
    return [...records].sort((a, b) => {
      let left = "";
      let right = "";
      if (sortStatus.columnAccessor === "fullName") {
        left = a.fullName;
        right = b.fullName;
      } else if (sortStatus.columnAccessor === "role") {
        left = APP_USER_ROLE_LABEL[a.role];
        right = APP_USER_ROLE_LABEL[b.role];
      } else if (sortStatus.columnAccessor === "branchIds") {
        left = a.branchIds.join(",");
        right = b.branchIds.join(",");
      } else if (sortStatus.columnAccessor === "createdAt") {
        left = a.createdAt ?? "";
        right = b.createdAt ?? "";
      } else if (sortStatus.columnAccessor === "updatedAt") {
        left = a.updatedAt ?? "";
        right = b.updatedAt ?? "";
      } else if (sortStatus.columnAccessor === "password") {
        left = a.password;
        right = b.password;
      } else {
        left = a.username;
        right = b.username;
      }
      const compare = left.localeCompare(right, "vi");
      return sortStatus.direction === "asc" ? compare : -compare;
    });
  }, []);

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

  useEffect(() => {
    setRoleFilters(userRoleFilterStatuses);
  }, [userRoleFilterStatuses]);

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

  const isUserRowBusy = (userId: string) =>
    (editSaving && editingUser?.id === userId) || (deleteLoading && deleteTarget?.id === userId);

  const selectedUser = useMemo(
    () =>
      selectedUserId
        ? state.users.find((user) => user.id === selectedUserId) ?? null
        : null,
    [selectedUserId, state.users]
  );

  const openUserDetail = useCallback((user: AppUser) => {
    setSelectedUserId(user.id);
  }, []);

  const closeUserDetail = useCallback(() => {
    setSelectedUserId(null);
  }, []);

  const cannotManageUser = (user: AppUser) =>
    user.id === currentUser?.id || gmCannotManageUser(user) || isUserRowBusy(user.id);

  const handleEditFromDetail = () => {
    if (!selectedUser || cannotManageUser(selectedUser)) {
      return;
    }
    openEdit(selectedUser);
  };

  const handleDeleteFromDetail = () => {
    if (!selectedUser || cannotManageUser(selectedUser)) {
      return;
    }
    closeUserDetail();
    setDeleteTarget(selectedUser);
  };

  const parsedPasteRows = useMemo(() => parseExcelUserPaste(pasteText), [pasteText]);

  const resetCreateForm = () => {
    setUsername("");
    setPassword("");
    setFullName("");
    setRole("manager");
    setBranchIds([]);
    setCreateMode("single");
    setPasteText("");
  };

  const handleCreateUser = async () => {
    setIsCreateSaving(true);
    try {
      const result = await addUser({ username, password, fullName, role, branchIds });
      notifications.show({
        color: result.ok ? "green" : "red",
        message: result.message,
      });
      if (result.ok) {
        resetCreateForm();
        setCreateOpen(false);
      }
    } finally {
      setIsCreateSaving(false);
    }
  };

  const handleBatchCreateUsers = async () => {
    if (!password.trim()) {
      notifications.show({ color: "red", message: "Vui lòng nhập mật khẩu dùng chung." });
      return;
    }
    if (parsedPasteRows.length === 0) {
      notifications.show({
        color: "red",
        message: "Chưa có dòng hợp lệ. Dán 2 cột từ Excel: Họ tên và Tên đăng nhập.",
      });
      return;
    }

    setIsCreateSaving(true);
    let successCount = 0;
    const failures: string[] = [];

    try {
      for (const row of parsedPasteRows) {
        const result = await addUser({
          username: row.username,
          password,
          fullName: row.fullName,
          role,
          branchIds,
        });
        if (result.ok) {
          successCount += 1;
        } else {
          failures.push(`${row.username}: ${result.message}`);
        }
      }

      if (successCount > 0 && failures.length === 0) {
        notifications.show({
          color: "green",
          message: `Đã tạo ${successCount} tài khoản.`,
        });
        resetCreateForm();
        setCreateOpen(false);
        return;
      }

      if (successCount > 0) {
        notifications.show({
          color: "yellow",
          title: `Đã tạo ${successCount}/${parsedPasteRows.length} tài khoản`,
          message: failures.slice(0, 3).join(" · ") + (failures.length > 3 ? " …" : ""),
          autoClose: false,
        });
        return;
      }

      notifications.show({
        color: "red",
        title: "Không tạo được tài khoản nào",
        message: failures.slice(0, 3).join(" · ") + (failures.length > 3 ? " …" : ""),
        autoClose: false,
      });
    } finally {
      setIsCreateSaving(false);
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
        if (selectedUserId === deleteTarget.id) {
          setSelectedUserId(null);
        }
        setDeleteTarget(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const branchMultiData = state.branches.map((b) => ({ value: b.id, label: b.name }));

  const sharedCreateFields = (
    <>
      <PasswordInput
        label={createMode === "paste" ? "Mật khẩu (dùng chung)" : "Mật khẩu"}
        value={password}
        onChange={(event) => setPassword(event.currentTarget.value)}
        disabled={isCreateSaving}
        size={isCompact ? "md" : "sm"}
      />
      <Select
        label="Vai trò"
        value={role}
        onChange={(value) => setRole((value as Role) || "manager")}
        data={roleSelectDataScoped}
        disabled={isCreateSaving}
        size={isCompact ? "md" : "sm"}
      />
      <MultiSelect
        label="Chi nhánh quản lý"
        value={branchIds}
        onChange={setBranchIds}
        data={branchMultiData}
        disabled={isCreateSaving}
        size={isCompact ? "md" : "sm"}
      />
    </>
  );

  const createUserForm = (
    <Tabs
      value={createMode}
      onChange={(value) => setCreateMode((value as "single" | "paste") || "single")}
    >
      <Tabs.List>
        <Tabs.Tab value="single">Từng tài khoản</Tabs.Tab>
        <Tabs.Tab value="paste">Dán từ Excel</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="single" pt="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput
            label="Tên đăng nhập"
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
            disabled={isCreateSaving}
            size={isCompact ? "md" : "sm"}
          />
          {sharedCreateFields}
          <TextInput
            label="Họ tên"
            value={fullName}
            onChange={(event) => setFullName(event.currentTarget.value)}
            disabled={isCreateSaving}
            size={isCompact ? "md" : "sm"}
          />
        </SimpleGrid>
      </Tabs.Panel>

      <Tabs.Panel value="paste" pt="md">
        <Stack gap="sm">
          <Textarea
            label="Dán từ Excel"
            description="Sao chép 2 cột: cột 1 là Họ tên, cột 2 là Tên đăng nhập."
            placeholder={"Nguyễn Văn A\tuser_a\nTrần Thị B\tuser_b"}
            value={pasteText}
            onChange={(event) => setPasteText(event.currentTarget.value)}
            disabled={isCreateSaving}
            minRows={5}
            autosize
            maxRows={10}
            size={isCompact ? "md" : "sm"}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {sharedCreateFields}
          </SimpleGrid>
          {parsedPasteRows.length > 0 ? (
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Xem trước ({parsedPasteRows.length} tài khoản)
              </Text>
              <ScrollArea.Autosize mah={200} type="auto">
                <Table striped highlightOnHover withTableBorder withColumnBorders>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Họ tên</Table.Th>
                      <Table.Th>Tên đăng nhập</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {parsedPasteRows.map((row) => (
                      <Table.Tr key={`${row.username}-${row.fullName}`}>
                        <Table.Td>{row.fullName}</Table.Td>
                        <Table.Td>{row.username}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea.Autosize>
            </Stack>
          ) : pasteText.trim() ? (
            <Text size="sm" c="dimmed">
              Chưa nhận diện được dòng hợp lệ. Mỗi dòng cần đủ Họ tên và Tên đăng nhập (phân tách bằng
              tab khi dán từ Excel).
            </Text>
          ) : null}
        </Stack>
      </Tabs.Panel>
    </Tabs>
  );

  const editUserForm = (
    <Stack gap="sm">
      <TextInput
        label="Tên đăng nhập"
        value={editUsername}
        onChange={(e) => setEditUsername(e.currentTarget.value)}
        disabled={editSaving}
        size={isCompact ? "md" : "sm"}
      />
      <PasswordInput
        label="Mật khẩu mới"
        placeholder="Để trống nếu không đổi mật khẩu"
        value={editPassword}
        onChange={(e) => setEditPassword(e.currentTarget.value)}
        disabled={editSaving}
        size={isCompact ? "md" : "sm"}
      />
      <TextInput
        label="Họ tên"
        value={editFullName}
        onChange={(e) => setEditFullName(e.currentTarget.value)}
        disabled={editSaving}
        size={isCompact ? "md" : "sm"}
      />
      <Select
        label="Vai trò"
        value={editRole}
        onChange={(value) => setEditRole((value as Role) || "manager")}
        data={roleSelectDataScoped}
        disabled={editSaving}
        size={isCompact ? "md" : "sm"}
      />
      <MultiSelect
        label="Chi nhánh quản lý"
        value={editBranchIds}
        onChange={setEditBranchIds}
        data={branchMultiData}
        disabled={editSaving}
        size={isCompact ? "md" : "sm"}
      />
    </Stack>
  );

  const openCreateUserButton = (
    <Button
      variant="filled"
      size={isCompact ? "md" : "sm"}
      onClick={() => setCreateOpen(true)}
      style={{ flexShrink: 0 }}
    >
      Tạo tài khoản
    </Button>
  );

  const userListToolbar = (
    <Stack gap="sm">
      <Group align="flex-end" gap="sm" wrap="nowrap">
        <TextInputWithVoice
          label="Tìm tài khoản"
          placeholder="Tên đăng nhập, họ tên, vai trò..."
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
          size={isCompact ? "md" : "sm"}
          voiceIconSize={isCompact ? "md" : "sm"}
          style={{ flex: 1, minWidth: 0 }}
        />
        {openCreateUserButton}
      </Group>
      <AppUserRoleFilterChips
        value={roleFilters}
        onChange={setRoleFilters}
        roles={userRoleFilterStatuses}
      />
    </Stack>
  );

  return (
    <RouteGuard allowedRoles={["admin", "general_manager"]}>
      <Stack>
        <PortalPageTitle>Quản lý người dùng</PortalPageTitle>

        {userListToolbar}

        <PortalSectionCard>
          <Text fw={600} mb="sm" size={isCompact ? "sm" : "md"}>
            {userListTitle}
          </Text>
          <PortalDataTable<AppUser>
            records={roleFilteredUsers}
            getRecordSearchValue={getUserSearchValue}
            sortRecords={sortUsers}
            defaultSort={{ columnAccessor: "username", direction: "asc" }}
            searchQuery={search}
            onSearchQueryChange={setSearch}
            hideSearch
            withToolbar={false}
            minHeight={240}
            rowStyle={(u) => bookingRowBusyStyle(isUserRowBusy(u.id))}
            mobileCardRender={(u) => {
              const cardBusy = bookingCardBusyProps(isUserRowBusy(u.id));
              return (
                <AppUserCompactCard
                  key={u.id}
                  user={u}
                  branches={state.branches}
                  className={cardBusy.className}
                  style={cardBusy.style}
                  onClick={() => {
                    if (isUserRowBusy(u.id)) {
                      return;
                    }
                    openUserDetail(u);
                  }}
                />
              );
            }}
            columns={[
              { accessor: "username", title: "Tài khoản", sortable: true },
              { accessor: "fullName", title: "Họ tên", sortable: true },
              {
                accessor: "role",
                title: "Vai trò",
                sortable: true,
                render: (u) => <AppUserRoleBadge role={u.role} />,
              },
              {
                accessor: "branchIds",
                title: "Chi nhánh",
                sortable: true,
                render: (u) => appUserBranchNames(u, state.branches) || "—",
              },
              {
                accessor: "password",
                title: "Mật khẩu",
                render: (u) => formatAppUserPassword(u.password),
              },
              {
                accessor: "createdAt",
                title: "Tạo bởi",
                sortable: true,
                render: (u) => (
                  <Stack gap={0}>
                    <Text size="sm">{appUserDisplayName(u.createdByUserId, state.users)}</Text>
                    <Text size="xs" c="dimmed">
                      {formatAppUserAuditAt(u.createdAt)}
                    </Text>
                  </Stack>
                ),
              },
              {
                accessor: "updatedAt",
                title: "Cập nhật bởi",
                sortable: true,
                render: (u) => (
                  <Stack gap={0}>
                    <Text size="sm">{appUserDisplayName(u.updatedByUserId, state.users)}</Text>
                    <Text size="xs" c="dimmed">
                      {formatAppUserAuditAt(u.updatedAt)}
                    </Text>
                  </Stack>
                ),
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
                      disabled={
                        u.id === currentUser?.id || gmCannotManageUser(u) || isUserRowBusy(u.id)
                      }
                      onClick={() => openEdit(u)}
                    >
                      <Pencil size={16} />
                    </ActionIcon>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      aria-label="Xóa"
                      disabled={
                        u.id === currentUser?.id || gmCannotManageUser(u) || isUserRowBusy(u.id)
                      }
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

        <AppUserDetailDrawer
          user={selectedUser}
          users={state.users}
          branches={state.branches}
          opened={selectedUser != null}
          onClose={closeUserDetail}
          disableActions={selectedUser ? cannotManageUser(selectedUser) || editOpen : true}
          onEdit={handleEditFromDetail}
          onDelete={handleDeleteFromDetail}
        />

        <PortalStandardModal
          opened={createOpen}
          onClose={() => {
            if (!isCreateSaving) {
              setCreateOpen(false);
            }
          }}
          closeOnClickOutside={!isCreateSaving}
          closeOnEscape={!isCreateSaving}
          title="Tạo tài khoản"
          size="md"
          footer={
            <Group justify="flex-end" gap="sm" wrap="nowrap">
              <Button variant="default" onClick={() => setCreateOpen(false)} disabled={isCreateSaving}>
                Hủy
              </Button>
              <Button
                loading={isCreateSaving}
                disabled={
                  isCreateSaving ||
                  (createMode === "paste"
                    ? parsedPasteRows.length === 0 || !password.trim()
                    : false)
                }
                onClick={() =>
                  void (createMode === "paste" ? handleBatchCreateUsers() : handleCreateUser())
                }
              >
                {createMode === "paste"
                  ? `Tạo ${parsedPasteRows.length > 0 ? parsedPasteRows.length : ""} tài khoản`.trim()
                  : "Tạo tài khoản"}
              </Button>
            </Group>
          }
        >
          {createUserForm}
        </PortalStandardModal>

        <PortalStandardModal
          {...portalModalAboveDetailProps}
          opened={editOpen}
          onClose={() => {
            if (!editSaving) {
              setEditOpen(false);
              setEditingUser(null);
            }
          }}
          closeOnClickOutside={!editSaving}
          closeOnEscape={!editSaving}
          title="Sửa tài khoản"
          size="md"
          footer={
            <Group justify="flex-end" gap="sm" wrap="nowrap">
              <Button variant="default" disabled={editSaving} onClick={() => setEditOpen(false)}>
                Hủy
              </Button>
              <Button loading={editSaving} disabled={editSaving} onClick={() => void handleSaveEdit()}>
                Lưu
              </Button>
            </Group>
          }
        >
          {editUserForm}
        </PortalStandardModal>

        <PortalMinimalModal
          opened={deleteTarget !== null}
          onClose={() => {
            if (!deleteLoading) {
              setDeleteTarget(null);
            }
          }}
          closeOnClickOutside={!deleteLoading}
          closeOnEscape={!deleteLoading}
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
        </PortalMinimalModal>
      </Stack>
    </RouteGuard>
  );
}
