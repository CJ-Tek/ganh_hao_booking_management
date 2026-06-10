"use client";

import { Group, Text } from "@mantine/core";

export function EditBookingModalTitle(props: { customerName: string }) {
  const { customerName } = props;

  return (
    <Group gap={8} wrap="nowrap" align="center" style={{ minWidth: 0, paddingRight: 8 }}>
      <Text fw={600} style={{ flexShrink: 0 }}>
        Chỉnh booking
      </Text>
      <Text size="sm" c="dimmed" truncate style={{ minWidth: 0 }}>
        · Khách{" "}
        <Text component="span" fw={600} c="dark">
          {customerName}
        </Text>
      </Text>
    </Group>
  );
}
