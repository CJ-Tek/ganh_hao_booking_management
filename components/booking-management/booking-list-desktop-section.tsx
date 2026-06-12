"use client";

import type { ReactNode } from "react";
import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { PortalListSectionDesktop } from "@/components/portal-list/portal-list-section-desktop";
import { type BookingStatus } from "@/lib/types";

export function BookingListDesktopSection(props: {
  title: string;
  statusFilters: readonly BookingStatus[];
  onStatusFiltersChange: (value: BookingStatus[]) => void;
  statusFilterStatuses: readonly BookingStatus[];
  statusFiltersLocked?: boolean;
  table: ReactNode;
}) {
  const { title, statusFilters, onStatusFiltersChange, statusFilterStatuses, statusFiltersLocked, table } =
    props;

  return (
    <PortalListSectionDesktop
      title={title}
      headerFilters={
        <BookingStatusFilterChips
          value={statusFilters}
          onChange={onStatusFiltersChange}
          statuses={statusFilterStatuses}
          locked={statusFiltersLocked}
        />
      }
    >
      {table}
    </PortalListSectionDesktop>
  );
}
