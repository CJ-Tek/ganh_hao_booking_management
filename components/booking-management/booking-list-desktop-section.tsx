"use client";

import type { ReactNode } from "react";
import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { PortalListSectionDesktop } from "@/components/portal-list/portal-list-section-desktop";
import { type BookingStatus } from "@/lib/types";

export function BookingListDesktopSection(props: {
  title: string;
  statusFilter: BookingStatus | null;
  onStatusFilterChange: (value: BookingStatus | null) => void;
  statusFilterStatuses: readonly BookingStatus[];
  table: ReactNode;
}) {
  const { title, statusFilter, onStatusFilterChange, statusFilterStatuses, table } = props;

  return (
    <PortalListSectionDesktop
      title={title}
      headerFilters={
        <BookingStatusFilterChips
          value={statusFilter}
          onChange={onStatusFilterChange}
          statuses={statusFilterStatuses}
        />
      }
    >
      {table}
    </PortalListSectionDesktop>
  );
}
