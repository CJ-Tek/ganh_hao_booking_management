import dayjs from "dayjs";
import type { Booking } from "@/lib/types";

export type BookingListDateRange = {
  startDate: string;
  endDate: string;
};

export function getDefaultBookingListDateRange(): BookingListDateRange {
  const today = dayjs().format("YYYY-MM-DD");
  return { startDate: today, endDate: today };
}

export function isBookingInDateRange(
  booking: Pick<Booking, "bookingAt">,
  startDate: string,
  endDate: string
): boolean {
  const bookingTime = dayjs(booking.bookingAt);
  if (!bookingTime.isValid()) {
    return false;
  }
  const rangeStart = dayjs(startDate, "YYYY-MM-DD", true).startOf("day");
  const rangeEnd = dayjs(endDate, "YYYY-MM-DD", true).endOf("day");
  if (!rangeStart.isValid() || !rangeEnd.isValid()) {
    return false;
  }
  return (
    !bookingTime.isBefore(rangeStart) &&
    !bookingTime.isAfter(rangeEnd)
  );
}

export function formatBookingListDateRangeLabel(startDate: string, endDate: string): string {
  const start = dayjs(startDate, "YYYY-MM-DD", true);
  const end = dayjs(endDate, "YYYY-MM-DD", true);
  if (!start.isValid() || !end.isValid()) {
    return "";
  }
  if (startDate === endDate) {
    return start.format("DD/MM/YYYY");
  }
  if (start.year() === end.year()) {
    return `${start.format("DD/MM")} – ${end.format("DD/MM/YYYY")}`;
  }
  return `${start.format("DD/MM/YYYY")} – ${end.format("DD/MM/YYYY")}`;
}
