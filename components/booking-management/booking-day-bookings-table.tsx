"use client";

import dayjs from "dayjs";
import { Badge, Card, Group, Stack, Text } from "@mantine/core";
import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";
import { type DataTableSortStatus } from "mantine-datatable";
import { PortalDataTable } from "@/components/portal-data-table";
import { useAppContext } from "@/contexts/app-context";
import { bookingListRowStyle } from "@/lib/busy-row-style";
import {
  bookingCalendarStatusFilterStatuses,
  bookingStatusColor,
  bookingStatusLabel,
} from "@/lib/display";
import {
  displayCustomerPhone,
  formatBookingAreaTable,
  isGuestCountSpecified,
} from "@/lib/booking-meta";
import { type Booking, type BookingStatus } from "@/lib/types";
import { useMemo } from "react";

const DAY_LIST_BOOKING_PULSE_CYCLE_MS = 600;
const DAY_LIST_BOOKING_PULSE_CYCLES = 2;

export function BookingDayBookingsTable(props: {
  records: Booking[];
  statusFilter: BookingStatus | null;
  onStatusFilterChange: (value: BookingStatus | null) => void;
  sortRecords: (records: Booking[], sortStatus: DataTableSortStatus<Booking>) => Booking[];
  getRecordSearchValue: (booking: Booking) => string;
  onRowClick: (booking: Booking) => void;
  focusBookingId?: string | null;
}) {
  const {
    records,
    statusFilter,
    onStatusFilterChange,
    sortRecords,
    getRecordSearchValue,
    onRowClick,
    focusBookingId = null,
  } = props;
  const { state } = useAppContext();

  const bookingAreaTableLookup = useMemo(
    () => ({
      areas: state.areas,
      tables: state.tables,
      mergeGroups: state.mergeGroups,
    }),
    [state.areas, state.mergeGroups, state.tables]
  );

  return (
    <Stack gap="sm">
      <BookingStatusFilterChips
        value={statusFilter}
        onChange={onStatusFilterChange}
        statuses={bookingCalendarStatusFilterStatuses}
      />
      <PortalDataTable<Booking>
        records={records}
        getRecordSearchValue={getRecordSearchValue}
        sortRecords={sortRecords}
        defaultSort={{ columnAccessor: "bookingAt", direction: "asc" }}
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
        return (
          <Card
            key={booking.id}
            withBorder
            radius="md"
            padding="md"
            onClick={() => onRowClick(booking)}
            style={{ cursor: "pointer" }}
          >
            <Stack gap="xs">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Text fw={700} lineClamp={2}>
                  {customer?.fullName ?? "—"}
                </Text>
                <Badge color={bookingStatusColor[booking.status]} variant="light">
                  {bookingStatusLabel[booking.status]}
                </Badge>
              </Group>
              <Text size="sm">{dayjs(booking.bookingAt).format("HH:mm · DD/MM/YYYY")}</Text>
              {booking.checkedInAt ? (
                <Text size="xs" c="dimmed">
                  Check-in: {dayjs(booking.checkedInAt).format("HH:mm · DD/MM/YYYY")}
                </Text>
              ) : null}
              <Text size="sm" c="dimmed">
                {formatBookingAreaTable(booking, bookingAreaTableLookup, {
                  tableNamePrefix: true,
                })}
              </Text>
              <Text size="xs" c="dimmed">
                {isGuestCountSpecified(booking) ? `${booking.guestCount} khách` : "Chưa rõ số khách"}
              </Text>
            </Stack>
          </Card>
        );
      }}
      columns={[
        {
          accessor: "bookingAt",
          title: "Giờ đặt",
          sortable: true,
          render: (booking) => dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
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
    </Stack>
  );
}
