"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { BellOff } from "lucide-react";
import { PortalPageTitle } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { formatNotificationTime } from "@/lib/format-notification-time";

type FilterMode = "all" | "unread";

export default function NotificationsPage() {
  const { state, filteredBranchIds, markNotificationRead, markAllScopedNotificationsRead } =
    useAppContext();
  const [filter, setFilter] = useState<FilterMode>("all");

  const notifications = useMemo(
    () =>
      state.notifications
        .filter((item) => !item.branchId || filteredBranchIds.includes(item.branchId))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [filteredBranchIds, state.notifications]
  );

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const filtered = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => !n.isRead) : notifications),
    [filter, notifications]
  );

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
        <Stack gap={4}>
          <PortalPageTitle order={2} mb={0}>
            Thông báo nội bộ
          </PortalPageTitle>
          <Text size="sm" c="dimmed">
            Theo dõi sự kiện check-in và cập nhật trong phạm vi chi nhánh bạn đang xem.
          </Text>
        </Stack>
        {unreadCount > 0 ? (
          <Button variant="light" color="brand" size="sm" onClick={() => void markAllScopedNotificationsRead()}>
            Đánh dấu tất cả đã đọc ({unreadCount})
          </Button>
        ) : null}
      </Group>

      <SegmentedControl
        value={filter}
        onChange={(v) => setFilter(v as FilterMode)}
        data={[
          { label: `Tất cả (${notifications.length})`, value: "all" },
          { label: `Chưa đọc (${unreadCount})`, value: "unread" },
        ]}
        size="sm"
      />

      {filtered.length === 0 ? (
        <Stack align="center" gap="sm" py="xl">
          <BellOff size={40} strokeWidth={1.25} opacity={0.35} />
          <Text ta="center" c="dimmed" size="sm" maw={360}>
            {filter === "unread"
              ? "Không còn thông báo chưa đọc."
              : "Chưa có thông báo nào trong phạm vi này."}
          </Text>
        </Stack>
      ) : (
        <Stack gap="xs">
          {filtered.map((item) => {
            const branch = item.branchId
              ? state.branches.find((b) => b.id === item.branchId)
              : null;
            return (
              <Group
                key={item.id}
                align="flex-start"
                wrap="nowrap"
                gap="md"
                p="md"
                style={{
                  borderRadius: "var(--mantine-radius-md)",
                  border: "1px solid light-dark(var(--mantine-color-gray-3), var(--mantine-color-dark-5))",
                  backgroundColor: item.isRead ? undefined : "var(--mantine-color-brand-light)",
                }}
              >
                <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
                  <Group gap="xs" justify="space-between" align="flex-start" wrap="nowrap">
                    <Text fw={700} size="sm" lh={1.35} style={{ flex: 1 }}>
                      {item.title}
                    </Text>
                    {!item.isRead ? (
                      <Badge size="xs" variant="dot" color="brand" style={{ flexShrink: 0 }}>
                        Mới
                      </Badge>
                    ) : (
                      <Badge size="xs" variant="outline" color="gray" style={{ flexShrink: 0 }}>
                        Đã đọc
                      </Badge>
                    )}
                  </Group>
                  <Text size="sm" c="dimmed" lh={1.55}>
                    {item.message}
                  </Text>
                  <Group gap="md" mt={4}>
                    <Text size="xs" c="dimmed">
                      {formatNotificationTime(item.createdAt)}
                    </Text>
                    {branch ? (
                      <>
                        <Text size="xs" c="dimmed">
                          ·
                        </Text>
                        <Text size="xs" c="dimmed" lineClamp={1}>
                          {branch.name}
                        </Text>
                      </>
                    ) : null}
                  </Group>
                </Stack>
                <Button
                  variant="light"
                  size="compact-sm"
                  disabled={item.isRead}
                  style={{ flexShrink: 0 }}
                  onClick={() => void markNotificationRead(item.id)}
                >
                  Đã đọc
                </Button>
              </Group>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
