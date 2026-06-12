"use client";

import type { ReactNode } from "react";
import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { PortalListSectionMobile } from "@/components/portal-list/portal-list-section-mobile";
import { type BookingStatus } from "@/lib/types";

export function BookingListMobileView(props: {
  title: string;
  statusFilters: readonly BookingStatus[];
  onStatusFiltersChange: (value: BookingStatus[]) => void;
  statusFilterStatuses: readonly BookingStatus[];
  statusFiltersLocked?: boolean;
  filtersToolbar: ReactNode;
  paginationBar: ReactNode | null;
  bookingsContent: ReactNode;
}) {
  const {
    title,
    statusFilters,
    onStatusFiltersChange,
    statusFilterStatuses,
    statusFiltersLocked,
    filtersToolbar,
    paginationBar,
    bookingsContent,
  } = props;

  return (
    <PortalListSectionMobile
      title={title}
      headerFilters={
        <BookingStatusFilterChips
          value={statusFilters}
          onChange={onStatusFiltersChange}
          statuses={statusFilterStatuses}
          locked={statusFiltersLocked}
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
