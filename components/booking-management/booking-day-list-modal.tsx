"use client";

import dayjs from "dayjs";
import { Button, Group, Stack, Text } from "@mantine/core";
import { Map } from "lucide-react";
import { useRouter } from "next/navigation";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react";
import { buildFloorMapHref } from "@/lib/floor-map-routes";
import { BookingDayBookingsTable } from "@/components/booking-management/booking-day-bookings-table";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { useAppContext } from "@/contexts/app-context";
import {
  bookingAreaTableSortKey,
  resolveBookingArrivalTime,
  resolveBookingCreatedAt,
} from "@/lib/booking-meta";
import { bookingStatusLabel, defaultBookingStatusFilter } from "@/lib/display";
import { type Booking, type BookingStatus } from "@/lib/types";

type DayTableStatusFilter = BookingStatus | null;

export type BookingDayListModalHandle = {
  openDayListModal: () => void;
  openDayListModalForBooking: (booking: Booking) => void;
};

export const BookingDayListModal = forwardRef<
  BookingDayListModalHandle,
  {
    selectedDate: dayjs.Dayjs;
    onSelectedDateChange?: (date: dayjs.Dayjs) => void;
    onDayBookingRowClick?: (booking: Booking) => void;
    /** When set (e.g. already on Sơ đồ), apply date locally instead of routing. */
    onNavigateToFloorMap?: (date: dayjs.Dayjs) => void;
  }
>(function BookingDayListModal(
  { selectedDate, onSelectedDateChange, onDayBookingRowClick, onNavigateToFloorMap },
  ref
) {
  const router = useRouter();
  const { state, filteredBranchIds } = useAppContext();
  const [opened, setOpened] = useState(false);
  const [dayTableStatusFilter, setDayTableStatusFilter] =
    useState<DayTableStatusFilter>(defaultBookingStatusFilter);
  const [focusBookingId, setFocusBookingId] = useState<string | null>(null);

  const filteredBookings = useMemo(
    () => state.bookings.filter((booking) => filteredBranchIds.includes(booking.branchId)),
    [filteredBranchIds, state.bookings]
  );

  const selectedDayBookings = useMemo(
    () =>
      filteredBookings
        .filter((booking) =>
          dayjs(resolveBookingArrivalTime(booking)).isSame(selectedDate, "day")
        )
        .filter((booking) => !dayTableStatusFilter || booking.status === dayTableStatusFilter),
    [dayTableStatusFilter, filteredBookings, selectedDate]
  );

  const bookingAreaTableLookup = useMemo(
    () => ({
      areas: state.areas,
      tables: state.tables,
      mergeGroups: state.mergeGroups,
    }),
    [state.areas, state.mergeGroups, state.tables]
  );

  const getDayBookingSearchValue = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const location = bookingAreaTableSortKey(booking, bookingAreaTableLookup);
      return [
        customer?.fullName,
        customer?.phone,
        location,
        bookingStatusLabel[booking.status],
        dayjs(resolveBookingArrivalTime(booking)).format("HH:mm DD/MM/YYYY"),
        dayjs(resolveBookingCreatedAt(booking)).format("HH:mm DD/MM/YYYY"),
        booking.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    },
    [bookingAreaTableLookup, state.customers]
  );

  const handleDayBookingRowClick = useCallback(
    (booking: Booking) => {
      setFocusBookingId(booking.id);
      onDayBookingRowClick?.(booking);
    },
    [onDayBookingRowClick]
  );

  const openDayListModal = useCallback(() => {
    setFocusBookingId(null);
    setDayTableStatusFilter(defaultBookingStatusFilter);
    setOpened(true);
  }, []);

  const handleNavigateToFloorMap = useCallback(() => {
    onSelectedDateChange?.(selectedDate);
    setOpened(false);
    setFocusBookingId(null);
    if (onNavigateToFloorMap) {
      onNavigateToFloorMap(selectedDate);
      return;
    }
    router.push(buildFloorMapHref(selectedDate));
  }, [onNavigateToFloorMap, onSelectedDateChange, router, selectedDate]);

  const openDayListModalForBooking = useCallback(
    (booking: Booking) => {
      const date = dayjs(booking.bookingAt);
      onSelectedDateChange?.(date);
      setDayTableStatusFilter(booking.status);
      setFocusBookingId(booking.id);
      setOpened(true);
    },
    [onSelectedDateChange]
  );

  useImperativeHandle(
    ref,
    () => ({
      openDayListModal,
      openDayListModalForBooking,
    }),
    [openDayListModal, openDayListModalForBooking]
  );

  return (
    <PortalStandardModal
      opened={opened}
      onClose={() => {
        setOpened(false);
        setFocusBookingId(null);
      }}
      title={
        <Group gap="xs" wrap="wrap">
          <Text fw={700} span>
            Danh sách booking
          </Text>
          <Text fw={700} c="blue.6" span>
            {selectedDate.format("DD/MM/YYYY")}
          </Text>
          <Text fw={700} span>
            ({selectedDayBookings.length})
          </Text>
        </Group>
      }
      size="xl"
      centered
    >
      <Stack gap="sm">
        <Button
          variant="filled"
          fullWidth
          onClick={handleNavigateToFloorMap}
          styles={{
            inner: {
              justifyContent: "center",
              width: "100%",
            },
          }}
        >
          <Group
            component="span"
            gap="xs"
            justify="center"
            wrap="wrap"
            style={{ width: "100%" }}
          >
            <Map size={16} aria-hidden />
            <span>Mở Sơ đồ · {selectedDate.format("DD/MM/YYYY")}</span>
          </Group>
        </Button>
        <BookingDayBookingsTable
        showTitle={false}
        wrapInSectionCard={false}
        records={selectedDayBookings}
        statusFilter={dayTableStatusFilter}
        onStatusFilterChange={setDayTableStatusFilter}
        getRecordSearchValue={getDayBookingSearchValue}
        onRowClick={handleDayBookingRowClick}
        focusBookingId={focusBookingId}
        />
      </Stack>
    </PortalStandardModal>
  );
});

BookingDayListModal.displayName = "BookingDayListModal";
