"use client";

import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { PortalListPanelHeader } from "@/components/portal-list/portal-list-panel-header";
import { type BookingStatus } from "@/lib/types";

export function BookingListPanelHeader(props: {
  title: string;
  statusFilter: BookingStatus | null;
  onStatusFilterChange: (value: BookingStatus | null) => void;
  statuses: readonly BookingStatus[];
  chipSize?: "xs" | "compact-sm" | "sm";
}) {
  const { title, statusFilter, onStatusFilterChange, statuses, chipSize } = props;

  return (
    <PortalListPanelHeader
      title={title}
      filters={
        <BookingStatusFilterChips
          value={statusFilter}
          onChange={onStatusFilterChange}
          statuses={statuses}
          size={chipSize}
        />
      }
    />
  );
}
