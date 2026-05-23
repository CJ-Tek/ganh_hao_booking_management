"use client";

import dayjs from "dayjs";
import { Badge, Card, Group, Select, Stack, Text } from "@mantine/core";
import { type DataTableSortStatus } from "mantine-datatable";
import { PortalDataTable } from "@/components/portal-data-table";
import { useAppContext } from "@/contexts/app-context";
import { bookingListRowStyle } from "@/lib/busy-row-style";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import {
  displayCustomerPhone,
  isGuestCountSpecified,
} from "@/lib/booking-meta";
import { type Booking, type BookingStatus } from "@/lib/types";

const DAY_LIST_BOOKING_PULSE_CYCLE_MS = 600;
const DAY_LIST_BOOKING_PULSE_CYCLES = 2;

const bookingStatusSelectData = (
  ["pending", "confirmed", "seated", "checked_in", "no_show", "completed", "cancelled"] as const
).map((status) => ({
  value: status,
  label: bookingStatusLabel[status],
}));

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

  return (
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
      filters={
        <Select
          label="Trạng thái"
          placeholder="Tất cả"
          clearable
          data={bookingStatusSelectData}
          value={statusFilter}
          onChange={(value) => onStatusFilterChange((value as BookingStatus | null) ?? null)}
          size="sm"
          w={168}
          miw={168}
        />
      }
      mobileCardRender={(booking) => {
        const customer = state.customers.find((item) => item.id === booking.customerId);
        const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "—";
        const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "—";
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
                {booking.areaId && booking.tableId ? `${area} · Bàn ${table}` : "Chờ xếp bàn"}
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
          render: (booking) => {
            if (!booking.areaId || !booking.tableId) {
              return "Chờ xếp bàn";
            }
            const area = state.areas.find((item) => item.id === booking.areaId);
            const table = state.tables.find((item) => item.id === booking.tableId);
            return `${area?.name ?? "—"} · ${table?.name ?? "—"}`;
          },
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
}
