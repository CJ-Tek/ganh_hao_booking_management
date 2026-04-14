"use client";

import dayjs from "dayjs";
import { Badge, Button, Group, Stack, Text } from "@mantine/core";
import { PortalPageTitle, PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";

export default function NotificationsPage() {
  const { state, filteredBranchIds, markNotificationRead } = useAppContext();

  const notifications = state.notifications.filter(
    (item) => !item.branchId || filteredBranchIds.includes(item.branchId)
  );

  return (
    <Stack>
      <PortalPageTitle>Thông báo nội bộ</PortalPageTitle>
      {notifications.length === 0 && (
        <PortalSectionCard>
          <Text c="dimmed" size="sm">
            Hiện chưa có thông báo mới cho chi nhánh của bạn.
          </Text>
        </PortalSectionCard>
      )}
      {notifications.map((item) => (
        <PortalSectionCard key={item.id}>
          <Group justify="space-between" align="start" wrap="wrap">
            <Stack gap={4} style={{ flex: 1, minWidth: 220 }}>
              <Group gap="xs">
                <Text fw={700}>{item.title}</Text>
                {!item.isRead && <Badge size="xs">Mới</Badge>}
              </Group>
              <Text size="sm" c="dimmed">
                {item.message}
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {dayjs(item.createdAt).format("HH:mm DD/MM/YYYY")}
              </Text>
            </Stack>
            <Button
              variant="light"
              size="compact-sm"
              onClick={() => void markNotificationRead(item.id)}
              disabled={item.isRead}
            >
              Đánh dấu đã đọc
            </Button>
          </Group>
        </PortalSectionCard>
      ))}
    </Stack>
  );
}
