"use client";

import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { PortalListPanelHeader } from "@/components/portal-list/portal-list-panel-header";
import { type BookingStatus } from "@/lib/types";

export function BookingListPanelHeader(props: {
  title: string;
  statusFilters: readonly BookingStatus[];
  onStatusFiltersChange: (value: BookingStatus[]) => void;
  statuses: readonly BookingStatus[];
  chipSize?: "xs" | "compact-sm" | "sm";
  statusFiltersLocked?: boolean;
}) {
  const { title, statusFilters, onStatusFiltersChange, statuses, chipSize, statusFiltersLocked } =
    props;

  return (
    <PortalListPanelHeader
      title={title}
      filters={
        <BookingStatusFilterChips
          value={statusFilters}
          onChange={onStatusFiltersChange}
          statuses={statuses}
          size={chipSize}
          locked={statusFiltersLocked}
        />
      }
    />
  );
}
