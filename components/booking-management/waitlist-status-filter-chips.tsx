"use client";

import { Button, Group } from "@mantine/core";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type WaitlistStatus } from "@/lib/types";

const WAITLIST_STATUS_FILTER_STATUSES = [
  "waiting",
  "offered",
  "expired",
  "cancelled",
  "promoted",
] as const satisfies readonly WaitlistStatus[];

const waitlistStatusLabel: Record<WaitlistStatus, string> = {
  waiting: "Đang chờ",
  offered: "Được mời",
  expired: "Hết hạn",
  cancelled: "Đã hủy",
  promoted: "Đã xác nhận",
};

const waitlistStatusColor: Record<WaitlistStatus, string> = {
  waiting: "orange",
  offered: "cyan",
  expired: "gray",
  cancelled: "red",
  promoted: "green",
};

export function WaitlistStatusFilterChips(props: {
  value: WaitlistStatus | null;
  onChange: (value: WaitlistStatus | null) => void;
  statuses?: readonly WaitlistStatus[];
  size?: "xs" | "compact-sm" | "sm";
}) {
  const {
    value,
    onChange,
    statuses = WAITLIST_STATUS_FILTER_STATUSES,
    size: sizeProp,
  } = props;
  const isCompact = usePortalCompact();
  const size = sizeProp ?? (isCompact ? "xs" : "compact-sm");

  const chips: { value: WaitlistStatus | null; label: string; color: string }[] = [
    { value: null, label: "Tất cả", color: "gray" },
    ...statuses.map((status) => ({
      value: status,
      label: waitlistStatusLabel[status],
      color: waitlistStatusColor[status],
    })),
  ];

  return (
    <Group gap="xs" wrap="wrap" role="group" aria-label="Lọc trạng thái hàng chờ">
      {chips.map((chip) => {
        const selected = value === chip.value;
        return (
          <Button
            key={chip.value ?? "all"}
            size={size}
            radius="xl"
            variant={selected ? "filled" : "outline"}
            color={chip.color}
            onClick={() => onChange(chip.value)}
            styles={{
              root: selected
                ? {
                    borderWidth: 2,
                    borderStyle: "solid",
                    borderColor: `var(--mantine-color-${chip.color}-7)`,
                  }
                : undefined,
            }}
          >
            {chip.label}
          </Button>
        );
      })}
    </Group>
  );
}

export { waitlistStatusLabel, waitlistStatusColor };
