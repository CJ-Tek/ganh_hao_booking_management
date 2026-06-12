import { BookingStatus, TableStatus } from "./types";

export const tableStatusLabel: Record<TableStatus, string> = {
  available: "Trống",
  hold: "Giữ chỗ",
  occupied: "Đã ngồi",
  locked: "Khóa",
};

export const tableStatusColor: Record<TableStatus, string> = {
  available: "teal",
  hold: "yellow",
  occupied: "grape",
  locked: "gray",
};

export const bookingStatusLabel: Record<BookingStatus, string> = {
  pending: "Chờ xếp bàn",
  confirmed: "Đã xác nhận",
  cancelled: "Đã hủy",
  seated: "Đã vào bàn",
  no_show: "Không đến",
  checked_in: "Đã check-in",
  completed: "Hoàn thành",
};

export const bookingStatusColor: Record<BookingStatus, string> = {
  pending: "orange",
  confirmed: "cyan",
  cancelled: "red",
  seated: "green",
  no_show: "gray",
  checked_in: "green",
  completed: "teal",
};

/** Default selected status chip on booking list / calendar / day-list filters. */
export const defaultBookingStatusFilter: BookingStatus = "pending";

export const defaultBookingStatusFilters: BookingStatus[] = [defaultBookingStatusFilter];

export function bookingMatchesStatusFilters(
  status: BookingStatus,
  filters: readonly BookingStatus[]
): boolean {
  return filters.includes(status);
}

export function toggleBookingStatusFilter(
  current: readonly BookingStatus[],
  status: BookingStatus
): BookingStatus[] {
  if (current.includes(status)) {
    if (current.length <= 1) {
      return [...current];
    }
    return current.filter((item) => item !== status);
  }
  return [...current, status];
}

export function normalizeBookingStatusFilters(
  filters: readonly BookingStatus[],
  fallback: BookingStatus = defaultBookingStatusFilter
): BookingStatus[] {
  return filters.length > 0 ? [...filters] : [fallback];
}

/** Statuses applied while the booking list search box has a query. */
export const bookingSearchStatusFilters: BookingStatus[] = ["pending", "confirmed", "seated"];

/** Confirmed schedule table on floor map (subset of pipeline). */
export const bookingScheduleStatusFilterStatuses = ["confirmed", "seated"] as const satisfies readonly BookingStatus[];

export const defaultScheduleStatusFilters: BookingStatus[] = [
  ...bookingScheduleStatusFilterStatuses,
];

export const bookingScheduleSearchStatusFilters: BookingStatus[] = [
  ...bookingScheduleStatusFilterStatuses,
];

export function bookingStatusFiltersEqual(
  a: readonly BookingStatus[],
  b: readonly BookingStatus[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setB = new Set(b);
  return a.every((status) => setB.has(status));
}

export const bookingPipelineStatusFilterStatuses = [
  "pending",
  "confirmed",
  "seated",
  "no_show",
  "cancelled",
] as const satisfies readonly BookingStatus[];

/** Active pipeline statuses (excludes completed). */
export const defaultActivePipelineStatusFilters: BookingStatus[] = [
  ...bookingPipelineStatusFilterStatuses,
];

/** Danh sách booking status chips (includes Hoàn thành). */
export const bookingListStatusFilterStatuses = [
  ...bookingPipelineStatusFilterStatuses,
  "completed",
] as const satisfies readonly BookingStatus[];

/** Statuses for calendar and day-list filters. */
export const bookingCalendarStatusFilterStatuses =
  bookingListStatusFilterStatuses satisfies readonly BookingStatus[];
