import dayjs from "dayjs";
import type { DataTableSortStatus } from "mantine-datatable";
import {
  bookingAreaTableSortKey,
  type BookingAreaTableLookup,
  resolveBookingArrivalTime,
  resolveBookingCreatedAt,
  stripUnknownGuestTag,
} from "@/lib/booking-meta";
import { bookingStatusLabel } from "@/lib/display";
import type { Booking } from "@/lib/types";

export const bookingListDefaultCreatedSort: DataTableSortStatus<Booking> = {
  columnAccessor: "createdAt",
  direction: "desc",
};

export const bookingListDefaultArrivalSort: DataTableSortStatus<Booking> = {
  columnAccessor: "bookingAt",
  direction: "desc",
};

export type BookingListSortOptions = {
  customers: readonly { id: string; fullName: string }[];
  users?: readonly { id: string; fullName: string }[];
  bookingAreaTableLookup?: BookingAreaTableLookup;
  getStatusLabel?: (booking: Booking) => string;
  getLastEditorName?: (booking: Booking) => string;
  getAreaTableSortKey?: (booking: Booking) => string;
};

export function sortBookingsForDataTable(
  records: Booking[],
  sortStatus: DataTableSortStatus<Booking>,
  options: BookingListSortOptions
): Booking[] {
  const {
    customers,
    users = [],
    bookingAreaTableLookup,
    getStatusLabel,
    getLastEditorName,
    getAreaTableSortKey,
  } = options;

  const getValue = (booking: Booking) => {
    const acc = sortStatus.columnAccessor as string;
    if (acc === "customerId") {
      return customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
    }
    if (acc === "guestCount") {
      return booking.guestCount;
    }
    if (acc === "areaTable") {
      if (getAreaTableSortKey) {
        return getAreaTableSortKey(booking);
      }
      if (bookingAreaTableLookup) {
        return bookingAreaTableSortKey(booking, bookingAreaTableLookup);
      }
      return "";
    }
    if (acc === "note") {
      return stripUnknownGuestTag(booking.note) ?? "";
    }
    if (acc === "createdByUserId") {
      return users.find((item) => item.id === booking.createdByUserId)?.fullName ?? "";
    }
    if (acc === "lastEditedByUserId") {
      return getLastEditorName?.(booking) ?? "";
    }
    if (acc === "lastEditedAt") {
      return booking.lastEditedAt ? dayjs(booking.lastEditedAt).valueOf() : 0;
    }
    if (acc === "checkedInAt") {
      return booking.checkedInAt ? dayjs(booking.checkedInAt).valueOf() : 0;
    }
    if (acc === "status") {
      return getStatusLabel?.(booking) ?? bookingStatusLabel[booking.status];
    }
    if (acc === "createdAt") {
      return dayjs(resolveBookingCreatedAt(booking)).valueOf();
    }
    if (acc === "bookingAt") {
      return dayjs(resolveBookingArrivalTime(booking)).valueOf();
    }
    return dayjs(resolveBookingArrivalTime(booking)).valueOf();
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
}
