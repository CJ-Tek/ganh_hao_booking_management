"use client";

import dayjs from "dayjs";
import { Badge, Stack, Text } from "@mantine/core";
import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { useBookingListTimeSort } from "@/components/booking-management/booking-list-filters-toolbar";
import { PortalListSectionDesktop } from "@/components/portal-list/portal-list-section-desktop";
import { PortalDataTable } from "@/components/portal-data-table";
import { useAppContext } from "@/contexts/app-context";
import { bookingListRowStyle } from "@/lib/busy-row-style";
import {
  bookingCalendarStatusFilterStatuses,
  bookingStatusColor,
  bookingStatusLabel,
} from "@/lib/display";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import {
  displayCustomerPhone,
  formatBookingAreaTable,
  isGuestCountSpecified,
  resolveBookingArrivalTime,
  resolveBookingCreatedAt,
} from "@/lib/booking-meta";
import {
  bookingListDefaultCreatedSort,
  sortBookingsForDataTable,
} from "@/lib/booking-list-sort";
import { type Booking, type BookingStatus } from "@/lib/types";
import { useCallback, useMemo } from "react";

const DAY_LIST_BOOKING_PULSE_CYCLE_MS = 600;
const DAY_LIST_BOOKING_PULSE_CYCLES = 2;

export function BookingDayBookingsTable(props: {
  title?: string;
  showTitle?: boolean;
  wrapInSectionCard?: boolean;
  records: Booking[];
  statusFilter: BookingStatus | null;
  onStatusFilterChange: (value: BookingStatus | null) => void;
  getRecordSearchValue: (booking: Booking) => string;
  onRowClick: (booking: Booking) => void;
  focusBookingId?: string | null;
}) {
  const {
    title,
    showTitle = true,
    wrapInSectionCard = true,
    records,
    statusFilter,
    onStatusFilterChange,
    getRecordSearchValue,
    onRowClick,
    focusBookingId = null,
  } = props;
  const { state } = useAppContext();
  const { sortStatus, setSortStatus, defaultSort, timeSortFilters } = useBookingListTimeSort(
    bookingListDefaultCreatedSort
  );

  const bookingAreaTableLookup = useMemo(
    () => ({
      areas: state.areas,
      tables: state.tables,
      mergeGroups: state.mergeGroups,
    }),
    [state.areas, state.mergeGroups, state.tables]
  );

  const sortRecords = useCallback(
    (rows: Booking[], nextSortStatus: typeof sortStatus) =>
      sortBookingsForDataTable(rows, nextSortStatus, {
        customers: state.customers,
        bookingAreaTableLookup,
      }),
    [bookingAreaTableLookup, state.customers]
  );

  const statusFilters = (
    <BookingStatusFilterChips
      value={statusFilter}
      onChange={onStatusFilterChange}
      statuses={bookingCalendarStatusFilterStatuses}
    />
  );

  const table = (
    <PortalDataTable<Booking>
      records={records}
      getRecordSearchValue={getRecordSearchValue}
      sortRecords={sortRecords}
      sortStatus={sortStatus}
      onSortStatusChange={setSortStatus}
      defaultSort={defaultSort}
      filters={timeSortFilters}
      searchPlaceholder="Khách, bàn, trạng thái, ghi chú..."
      noRecordsText="Không có booking trong ngày đã chọn."
      minHeight={260}
      onRowClick={({ record }) => onRowClick(record)}
      rowStyle={(record) =>
        bookingListRowStyle(record.id, {
          busyBookingId: null,
          focusBookingId,
          focusPulse: {
            cycleMs: DAY_LIST_BOOKING_PULSE_CYCLE_MS,
            cycles: DAY_LIST_BOOKING_PULSE_CYCLES,
          },
          extra: { cursor: "pointer" },
        })
      }
      mobileCardRender={(booking) => {
        const customer = state.customers.find((item) => item.id === booking.customerId);
        const creator =
          state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
          "Không rõ";
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
            onClick={() => onRowClick(booking)}
            style={bookingListRowStyle(booking.id, {
              busyBookingId: null,
              focusBookingId,
              focusPulse: {
                cycleMs: DAY_LIST_BOOKING_PULSE_CYCLE_MS,
                cycles: DAY_LIST_BOOKING_PULSE_CYCLES,
              },
              extra: { cursor: "pointer" },
            })}
          />
        );
      }}
      columns={[
        {
          accessor: "createdAt",
          title: "Tạo lúc",
          sortable: true,
          render: (booking) =>
            dayjs(resolveBookingCreatedAt(booking)).format("HH:mm DD/MM/YYYY"),
        },
        {
          accessor: "bookingAt",
          title: "Giờ đến",
          sortable: true,
          render: (booking) =>
            dayjs(resolveBookingArrivalTime(booking)).format("HH:mm DD/MM/YYYY"),
        },
        {
          accessor: "checkedInAt",
          title: "Giờ check-in",
          sortable: true,
          render: (booking) =>
            booking.checkedInAt ? (
              <Text size="sm">{dayjs(booking.checkedInAt).format("HH:mm DD/MM/YYYY")}</Text>
            ) : (
              <Text size="sm" c="dimmed">
                —
              </Text>
            ),
        },
        {
          accessor: "customerId",
          title: "Khách",
          sortable: true,
          render: (booking) => {
            const customer = state.customers.find((item) => item.id === booking.customerId);
            return (
              <Stack gap={2}>
                <Text size="sm">{customer?.fullName ?? "—"}</Text>
                <Text size="xs" c="dimmed">
                  {displayCustomerPhone(customer?.phone)}
                </Text>
              </Stack>
            );
          },
        },
        {
          accessor: "areaTable",
          title: "Khu vực / Bàn",
          sortable: true,
          render: (booking) => formatBookingAreaTable(booking, bookingAreaTableLookup),
        },
        {
          accessor: "guestCount",
          title: "Số khách",
          sortable: true,
          render: (booking) =>
            isGuestCountSpecified(booking) ? (
              <Text size="sm">{booking.guestCount}</Text>
            ) : (
              <Text size="sm" c="dimmed">
                Chưa rõ
              </Text>
            ),
        },
        {
          accessor: "status",
          title: "Trạng thái",
          sortable: true,
          render: (booking) => (
            <Badge color={bookingStatusColor[booking.status]} variant="light">
              {bookingStatusLabel[booking.status]}
            </Badge>
          ),
        },
      ]}
    />
  );

  if (!wrapInSectionCard) {
    return (
      <Stack gap="sm">
        {statusFilters}
        {table}
      </Stack>
    );
  }

  return (
    <PortalListSectionDesktop
      title={title ?? "Danh sách booking"}
      showTitle={showTitle}
      headerFilters={statusFilters}
    >
      {table}
    </PortalListSectionDesktop>
  );
}
