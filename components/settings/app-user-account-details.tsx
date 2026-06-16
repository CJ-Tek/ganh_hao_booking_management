"use client";

import { Stack, Text } from "@mantine/core";
import {
  appUserBranchNames,
  appUserDisplayName,
  formatAppUserAuditAt,
  formatAppUserPassword,
} from "@/lib/app-user-display";
import type { AppUser } from "@/lib/types";

export function AppUserAccountDetails(props: {
  user: AppUser;
  users: readonly Pick<AppUser, "id" | "fullName">[];
  branches: readonly { id: string; name: string }[];
  size?: "xs" | "sm";
}) {
  const { user, users, branches, size = "xs" } = props;
  const branchText = appUserBranchNames(user, branches);

  return (
    <Stack gap={4}>
      <Text size={size} c="dimmed">
        Mật khẩu:{" "}
        <Text component="span" c="dark" fw={600}>
          {formatAppUserPassword(user.password)}
        </Text>
      </Text>
      <Text size={size} c="dimmed">
        Chi nhánh: {branchText || "—"}
      </Text>
      <Text size={size} c="dimmed">
        Tạo bởi: {appUserDisplayName(user.createdByUserId, users)} ·{" "}
        {formatAppUserAuditAt(user.createdAt)}
      </Text>
      <Text size={size} c="dimmed">
        Cập nhật bởi: {appUserDisplayName(user.updatedByUserId, users)} ·{" "}
        {formatAppUserAuditAt(user.updatedAt)}
      </Text>
    </Stack>
  );
}
