"use client";

import { Card, Group, Stack, Text } from "@mantine/core";
import type { CSSProperties } from "react";
import { AppUserRoleBadge } from "@/components/settings/app-user-role-badge";
import { appUserBranchNames } from "@/lib/app-user-display";
import type { AppUser } from "@/lib/types";

export function AppUserCompactCard(props: {
  user: AppUser;
  branches: readonly { id: string; name: string }[];
  onClick: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const { user, branches, onClick, className, style } = props;
  const branchText = appUserBranchNames(user, branches);

  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      className={className}
      style={{ cursor: "pointer", ...style }}
      onClick={onClick}
    >
      <Stack gap="xs">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Text fw={700} lineClamp={2}>
              {user.fullName}
            </Text>
            <Text size="sm" c="dimmed">
              @{user.username}
            </Text>
          </Stack>
          <AppUserRoleBadge role={user.role} />
        </Group>
        {branchText ? (
          <Text size="xs" c="dimmed" lineClamp={2}>
            {branchText}
          </Text>
        ) : null}
      </Stack>
    </Card>
  );
}
