"use client";

import { Button, Group } from "@mantine/core";
import { FilterChipScroll } from "@/components/filter-chip-scroll";
import { usePortalCompact } from "@/lib/use-portal-compact";

export type CustomerBookingFilter = "all" | "has_booking" | "no_booking";

const customerBookingFilterLabel: Record<CustomerBookingFilter, string> = {
  all: "Tất cả",
  has_booking: "Có booking",
  no_booking: "Chưa có booking",
};

const customerBookingFilterColor: Record<CustomerBookingFilter, string> = {
  all: "gray",
  has_booking: "green",
  no_booking: "orange",
};

export function CustomerBookingFilterChips(props: {
  value: CustomerBookingFilter;
  onChange: (value: CustomerBookingFilter) => void;
  size?: "xs" | "compact-sm" | "sm";
}) {
  const { value, onChange, size: sizeProp } = props;
  const isCompact = usePortalCompact();
  const size = sizeProp ?? (isCompact ? "xs" : "compact-sm");

  const chips: CustomerBookingFilter[] = ["all", "has_booking", "no_booking"];

  const chipGroup = (
    <Group gap="xs" wrap="nowrap" role="group" aria-label="Lọc khách hàng theo booking">
      {chips.map((chip) => {
        const selected = value === chip;
        const color = customerBookingFilterColor[chip];
        return (
          <Button
            key={chip}
            size={size}
            radius="xl"
            variant={selected ? "filled" : "outline"}
            color={color}
            onClick={() => onChange(chip)}
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
            {customerBookingFilterLabel[chip]}
          </Button>
        );
      })}
    </Group>
  );

  return (
    <FilterChipScroll edgeBleed={isCompact}>
      {chipGroup}
    </FilterChipScroll>
  );
}
