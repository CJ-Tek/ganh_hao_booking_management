"use client";

import { Button, Group } from "@mantine/core";
import { useEffect, useRef } from "react";
import {
  bookingCalendarStatusFilterStatuses,
  bookingStatusColor,
  bookingStatusLabel,
  normalizeBookingStatusFilters,
  toggleBookingStatusFilter,
} from "@/lib/display";
import { type BookingStatus } from "@/lib/types";
import { usePortalCompact } from "@/lib/use-portal-compact";

type BookingStatusFilterChipsProps = {
  value: readonly BookingStatus[];
  onChange: (value: BookingStatus[]) => void;
  statuses?: readonly BookingStatus[];
  size?: "xs" | "compact-sm" | "sm";
  /** When true, chips are shown but cannot be changed (e.g. search is active). */
  locked?: boolean;
};

function isAllStatusesSelected(
  value: readonly BookingStatus[],
  statuses: readonly BookingStatus[]
): boolean {
  return statuses.length > 0 && statuses.every((status) => value.includes(status));
}

export function BookingStatusFilterChips(props: BookingStatusFilterChipsProps) {
  const {
    value,
    onChange,
    statuses = bookingCalendarStatusFilterStatuses,
    size: sizeProp,
    locked = false,
  } = props;
  const isCompact = usePortalCompact();
  const size = sizeProp ?? (isCompact ? "xs" : "compact-sm");
  const allStatuses = [...statuses];
  const isAllSelected = isAllStatusesSelected(value, statuses);
  const selectionBeforeAllRef = useRef<BookingStatus[]>([...value]);

  useEffect(() => {
    if (!isAllSelected) {
      selectionBeforeAllRef.current = [...value];
    }
  }, [isAllSelected, value]);

  const handleToggleAll = () => {
    if (locked) {
      return;
    }
    if (isAllSelected) {
      onChange(normalizeBookingStatusFilters(selectionBeforeAllRef.current));
      return;
    }
    selectionBeforeAllRef.current = [...value];
    onChange([...allStatuses]);
  };

  const handleToggleStatus = (status: BookingStatus) => {
    if (locked) {
      return;
    }
    const next = toggleBookingStatusFilter(value, status);
    if (!isAllSelected && isAllStatusesSelected(next, statuses)) {
      selectionBeforeAllRef.current = [...value];
    }
    onChange(next);
  };

  const chipGroup = (
    <Group gap="xs" wrap={isCompact ? "nowrap" : "wrap"} role="group" aria-label="Lọc trạng thái booking">
      {statuses.map((status) => {
        const selected = value.includes(status);
        const color = bookingStatusColor[status];
        return (
          <Button
            key={status}
            size={size}
            radius="xl"
            variant={selected ? "filled" : "outline"}
            color={color}
            aria-pressed={selected}
            disabled={locked}
            onClick={() => handleToggleStatus(status)}
            styles={{
              root: selected
                ? {
                    borderWidth: 2,
                    borderStyle: "solid",
                    borderColor: `var(--mantine-color-${color}-7)`,
                  }
                : undefined,
            }}
          >
            {bookingStatusLabel[status]}
          </Button>
        );
      })}
      <Button
        key="all"
        size={size}
        radius="xl"
        variant={isAllSelected ? "filled" : "outline"}
        color="gray"
        aria-pressed={isAllSelected}
        disabled={locked}
        onClick={handleToggleAll}
        styles={{
          root: isAllSelected
            ? {
                borderWidth: 2,
                borderStyle: "solid",
                borderColor: "var(--mantine-color-gray-7)",
              }
            : undefined,
        }}
      >
        Tất cả
      </Button>
    </Group>
  );

  if (isCompact) {
    return <div className="mobile-filter-chip-scroll">{chipGroup}</div>;
  }

  return chipGroup;
}
