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
