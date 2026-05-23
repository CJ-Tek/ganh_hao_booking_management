"use client";

import dayjs from "dayjs";
import {
  Badge,
  Box,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useMemo, useState } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalPageTitle, PortalSectionCard, PortalStickyHeader } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { type Booking, type BookingStatus } from "@/lib/types";
import { usePortalCompact } from "@/lib/use-portal-compact";

type CalendarStatusFilter = "all" | BookingStatus;
type DayTableStatusFilter = BookingStatus | null;
const weekdayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

const bookingStatusSelectData = (
  ["pending", "confirmed", "seated", "checked_in", "no_show", "completed", "cancelled"] as const
).map((status) => ({
  value: status,
  label: bookingStatusLabel[status],
}));

export function BookingCalendarPanel(props: {
  title?: string;
  showHeader?: boolean;
  compactTitle?: string;
}) {
  const { title = "Lịch đặt bàn", showHeader = true, compactTitle = "Lịch đặt bàn" } = props;
  const { state, filteredBranchIds } = useAppContext();
  const isCompact = usePortalCompact();
  const [activeMonth, setActiveMonth] = useState(dayjs().startOf("month"));
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [dayTableModalOpened, setDayTableModalOpened] = useState(false);
  const [dayTableStatusFilter, setDayTableStatusFilter] = useState<DayTableStatusFilter>(null);
  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>("all");
  const today = dayjs();

  const filteredBookings = useMemo(
    () =>
      state.bookings
        .filter((booking) => filteredBranchIds.includes(booking.branchId))
        .filter((booking) => statusFilter === "all" || booking.status === statusFilter)
        .sort((a, b) => dayjs(a.bookingAt).valueOf() - dayjs(b.bookingAt).valueOf()),
    [filteredBranchIds, state.bookings, statusFilter]
  );

  const monthBookingsByDay = useMemo(() => {
    const start = activeMonth.startOf("month");
    const end = activeMonth.endOf("month");
    const grouped = new Map<string, Booking[]>();
    filteredBookings.forEach((booking) => {
      const bookingTime = dayjs(booking.bookingAt);
      if (!bookingTime.isBefore(start) && !bookingTime.isAfter(end)) {
        const key = bookingTime.format("YYYY-MM-DD");
        const list = grouped.get(key) ?? [];
        list.push(booking);
        grouped.set(key, list);
      }
    });
    return grouped;
  }, [activeMonth, filteredBookings]);

  const selectedDayBookings = useMemo(
    () =>
      filteredBookings
        .filter((booking) => dayjs(booking.bookingAt).isSame(selectedDate, "day"))
        .filter((booking) => !dayTableStatusFilter || booking.status === dayTableStatusFilter),
    [dayTableStatusFilter, filteredBookings, selectedDate]
  );

  const sortDayBookings = useCallback(
    (records: Booking[], sortStatus: DataTableSortStatus<Booking>) => {
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
      return [...records].sort((a, b) => {
        const left = getValue(a);
        const right = getValue(b);
        const compare =
          typeof left === "number" && typeof right === "number"
            ? left - right
            : String(left).localeCompare(String(right), "vi");
        return sortStatus.direction === "asc" ? compare : -compare;
      });
    },
    [state.areas, state.customers, state.tables]
  );

  const getDayBookingSearchValue = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "";
      const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "";
      const location = booking.areaId && booking.tableId ? `${area} ${table}` : "Chờ xếp bàn";
      return [
        customer?.fullName,
        customer?.phone,
        location,
        bookingStatusLabel[booking.status],
        dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
        booking.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    },
    [state.areas, state.customers, state.tables]
  );

  const statusChipData: { value: CalendarStatusFilter; label: string }[] = useMemo(
    () => [
      { value: "all", label: "Tất cả" },
      ...bookingStatusSelectData.map((item) => ({
        value: item.value as CalendarStatusFilter,
        label: item.label,
      })),
    ],
    []
  );

  const calendarDays = useMemo(() => {
    const startOfMonth = activeMonth.startOf("month");
    const totalDays = activeMonth.daysInMonth();
    const leadingEmptyDays = (startOfMonth.day() + 6) % 7;
    return {
      totalDays,
      leadingEmptyDays,
      days: Array.from({ length: totalDays }, (_, index) => startOfMonth.date(index + 1)),
    };
  }, [activeMonth]);

  const renderDaySummary = (dayBookings: Booking[]) => {
    if (dayBookings.length === 0) {
      return (
        <Text c="dimmed" size="xs">
          Chưa có lịch
        </Text>
      );
    }

    const confirmedCount = dayBookings.filter((booking) =>
      ["confirmed", "checked_in", "seated", "completed"].includes(booking.status)
    ).length;

    return (
      <Stack gap={2}>
        <Text size="xs" fw={600}>
          {dayBookings.length} booking
        </Text>
        <Text size="10px" c="dimmed">
          {confirmedCount} đã xác nhận
        </Text>
      </Stack>
    );
  };

  const openDayTableModal = (day: dayjs.Dayjs) => {
    setSelectedDate(day);
    setDayTableStatusFilter(null);
    setDayTableModalOpened(true);
  };

  const calendarLayout = (
    <Stack gap="sm">
      <Group gap="xs" wrap="wrap">
        {statusChipData.map((item) => (
          <Button
            key={item.value}
            size={isCompact ? "sm" : "compact-sm"}
            radius="xl"
            variant={statusFilter === item.value ? "filled" : "light"}
            onClick={() => setStatusFilter(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </Group>
      <Group justify="space-between" wrap="wrap">
        <Group gap="xs">
          <Button
            variant="default"
            size={isCompact ? "sm" : "compact-sm"}
            onClick={() => {
              const nextMonth = activeMonth.subtract(1, "month");
              setActiveMonth(nextMonth);
              setSelectedDate(nextMonth.startOf("month"));
            }}
          >
            Tháng trước
          </Button>
          <Button
            variant="default"
            size={isCompact ? "sm" : "compact-sm"}
            onClick={() => {
              const nextMonth = activeMonth.add(1, "month");
              setActiveMonth(nextMonth);
              setSelectedDate(nextMonth.startOf("month"));
            }}
          >
            Tháng sau
          </Button>
        </Group>
        <Button
          variant="light"
          size={isCompact ? "sm" : "compact-sm"}
          onClick={() => {
            const now = dayjs();
            setActiveMonth(now.startOf("month"));
            setSelectedDate(now);
          }}
        >
          Hôm nay
        </Button>
      </Group>

      <Text fw={700}>{activeMonth.format("MM/YYYY")}</Text>

      <SimpleGrid cols={7} spacing={6} verticalSpacing={6}>
        {weekdayLabels.map((label) => (
          <Box key={label} ta="center">
            <Text fw={700} size="xs" c="dimmed">
              {label}
            </Text>
          </Box>
        ))}
        {Array.from({ length: calendarDays.leadingEmptyDays }, (_, index) => (
          <Box key={`empty-${index}`} />
        ))}
        {calendarDays.days.map((day) => {
          const key = day.format("YYYY-MM-DD");
          const dayBookings = monthBookingsByDay.get(key) ?? [];
          const isSelected = day.isSame(selectedDate, "day");
          const isToday = day.isSame(today, "day");
          return (
            <Paper
              key={key}
              withBorder
              radius="md"
              p={6}
              style={{
                cursor: "pointer",
                minHeight: 86,
                borderColor: isSelected ? "var(--mantine-color-blue-6)" : undefined,
                backgroundColor: isSelected ? "var(--mantine-color-blue-0)" : undefined,
              }}
              onClick={() => openDayTableModal(day)}
            >
              <Stack gap={4}>
                <Group justify="space-between" align="center" wrap="nowrap" gap={4}>
                  <Text fw={700} size="sm">
                    {day.format("D")}
                  </Text>
                  {isToday ? (
                    <Badge size="xs" variant="light">
                      Hôm nay
                    </Badge>
                  ) : null}
                </Group>
                {renderDaySummary(dayBookings)}
              </Stack>
            </Paper>
          );
        })}
      </SimpleGrid>
    </Stack>
  );

  return (
    <Stack>
      {showHeader ? (
        <PortalStickyHeader justify="space-between" align="end" wrap="wrap" gap="sm">
          <PortalPageTitle order={isCompact ? 3 : 2}>
            {isCompact ? compactTitle : title}
          </PortalPageTitle>
        </PortalStickyHeader>
      ) : null}
      <PortalSectionCard>
        <Text c="dimmed" mb="sm" size={isCompact ? "xs" : "sm"}>
          Lịch tháng hiển thị tổng quan booking từng ngày. Chọn một ngày để xem bảng chi tiết.
        </Text>
        {calendarLayout}
      </PortalSectionCard>
      <Modal
        opened={dayTableModalOpened}
        onClose={() => setDayTableModalOpened(false)}
        title={`Danh sách booking ngày ${selectedDate.format("DD/MM/YYYY")}`}
        size="xl"
        centered
      >
        <PortalDataTable<Booking>
          records={selectedDayBookings}
          getRecordSearchValue={getDayBookingSearchValue}
          sortRecords={sortDayBookings}
          defaultSort={{ columnAccessor: "bookingAt", direction: "asc" }}
          searchPlaceholder="Khách, bàn, trạng thái, ghi chú..."
          noRecordsText="Không có booking trong ngày đã chọn."
          filters={
            <Select
              label="Trạng thái"
              placeholder="Tất cả"
              clearable
              data={bookingStatusSelectData}
              value={dayTableStatusFilter}
              onChange={(value) => setDayTableStatusFilter((value as BookingStatus | null) ?? null)}
              size="sm"
              w={168}
              miw={168}
            />
          }
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
      </Modal>
    </Stack>
  );
}
