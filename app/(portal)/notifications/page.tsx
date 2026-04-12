"use client";

import dayjs from "dayjs";
import { Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import { useAppContext } from "@/contexts/app-context";

export default function NotificationsPage() {
  const { state, filteredBranchIds, markNotificationRead } = useAppContext();

  const notifications = state.notifications.filter(
    (item) => !item.branchId || filteredBranchIds.includes(item.branchId)
  );

  return (
    <Stack>
      <Title order={2}>Thông báo nội bộ</Title>
      {notifications.map((item) => (
        <Card withBorder key={item.id}>
          <Group justify="space-between" align="start">
            <div>
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
            </div>
            <Button
              variant="light"
              size="compact-sm"
              onClick={() => void markNotificationRead(item.id)}
              disabled={item.isRead}
            >
              Đánh dấu đã đọc
            </Button>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
