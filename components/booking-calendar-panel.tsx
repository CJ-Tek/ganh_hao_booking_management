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
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { portalDataTableScrollAreaProps } from "@/lib/portal-datatable";
import { type Booking, type BookingStatus } from "@/lib/types";
import { usePortalCompact } from "@/lib/use-portal-compact";

type ViewMode = "day" | "week";
type CalendarStatusFilter = "all" | BookingStatus;

export function BookingCalendarPanel(props: {
  title?: string;
  showHeader?: boolean;
  compactTitle?: string;
}) {
  const { title = "Lịch đặt bàn", showHeader = true, compactTitle = "Lịch đặt bàn" } = props;
  const { state, filteredBranchIds } = useAppContext();
  const isCompact = usePortalCompact();
  const [mode, setMode] = useState<ViewMode>("day");
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>("all");
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
        .filter((booking) => statusFilter === "all" || booking.status === statusFilter)
        .sort((a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()),
    [filteredBranchIds, mode, now, state.bookings, statusFilter]
  );

  const sortedBookings = useMemo(() => {
    const getValue = (booking: Booking) => {
      if (sortStatus.columnAccessor === "customerId") {
        return state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
      }
      if (sortStatus.columnAccessor === "areaTable") {
        if (!booking.areaId || !booking.tableId) {
          return "Chờ xếp bàn";
        }
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
      const compare =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), "vi");
      return sortStatus.direction === "asc" ? compare : -compare;
    });
  }, [bookings, sortStatus, state.areas, state.customers, state.tables]);

  const pagedBookings = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(sortedBookings.length / pageSize));
    const currentPage = Math.min(page, totalPages);
    return sortedBookings.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [page, pageSize, sortedBookings]);

  const totalPages = Math.max(1, Math.ceil(sortedBookings.length / pageSize));

  const statusChipData: { value: CalendarStatusFilter; label: string }[] = useMemo(
    () => [
      { value: "all", label: "Tất cả" },
      ...(
        ["pending", "confirmed", "seated", "checked_in", "no_show", "completed", "cancelled"] as const
      ).map((status) => ({
        value: status,
        label: bookingStatusLabel[status],
      })),
    ],
    []
  );

  const calendarCards = (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        {statusChipData.map((item) => (
          <Button
            key={item.value}
            size={isCompact ? "sm" : "compact-sm"}
            radius="xl"
            variant={statusFilter === item.value ? "filled" : "light"}
            onClick={() => {
              setStatusFilter(item.value);
              setPage(1);
            }}
          >
            {item.label}
          </Button>
        ))}
      </Group>
      {pagedBookings.length === 0 ? (
        <Text c="dimmed" size="sm">
          Không có booking trong khoảng thời gian đã chọn.
        </Text>
      ) : (
        pagedBookings.map((booking) => {
          const customer = state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "—";
          const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "—";
          const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "—";
          const locationLine = booking.areaId && booking.tableId ? `${area} · Bàn ${table}` : "Chờ xếp bàn";
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
                <Text size="sm">{locationLine}</Text>
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
      {showHeader ? (
        <PortalStickyHeader justify="space-between" align="end" wrap="wrap" gap="sm">
          <PortalPageTitle order={isCompact ? 3 : 2}>
            {isCompact ? compactTitle : title}
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
      ) : null}
      <PortalSectionCard>
        <Text c="dimmed" mb="sm" size={isCompact ? "xs" : "sm"}>
          {mode === "day"
            ? `Bookings trong ngày ${now.format("DD/MM/YYYY")}.`
            : `Bookings từ ${now.startOf("week").format("DD/MM")} đến ${now.endOf("week").format(
                "DD/MM/YYYY"
              )}.`}
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
                accessor: "areaTable",
                title: "Khu vực / Bàn",
                sortable: true,
                render: (booking) => {
                  if (!booking.areaId || !booking.tableId) {
                    return "Chờ xếp bàn";
                  }
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
