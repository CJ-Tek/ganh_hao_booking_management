"use client";



import dayjs from "dayjs";

import {

  Badge,

  Box,

  Button,

  Group,

  Paper,

  SimpleGrid,

  Stack,

  Text,

} from "@mantine/core";

import { DatePickerInput } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";

import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
  BookingDayListModal,
  type BookingDayListModalHandle,
} from "@/components/booking-management/booking-day-list-modal";
import { BookingOrderDetailModal } from "@/components/booking-management/booking-order-detail-modal";
import { CreateBookingModal } from "@/components/booking-management/create-booking-modal";
import { useBookingManagement } from "@/components/booking-management/use-booking-management";
import { BookingStatusFilterChips } from "@/components/booking-management/booking-status-filter-chips";

import { PortalPageTitle, PortalSectionCard, PortalStickyHeader } from "@/components/portal-page";

import { useAppContext } from "@/contexts/app-context";

import { type Booking, type BookingStatus } from "@/lib/types";

import { usePortalCompact } from "@/lib/use-portal-compact";
import { ChevronLeft, ChevronRight } from "lucide-react";



type CalendarStatusFilter = "all" | BookingStatus;

type BookingCalendarInteraction = "modal-on-day-click" | "select-day-only";

const weekdayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;



export type BookingCalendarPanelHandle = {
  openDayListModal: () => void;
  openDayListModalForBooking: (booking: Booking) => void;
};

export const BookingCalendarPanel = forwardRef<
  BookingCalendarPanelHandle,
  {
    title?: string;
    showHeader?: boolean;
    compactTitle?: string;
    /** Lịch tab: click day opens booking table modal. Sơ đồ: click day only selects date. */
    interaction?: BookingCalendarInteraction;
    selectedDate?: dayjs.Dayjs;
    onSelectedDateChange?: (date: dayjs.Dayjs) => void;
    /** When false, parent renders "Danh sách booking" (e.g. floor-map toolbar). Default true for select-day-only. */
    showDayListButton?: boolean;
    /** Row click in day-list modal; default opens booking detail in place. */
    onDayBookingRowClick?: (booking: Booking) => void;
    /** Omit section card + intro copy when parent wraps the panel (e.g. floor-map accordion). */
    embedded?: boolean;
    /** Show "Tạo booking" in page header. Default true when `showHeader` and not `embedded`. */
    showCreateBookingButton?: boolean;
  }
