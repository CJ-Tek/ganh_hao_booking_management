"use client";

import { Button, Collapse, Group, Select, Stack } from "@mantine/core";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { usePortalCompact } from "@/lib/use-portal-compact";

export function BookingListTableAssignFilter(props: {
  value: "all" | "assigned" | "unassigned";
  onChange: (value: "all" | "assigned" | "unassigned") => void;
  data: { value: string; label: string }[];
  size?: "sm" | "md";
  width?: number | string;
}) {
  const { value, onChange, data, size = "sm", width = size === "md" ? undefined : 168 } = props;

  return (
    <Select
      label="Bàn"
      data={data}
      value={value}
      onChange={(next) => onChange((next as "all" | "assigned" | "unassigned") ?? "all")}
      size={size}
      w={width}
      miw={typeof width === "number" ? width : undefined}
    />
  );
}

export function BookingListFiltersToolbar(props: {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchPlaceholder: string;
  filtersOpen: boolean;
  onFiltersOpenChange: (open: boolean) => void;
  collapseFilters: ReactNode;
}) {
  const {
    searchQuery,
    onSearchQueryChange,
    searchPlaceholder,
    filtersOpen,
    onFiltersOpenChange,
    collapseFilters,
  } = props;

  const isCompact = usePortalCompact();

  return (
    <Stack gap="sm">
      <Group align="flex-end" gap="sm" wrap={isCompact ? "wrap" : "nowrap"}>
        <TextInputWithVoice
          placeholder={searchPlaceholder}
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
          size="md"
          voiceIconSize="md"
          style={{ flex: 1, minWidth: 0 }}
        />
        <Button
          variant="default"
          size="md"
          aria-expanded={filtersOpen}
          onClick={() => onFiltersOpenChange(!filtersOpen)}
          rightSection={filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          style={isCompact ? { flex: "1 1 auto", minWidth: "7.5rem" } : undefined}
        >
          {filtersOpen ? "Ẩn bộ lọc" : "Bộ lọc"}
        </Button>
      </Group>
      <Collapse expanded={filtersOpen}>
        <Stack gap="sm" pt="xs">
          {collapseFilters}
        </Stack>
      </Collapse>
    </Stack>
  );
}
