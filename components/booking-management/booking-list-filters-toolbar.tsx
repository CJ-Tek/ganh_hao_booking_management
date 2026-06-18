"use client";

import { Button, Collapse, Group, Select, Stack } from "@mantine/core";
import { type DataTableSortStatus } from "mantine-datatable";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { TextInputWithVoice } from "@/components/TextInputWithVoice";
import { type Booking } from "@/lib/types";
import { usePortalCompact } from "@/lib/use-portal-compact";

const ARRIVAL_SORT_DATA = [
  { value: "asc", label: "Sớm → Muộn" },
  { value: "desc", label: "Muộn → Sớm" },
] as const;

const CREATED_SORT_DATA = [
  { value: "desc", label: "Mới → Cũ" },
  { value: "asc", label: "Cũ → Mới" },
] as const;

type SortDirection = "asc" | "desc";

function isSortDirection(value: string | null): value is SortDirection {
  return value === "asc" || value === "desc";
}

export function BookingListTimeSortFilters<T>(props: {
  sortStatus: DataTableSortStatus<T>;
  onSortStatusChange: (status: DataTableSortStatus<T>) => void;
  fallbackSort: DataTableSortStatus<T>;
  size?: "sm" | "md";
  layout?: "default" | "panel";
}) {
  const { sortStatus, onSortStatusChange, fallbackSort, size = "sm", layout = "default" } = props;
  const isCompact = usePortalCompact();
  const isPanel = layout === "panel";
  const isFluid = isCompact || isPanel;
  const columnAccessor = sortStatus.columnAccessor as string;
  const selectStyle = isFluid ? { flex: "1 1 0", minWidth: 0 } : { flexShrink: 0 };
  const selectWidth = isFluid ? undefined : 148;
  const selectMinWidth = isCompact ? 0 : isPanel ? "6.5rem" : 148;

  const applyArrivalSort = (direction: SortDirection | null) => {
    if (direction) {
      onSortStatusChange({
        columnAccessor: "bookingAt" as DataTableSortStatus<T>["columnAccessor"],
        direction,
      });
      return;
    }
    if (columnAccessor === "bookingAt") {
      onSortStatusChange(fallbackSort);
    }
  };

  const applyCreatedSort = (direction: SortDirection | null) => {
    if (direction) {
      onSortStatusChange({
        columnAccessor: "createdAt" as DataTableSortStatus<T>["columnAccessor"],
        direction,
      });
      return;
    }
    if (columnAccessor === "createdAt") {
      onSortStatusChange(fallbackSort);
    }
  };

  const selects = (
    <>
      <Select
        label="Giờ đến"
        placeholder="Sắp xếp"
        clearable
        data={[...ARRIVAL_SORT_DATA]}
        value={columnAccessor === "bookingAt" ? sortStatus.direction : null}
        onChange={(value) => applyArrivalSort(isSortDirection(value) ? value : null)}
        size={size}
        w={selectWidth}
        miw={selectMinWidth}
        style={selectStyle}
      />
      <Select
        label="Tạo đơn"
        placeholder="Sắp xếp"
        clearable
        data={[...CREATED_SORT_DATA]}
        value={columnAccessor === "createdAt" ? sortStatus.direction : null}
        onChange={(value) => applyCreatedSort(isSortDirection(value) ? value : null)}
        size={size}
        w={selectWidth}
        miw={selectMinWidth}
        style={selectStyle}
      />
    </>
  );

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="flex-end"
      w={isCompact ? "100%" : undefined}
      grow={isCompact}
      style={isPanel ? { flex: "1 1 0", minWidth: 0 } : undefined}
    >
      {selects}
    </Group>
  );
}

export function useBookingListTimeSort(
  defaultSort: DataTableSortStatus<Booking>,
  size: "sm" | "md" = "sm"
) {
  const [sortStatus, setSortStatus] = useState(defaultSort);

  const timeSortFilters = (
    <BookingListTimeSortFilters
      sortStatus={sortStatus}
      fallbackSort={defaultSort}
      onSortStatusChange={setSortStatus}
      size={size}
    />
  );

  return {
    sortStatus,
    setSortStatus,
    defaultSort,
    timeSortFilters,
  };
}

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
      style={{ flexShrink: 0 }}
    />
  );
}

export function BookingListFiltersToolbar(props: {
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  searchPlaceholder: string;
  /** Shown on the same row as search (e.g. Loại khách). */
  inlineFilters?: ReactNode;
  filtersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
  collapseFilters?: ReactNode;
}) {
  const {
    searchQuery,
    onSearchQueryChange,
    searchPlaceholder,
    inlineFilters,
    filtersOpen = false,
    onFiltersOpenChange,
    collapseFilters,
  } = props;

  const isCompact = usePortalCompact();
  const hasCollapseFilters = collapseFilters != null;

  return (
    <Stack gap="sm">
      {isCompact ? (
        <Stack gap="sm" w="100%">
          <TextInputWithVoice
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            size="md"
            voiceIconSize="md"
            style={{ width: "100%" }}
          />
          {inlineFilters}
          {hasCollapseFilters ? (
            <Button
              variant="default"
              size="md"
              aria-expanded={filtersOpen}
              onClick={() => onFiltersOpenChange?.(!filtersOpen)}
              rightSection={filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              fullWidth
            >
              {filtersOpen ? "Ẩn bộ lọc" : "Bộ lọc"}
            </Button>
          ) : null}
        </Stack>
      ) : (
        <Group align="flex-end" gap="sm" wrap="nowrap">
          <TextInputWithVoice
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
            size="md"
            voiceIconSize="md"
            style={{ flex: 1, minWidth: 0 }}
          />
          {inlineFilters}
          {hasCollapseFilters ? (
            <Button
              variant="default"
              size="md"
              aria-expanded={filtersOpen}
              onClick={() => onFiltersOpenChange?.(!filtersOpen)}
              rightSection={filtersOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            >
              {filtersOpen ? "Ẩn bộ lọc" : "Bộ lọc"}
            </Button>
          ) : null}
        </Group>
      )}
      {hasCollapseFilters ? (
        <Collapse expanded={filtersOpen}>
          <Stack gap="sm" pt="xs">
            {collapseFilters}
          </Stack>
        </Collapse>
      ) : null}
    </Stack>
  );
}