>(function BookingCalendarPanel(props, ref) {
  const {
    title = "Lịch đặt bàn",
    showHeader = true,
    compactTitle = "Lịch đặt bàn",
    interaction = "modal-on-day-click",
    selectedDate: selectedDateProp,
    onSelectedDateChange,
    showDayListButton = true,
    onDayBookingRowClick,
    embedded = false,
    showCreateBookingButton: showCreateBookingButtonProp,
  } = props;

  const { state, filteredBranchIds, currentUser } = useAppContext();
  const isEmployee = currentUser?.role === "employee";
  const showCreateBookingButton =
    showCreateBookingButtonProp ?? (showHeader && !embedded && !isEmployee);

  const isCompact = usePortalCompact();

  const isNarrowCalendar = useMediaQuery("(max-width: 30em)", false, {

    getInitialValueInEffect: true,

  });

  const [activeMonth, setActiveMonth] = useState(dayjs().startOf("month"));

  const [internalSelectedDate, setInternalSelectedDate] = useState(dayjs());

  const selectedDate = selectedDateProp ?? internalSelectedDate;

  const dayListModalRef = useRef<BookingDayListModalHandle | null>(null);

  const [statusFilter, setStatusFilter] = useState<CalendarStatusFilter>("pending");
  const [createBookingModalOpened, setCreateBookingModalOpened] = useState(false);
  const [dayListDetailBooking, setDayListDetailBooking] = useState<Booking | null>(null);
  const {
    bookingManagementModals,
    isBookingRowBusy,
    openEditBookingModal,
    openAssignOptions,
    setChangeTableBooking,
    runCheckIn,
    openCompleteBookingConfirm,
    openCancelBookingConfirm,
  } = useBookingManagement();

  const today = dayjs();

  const selectDayOnly = interaction === "select-day-only";

  const calendarIntroText = useMemo(() => {
    if (selectDayOnly) {
      return showDayListButton
        ? "Chọn ngày để cập nhật trạng thái bàn trên sơ đồ. Dùng nút Danh sách booking để xem chi tiết."
        : "Chọn ngày để cập nhật trạng thái bàn trên sơ đồ. Dùng Danh sách booking trên thanh công cụ sơ đồ để xem chi tiết.";
    }
    return "Lịch tháng hiển thị tổng quan booking từng ngày. Chọn một ngày để xem bảng chi tiết.";
  }, [selectDayOnly, showDayListButton]);

  const setSelectedDate = useCallback(

    (date: dayjs.Dayjs) => {

      if (selectedDateProp == null) {

        setInternalSelectedDate(date);

      }

      onSelectedDateChange?.(date);

    },

    [onSelectedDateChange, selectedDateProp]

  );



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

        <Text c="dimmed" size={isNarrowCalendar ? "10px" : "xs"} lineClamp={1}>

          {isNarrowCalendar ? "—" : "Chưa có lịch"}

        </Text>

      );

    }



    const confirmedCount = dayBookings.filter((booking) =>

      ["confirmed", "checked_in", "seated", "completed"].includes(booking.status)

    ).length;



    if (isNarrowCalendar) {

      return (

        <Stack gap={0} align="start">

          <Text size="10px" fw={600} lh={1.15}>

            {dayBookings.length}

          </Text>

          <Text size="9px" c="dimmed" lh={1.1} lineClamp={1}>

            booking

          </Text>

        </Stack>

      );

    }



    return (

      <Stack gap={2}>

        <Text size="xs" fw={600} lineClamp={1}>

          {dayBookings.length} booking

        </Text>

        <Text size="10px" c="dimmed" lineClamp={1}>

          {confirmedCount} đã xác nhận

        </Text>

      </Stack>

    );

  };



  const handleDayClick = (day: dayjs.Dayjs) => {
    setSelectedDate(day);
    if (!selectDayOnly) {
      dayListModalRef.current?.openDayListModal();
    }
  };

  const handleDayBookingRowClick = useCallback(
    (booking: Booking) => {
      if (onDayBookingRowClick) {
        onDayBookingRowClick(booking);
        return;
      }
      setDayListDetailBooking(booking);
    },
    [onDayBookingRowClick]
  );

  const openDayListModalForBooking = useCallback(
    (booking: Booking) => {
      const date = dayjs(booking.bookingAt);
      setActiveMonth(date.startOf("month"));
      setSelectedDate(date);
      dayListModalRef.current?.openDayListModalForBooking(booking);
    },
    [setSelectedDate]
  );

  useImperativeHandle(
    ref,
    () => ({
      openDayListModal: () => dayListModalRef.current?.openDayListModal(),
      openDayListModalForBooking,
    }),
    [openDayListModalForBooking]
  );



  const dayCellMinHeight = isNarrowCalendar ? 54 : isCompact ? 72 : 86;

  const dayCellPadding = isNarrowCalendar ? 4 : 6;

  const gridSpacing = isNarrowCalendar ? 4 : 6;



  const calendarLayout = (

    <Stack gap="sm">

      <BookingStatusFilterChips
        value={statusFilter === "all" ? null : statusFilter}
        onChange={(value) => setStatusFilter(value ?? "all")}
        size={isCompact || isNarrowCalendar ? "xs" : "compact-sm"}
      />

      <Group justify="space-between" wrap="wrap" gap="xs" align="flex-end">
        <Group gap="xs">
          <DatePickerInput
            label="Ngày xem sơ đồ"
            value={selectedDate.format("YYYY-MM-DD")}
            onChange={(value) => {
              if (!value) {
                return;
              }
              const date = dayjs(value, "YYYY-MM-DD");
              setActiveMonth(date.startOf("month"));
              setSelectedDate(date);
            }}
            valueFormat="DD/MM/YYYY"
            dropdownType="modal"
            size={isCompact || isNarrowCalendar ? "xs" : "sm"}
            style={{ flex: "1 1 auto", minWidth: isNarrowCalendar ? "100%" : 200 }}
            maw={isNarrowCalendar ? undefined : 280}
          />
        </Group>
        <Group gap="xs" align="center">
          <Button
            variant="default"
            size={isCompact || isNarrowCalendar ? "xs" : "compact-sm"}
            onClick={() => {
              const nextMonth = activeMonth.subtract(1, "month");
              setActiveMonth(nextMonth);
              setSelectedDate(nextMonth.startOf("month"));
            }}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="default"
            size={isCompact || isNarrowCalendar ? "xs" : "compact-sm"}
            onClick={() => {
              const now = dayjs();
              setActiveMonth(now.startOf("month"));
              setSelectedDate(now);
            }}
          >
            Hôm nay
          </Button>
          <Button
            variant="default"
            size={isCompact || isNarrowCalendar ? "xs" : "compact-sm"}
            onClick={() => {
              const nextMonth = activeMonth.add(1, "month");
              setActiveMonth(nextMonth);
              setSelectedDate(nextMonth.startOf("month"));
            }}
          >
            <ChevronRight size={16} />
          </Button>
        </Group>
      </Group>

      {selectDayOnly && showDayListButton ? (
        <Group justify="flex-end" wrap="wrap" gap="xs">
          <Button
            size={isCompact || isNarrowCalendar ? "sm" : "compact-sm"}
            onClick={() => dayListModalRef.current?.openDayListModal()}
          >
            Danh sách booking
          </Button>
        </Group>
      ) : null}



      <SimpleGrid cols={7} spacing={gridSpacing} verticalSpacing={gridSpacing}>

        {weekdayLabels.map((label) => (

          <Box key={label} ta="center">

            <Text fw={700} size={isNarrowCalendar ? "10px" : "xs"} c="dimmed">

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

              p={dayCellPadding}

              style={{

                cursor: "pointer",

                minHeight: dayCellMinHeight,

                overflow: "hidden",

                borderColor: isSelected ? "var(--mantine-color-blue-6)" : undefined,

                backgroundColor: isSelected ? "var(--mantine-color-blue-0)" : undefined,

                boxShadow: isToday && isNarrowCalendar ? "inset 0 0 0 2px var(--mantine-color-blue-4)" : undefined,

              }}

              onClick={() => handleDayClick(day)}

            >

              <Stack gap={isNarrowCalendar ? 2 : 4}>

                <Group justify="space-between" align="center" wrap="nowrap" gap={2}>

                  <Text fw={700} size={isNarrowCalendar ? "xs" : "sm"} lh={1.1}>

                    {day.format("D")}

                  </Text>

                  {isToday && !isNarrowCalendar ? (

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

        <PortalStickyHeader justify="space-between" align="center" wrap="wrap" gap="sm">

          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <PortalPageTitle order={isCompact ? 3 : 2} mb={0}>
              {isCompact ? compactTitle : title}
            </PortalPageTitle>
            <Text c="dimmed" size={isCompact ? "xs" : "sm"}>
              {calendarIntroText}
            </Text>
          </div>

          {showCreateBookingButton ? (
            <Button
              color="brand"
              size={isCompact || isNarrowCalendar ? "sm" : "compact-sm"}
              onClick={() => setCreateBookingModalOpened(true)}
            >
              Tạo booking
            </Button>
          ) : null}

        </PortalStickyHeader>

      ) : null}

      {embedded ? (
        calendarLayout
      ) : (
        <PortalSectionCard>
          {!showHeader ? (
            <Text c="dimmed" mb="sm" size={isCompact ? "xs" : "sm"}>
              {calendarIntroText}
            </Text>
          ) : null}
          {calendarLayout}
        </PortalSectionCard>
      )}

      <BookingDayListModal
        ref={dayListModalRef}
        selectedDate={selectedDate}
        onSelectedDateChange={setSelectedDate}
        onDayBookingRowClick={handleDayBookingRowClick}
      />

      {showCreateBookingButton ? (
        <CreateBookingModal
          opened={createBookingModalOpened}
          onClose={() => setCreateBookingModalOpened(false)}
          onFocusExistingBooking={(booking) => {
            openDayListModalForBooking(booking);
          }}
        />
      ) : null}

      <BookingOrderDetailModal
        booking={dayListDetailBooking}
        opened={dayListDetailBooking != null}
        onClose={() => setDayListDetailBooking(null)}
        source="list"
        isBookingRowBusy={isBookingRowBusy}
        onEdit={(booking) => {
          setDayListDetailBooking(null);
          openEditBookingModal(booking);
        }}
        onChangeTable={(booking) => {
          setDayListDetailBooking(null);
          setChangeTableBooking(booking);
        }}
        onAssign={(booking) => {
          setDayListDetailBooking(null);
          openAssignOptions(booking);
        }}
        onCheckIn={(id) => void runCheckIn(id)}
        onComplete={(booking) => {
          setDayListDetailBooking(null);
          openCompleteBookingConfirm(booking);
        }}
        onCancel={(booking) => {
          setDayListDetailBooking(null);
          openCancelBookingConfirm(booking);
        }}
      />
      {bookingManagementModals}

    </Stack>
  );
});

BookingCalendarPanel.displayName = "BookingCalendarPanel";

