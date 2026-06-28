"use client";

import dayjs from "dayjs";
import { Badge, Stack, Text } from "@mantine/core";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useMemo, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { useAppContext } from "@/contexts/app-context";
import { getReceptionBookingStatus } from "@/lib/booking-meta";
import { useBookingGuestTypeLabel } from "@/lib/use-booking-guest-type-label";
import {
  bookingMatchesStatusFilters,
  bookingScheduleSearchStatusFilters,
  bookingScheduleStatusFilterStatuses,
  defaultScheduleStatusFilters,
} from "@/lib/display";
import { type Booking, type BookingStatus } from "@/lib/types";
import { useBookingStatusFiltersWithSearch } from "@/lib/use-booking-status-filters-with-search";

function formatScheduleVisitDate(iso: string): string {
  const date = dayjs(iso);
  if (date.isSame(dayjs(), "day")) {
    return "Hôm nay";
  }
  if (date.isSame(dayjs().add(1, "day"), "day")) {
    return "Ngày mai";
  }
  return date.format("DD/MM/YYYY");
}

export function TableBlockConfirmedScheduleTable(props: { records: Booking[] }) {
  const { records } = props;
  const { state } = useAppContext();
  const getGuestTypeLabel = useBookingGuestTypeLabel(records);
  const [statusFilters, setStatusFilters] = useState<BookingStatus[]>(defaultScheduleStatusFilters);
  const [searchQuery, setSearchQuery] = useState("");
  const isSearchActive = useBookingStatusFiltersWithSearch(searchQuery, statusFilters, setStatusFilters, {
    searchStatusFilters: bookingScheduleSearchStatusFilters,
    defaultStatusFilters: defaultScheduleStatusFilters,
  });
  const receptionThresholds = useMemo(
    () => ({
      groupPartyGuestThreshold: state.bookingRuntimeSettings.groupPartyGuestThreshold,
      repeatCustomerMinCompleted: state.bookingRuntimeSettings.repeatCustomerMinCompleted,
      receptionArrivalGraceMinutes: state.bookingRuntimeSettings.receptionArrivalGraceMinutes,
      noShowGraceMinutes: state.bookingRuntimeSettings.noShowGraceMinutes,
    }),
    [state.bookingRuntimeSettings]
  );
  const bookingAreaTableLookup = useMemo(
    () => ({
      areas: state.areas,
      tables: state.tables,
      mergeGroups: state.mergeGroups,
    }),
    [state.areas, state.mergeGroups, state.tables]
  );

  const filteredRecords = useMemo(
    () => records.filter((booking) => bookingMatchesStatusFilters(booking.status, statusFilters)),
    [records, statusFilters]
  );

  const getRecordSearchValue = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const visitAt = booking.startTime ?? booking.bookingAt;
      return [
        formatScheduleVisitDate(visitAt),
        dayjs(booking.startTime).format("HH:mm"),
        dayjs(booking.endTime).format("HH:mm"),
        customer?.fullName,
        booking.guestCount,
        getGuestTypeLabel(booking),
        getReceptionBookingStatus(booking, receptionThresholds).label,
      ]
        .filter(Boolean)
        .join(" ");
    },
    [getGuestTypeLabel, receptionThresholds, state.customers]
  );

  const sortRecords = useCallback(
    (rows: Booking[], sortStatus: DataTableSortStatus<Booking>) => {
      const getValue = (booking: Booking) => {
        if (sortStatus.columnAccessor === "visitDate") {
          return dayjs(booking.startTime ?? booking.bookingAt).valueOf();
        }
        if (sortStatus.columnAccessor === "timeRange") {
          return dayjs(booking.startTime).valueOf();
        }
        if (sortStatus.columnAccessor === "customerId") {
          return state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
        }
        if (sortStatus.columnAccessor === "guestCount") {
          return booking.guestCount;
        }
        if (sortStatus.columnAccessor === "guestType") {
          return getGuestTypeLabel(booking);
        }
        if (sortStatus.columnAccessor === "status") {
          return getReceptionBookingStatus(booking, receptionThresholds).label;
        }
        return dayjs(booking.startTime ?? booking.bookingAt).valueOf();
      };
      return [...rows].sort((left, right) => {
        const leftValue = getValue(left);
        const rightValue = getValue(right);
        const compare =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue), "vi");
        return sortStatus.direction === "asc" ? compare : -compare;
      });
    },
    [getGuestTypeLabel, receptionThresholds, state.customers]
  );

  return (
    <Stack gap="sm">
      <BookingStatusFilterChips
        value={statusFilters}
        onChange={setStatusFilters}
        statuses={bookingScheduleStatusFilterStatuses}
        locked={isSearchActive}
        size="xs"
      />
      <PortalDataTable<Booking>
        records={filteredRecords}
        idAccessor="id"
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        getRecordSearchValue={getRecordSearchValue}
        sortRecords={sortRecords}
        defaultSort={{ columnAccessor: "visitDate", direction: "asc" }}
        searchPlaceholder="Khách, ngày, giờ, trạng thái..."
        noRecordsText="Chưa có booking sắp tới trên bàn này."
        minHeight={220}
        defaultRecordsPerPage={8}
        mobileCardRender={(booking) => {
          const customer = state.customers.find((item) => item.id === booking.customerId);
          const creator =
            state.users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "Không rõ";
          const lastEditor =
            booking.lastEditedByUserId != null
              ? state.users.find((item) => item.id === booking.lastEditedByUserId)?.fullName
              : undefined;

          return (
            <BookingCompactCard
              key={booking.id}
              booking={booking}
              variant="list"
              customerName={customer?.fullName ?? "—"}
              creatorName={creator}
              bookingAreaTableLookup={bookingAreaTableLookup}
              lastEditorName={lastEditor}
            />
          );
        }}
        columns={[
          {
            accessor: "customerId",
            title: "Khách",
            sortable: true,
            render: (booking) =>
              state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—",
          },
          {
            accessor: "visitDate",
            title: "Ngày đến",
            sortable: true,
            render: (booking) => formatScheduleVisitDate(booking.startTime ?? booking.bookingAt),
          },
          {
            accessor: "timeRange",
            title: "Giờ",
            sortable: true,
            render: (booking) => (
              <Text size="sm">
                {dayjs(booking.startTime).format("HH:mm")} – {dayjs(booking.endTime).format("HH:mm")}
              </Text>
            ),
          },
          {
            accessor: "guestCount",
            title: "Số khách",
            sortable: true,
          },
          {
            accessor: "guestType",
            title: "Loại khách",
            sortable: true,
            render: (booking) => getGuestTypeLabel(booking),
          },
          {
            accessor: "status",
            title: "Trạng thái",
            sortable: true,
            render: (booking) => {
              const receptionStatus = getReceptionBookingStatus(booking, receptionThresholds);
              return (
                <Badge color={receptionStatus.color} variant="light" size="sm">
                  {receptionStatus.label}
                </Badge>
              );
            },
          },
        ]}
      />
    </Stack>
  );
}
