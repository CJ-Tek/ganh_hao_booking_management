"use client";

import { Button, Group } from "@mantine/core";
import {
  bookingCalendarStatusFilterStatuses,
  bookingStatusColor,
  bookingStatusLabel,
} from "@/lib/display";
import { type BookingStatus } from "@/lib/types";
import { usePortalCompact } from "@/lib/use-portal-compact";

type BookingStatusFilterChipsProps = {
  value: BookingStatus | null;
  onChange: (value: BookingStatus | null) => void;
  statuses?: readonly BookingStatus[];
  size?: "xs" | "compact-sm" | "sm";
};

export function BookingStatusFilterChips(props: BookingStatusFilterChipsProps) {
  const { value, onChange, statuses = bookingCalendarStatusFilterStatuses, size: sizeProp } = props;
  const isCompact = usePortalCompact();
  const size = sizeProp ?? (isCompact ? "xs" : "compact-sm");

  const chips: { value: BookingStatus | null; label: string; color: string }[] = [
    ...statuses.map((status) => ({
      value: status,
      label: bookingStatusLabel[status],
      color: bookingStatusColor[status],
    })),
    { value: null, label: "Tất cả", color: "gray" },
  ];

  return (
    <Group gap="xs" wrap="wrap" role="group" aria-label="Lọc trạng thái booking">
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
