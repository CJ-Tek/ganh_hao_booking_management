"use client";

import type { ReactNode } from "react";
import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { PortalListSectionMobile } from "@/components/portal-list/portal-list-section-mobile";
import { type BookingStatus } from "@/lib/types";

export function BookingListMobileView(props: {
  title: string;
  statusFilter: BookingStatus | null;
  onStatusFilterChange: (value: BookingStatus | null) => void;
  statusFilterStatuses: readonly BookingStatus[];
  filtersToolbar: ReactNode;
  paginationBar: ReactNode | null;
  bookingsContent: ReactNode;
}) {
  const {
    title,
    statusFilter,
    onStatusFilterChange,
    statusFilterStatuses,
    filtersToolbar,
    paginationBar,
    bookingsContent,
  } = props;

  return (
    <PortalListSectionMobile
      title={title}
      headerFilters={
        <BookingStatusFilterChips
          value={statusFilter}
          onChange={onStatusFilterChange}
          statuses={statusFilterStatuses}
          size="xs"
        />
      }
      filtersToolbar={filtersToolbar}
      paginationBar={paginationBar}
    >
      {bookingsContent}
    </PortalListSectionMobile>
  );
}

export { PortalListSectionEmptyState as BookingListMobileEmptyState } from "@/components/portal-list/portal-list-section-mobile";
