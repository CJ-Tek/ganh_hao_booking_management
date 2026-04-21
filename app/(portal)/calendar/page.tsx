"use client";

import dayjs from "dayjs";
import {
  Badge,
  Button,
  Card,
  Group,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useMemo, useState } from "react";
import { PortalPageTitle, PortalSectionCard, PortalStickyHeader } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { type Booking } from "@/lib/types";

type ViewMode = "day" | "week";

export default function CalendarPage() {
  const { state, filteredBranchIds } = useAppContext();
  const isCompact = usePortalCompact();
  const [mode, setMode] = useState<ViewMode>("day");
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "bookingAt",
    direction: "asc",
  });
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const now = dayjs();

  const bookings = useMemo(
    () =>
      state.bookings
        .filter((booking) => filteredBranchIds.includes(booking.branchId))
        .filter((booking) =>
          mode === "day"
            ? dayjs(booking.bookingAt).isSame(now, "day")
            : dayjs(booking.bookingAt).isAfter(now.startOf("week")) &&
              dayjs(booking.bookingAt).isBefore(now.endOf("week"))
        )
        .sort((a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()),
    [filteredBranchIds, mode, now, state.bookings]
  );

  const sortedBookings = useMemo(() => {
    const getValue = (booking: Booking) => {
      if (sortStatus.columnAccessor === "customerId") {
        return state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
      }
      if (sortStatus.columnAccessor === "branchId") {
        return state.branches.find((item) => item.id === booking.branchId)?.name ?? "";
      }
      if (sortStatus.columnAccessor === "areaTable") {
        const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "";
        const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "";
        return `${area} ${table}`;
      }
      if (sortStatus.columnAccessor === "status") {
        return bookingStatusLabel[booking.status];
      }
      return dayjs(booking.bookingAt).valueOf();
    };
    return [...bookings].sort((a, b) => {
      const left = getValue(a);
      const right = getValue(b);
      const compare = typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), "vi");
      return sortStatus.direction === "asc" ? compare : -compare;
    });
  }, [bookings, sortStatus, state.areas, state.branches, state.customers, state.tables]);

  const pagedBookings = useMemo(
    () => {
      const totalPages = Math.max(1, Math.ceil(sortedBookings.length / pageSize));
      const currentPage = Math.min(page, totalPages);
      return sortedBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    },
    [page, pageSize, sortedBookings]
  );

  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / pageSize));

  const calendarCards = (
    <Stack gap="sm">
      {pagedBookings.length === 0 ? (
        <Text c="dimmed" size="sm">
          Không có booking trong khoảng thời gian đã chọn.
        </Text>
      ) : (
        pagedBookings.map((booking) => {
          const customer =
            state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—";
          const branch = state.branches.find((item) => item.id === booking.branchId)?.name ?? "—";
          const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "—";
          const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "—";
          return (
            <Card key={booking.id} withBorder radius="md" padding="md">
              <Stack gap="xs">
                <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                  <Text fw={700} style={{ minWidth: 0 }} lineClamp={2}>
                    {customer}
                  </Text>
                  <Badge color={bookingStatusColor[booking.status]} variant="light">
                    {bookingStatusLabel[booking.status]}
                  </Badge>
                </Group>
                <Text size="lg" fw={800}>
                  {dayjs(booking.bookingAt).format("HH:mm")}
                </Text>
                <Text size="sm" c="dimmed">
                  {dayjs(booking.bookingAt).format("DD/MM/YYYY")}
                </Text>
                <Text size="sm">
                  {branch} · {area} · Bàn {table}
                </Text>
              </Stack>
            </Card>
          );
        })
      )}
      {sortedBookings.length > pageSize ? (
        <Group justify="center" gap="xs" mt="xs">
          <Button
            variant="default"
            size="compact-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Trước
          </Button>
          <Text size="sm" c="dimmed">
            {page}/{totalPages}
          </Text>
          <Button
            variant="default"
            size="compact-sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Sau
          </Button>
        </Group>
      ) : null}
    </Stack>
  );

  return (
    <Stack>
      <PortalStickyHeader justify="space-between" align="end" wrap="wrap" gap="sm">
        <PortalPageTitle order={isCompact ? 3 : 2}>
          {isCompact ? "Lịch đặt bàn" : "Lịch đặt bàn theo ngày / tuần"}
        </PortalPageTitle>
        <SegmentedControl
          fullWidth={isCompact}
          size={isCompact ? "md" : "sm"}
          value={mode}
          onChange={(value) => {
            setMode(value as ViewMode);
            setPage(1);
          }}
          data={[
            { label: "Hôm nay", value: "day" },
            { label: "Tuần này", value: "week" },
          ]}
        />
      </PortalStickyHeader>
      <PortalSectionCard>
        <Text c="dimmed" mb="sm" size={isCompact ? "xs" : "sm"}>
          {mode === "day"
            ? `Bookings trong ngày ${now.format("DD/MM/YYYY")}.`
            : `Bookings từ ${now.startOf("week").format("DD/MM")} đến ${now.endOf("week").format("DD/MM/YYYY")}.`}
        </Text>
        {isCompact ? (
          calendarCards
        ) : (
          <DataTable
            minHeight={260}
            scrollAreaProps={portalDataTableScrollAreaProps}
            withTableBorder
            records={pagedBookings}
            totalRecords={sortedBookings.length}
            recordsPerPage={pageSize}
            page={Math.min(page, totalPages)}
            onPageChange={setPage}
            sortStatus={sortStatus}
            onSortStatusChange={(next) => {
              setSortStatus(next);
              setPage(1);
            }}
            noRecordsText="Không có booking trong khoảng thời gian đã chọn."
            columns={[
              {
                accessor: "bookingAt",
                title: "Thời gian",
                sortable: true,
                render: (booking) => dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
              },
              {
                accessor: "customerId",
                title: "Khách",
                sortable: true,
                render: (booking) =>
                  state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "-",
              },
              {
                accessor: "branchId",
                title: "Chi nhánh",
                sortable: true,
                render: (booking) =>
                  state.branches.find((item) => item.id === booking.branchId)?.name ?? "-",
              },
              {
                accessor: "areaTable",
                title: "Khu vực / Bàn",
                sortable: true,
                render: (booking) => {
                  const area = state.areas.find((item) => item.id === booking.areaId);
                  const table = state.tables.find((item) => item.id === booking.tableId);
                  return `${area?.name ?? "-"} / ${table?.name ?? "-"}`;
                },
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
        )}
      </PortalSectionCard>
    </Stack>
  );
}
