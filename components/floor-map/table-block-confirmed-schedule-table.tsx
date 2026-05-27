"use client";

import dayjs from "dayjs";
import { Select, Text } from "@mantine/core";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import { type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useMemo, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { type Booking, type BookingStatus } from "@/lib/types";

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

const scheduleStatusFilterData = (["confirmed", "seated", "checked_in"] as const).map((status) => ({
  value: status,
  label: bookingStatusLabel[status],
}));

export function TableBlockConfirmedScheduleTable(props: { records: Booking[] }) {
  const { records } = props;
  const { state } = useAppContext();
  const bookingAreaTableLookup = useMemo(
    () => ({
      areas: state.areas,
      tables: state.tables,
      mergeGroups: state.mergeGroups,
    }),
    [state.areas, state.mergeGroups, state.tables]
  );
  const [statusFilter, setStatusFilter] = useState<BookingStatus | null>(null);

  const filteredRecords = useMemo(
    () => (statusFilter ? records.filter((booking) => booking.status === statusFilter) : records),
    [records, statusFilter]
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
        bookingStatusLabel[booking.status],
      ]
        .filter(Boolean)
        .join(" ");
    },
    [state.customers]
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
        if (sortStatus.columnAccessor === "status") {
          return bookingStatusLabel[booking.status];
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
    [state.customers]
  );

  return (
    <PortalDataTable<Booking>
      records={filteredRecords}
      idAccessor="id"
      getRecordSearchValue={getRecordSearchValue}
      sortRecords={sortRecords}
      defaultSort={{ columnAccessor: "visitDate", direction: "asc" }}
      searchPlaceholder="Khách, ngày, giờ, trạng thái..."
      noRecordsText="Chưa có booking sắp tới trên bàn này."
      minHeight={220}
      defaultRecordsPerPage={8}
      filters={
        <Select
          label="Trạng thái"
          placeholder="Tất cả"
          clearable
          data={scheduleStatusFilterData}
          value={statusFilter}
          onChange={(value) => setStatusFilter((value as BookingStatus | null) ?? null)}
          size="sm"
          w={168}
          miw={168}
        />
      }
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
          accessor: "customerId",
          title: "Khách",
          sortable: true,
          render: (booking) =>
            state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—",
        },
        {
          accessor: "guestCount",
          title: "Số khách",
          sortable: true,
        },
        {
          accessor: "status",
          title: "Trạng thái",
          sortable: true,
          render: (booking) => (
            <Badge color={bookingStatusColor[booking.status]} variant="light" size="sm">
              {bookingStatusLabel[booking.status]}
            </Badge>
          ),
        },
      ]}
    />
  );
}
