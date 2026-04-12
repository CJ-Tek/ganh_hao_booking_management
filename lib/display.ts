import { BookingStatus, TableStatus } from "./types";

export const tableStatusLabel: Record<TableStatus, string> = {
  available: "Trống",
  hold: "Đặt trước",
  arriving: "Đang dẫn khách vào",
  occupied: "Có khách",
};

export const tableStatusColor: Record<TableStatus, string> = {
  available: "teal",
  hold: "yellow",
  arriving: "blue",
  occupied: "grape",
};

export const bookingStatusLabel: Record<BookingStatus, string> = {
  confirmed: "Đã xác nhận",
  cancelled: "Đã hủy",
  checked_in: "Đã check-in",
};

export const bookingStatusColor: Record<BookingStatus, string> = {
  confirmed: "cyan",
  cancelled: "red",
  checked_in: "green",
};
