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
  confirmed: "Đã xác nhận",
  cancelled: "Đã hủy",
  checked_in: "Đã check-in",
};

export const bookingStatusColor: Record<BookingStatus, string> = {
  confirmed: "cyan",
  cancelled: "red",
  checked_in: "green",
};
