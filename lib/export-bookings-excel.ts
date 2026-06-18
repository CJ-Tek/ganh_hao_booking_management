import dayjs from "dayjs";
import ExcelJS from "exceljs";
import {
  displayCustomerPhone,
  formatBookingAreaTable,
  resolveBookingArrivalTime,
  resolveBookingCreatedAt,
  stripUnknownGuestTag,
  type BookingAreaTableLookup,
} from "@/lib/booking-meta";
import { bookingStatusLabel } from "@/lib/display";
import type { Booking, Customer, AppUser } from "@/lib/types";

export type ExportBookingsExcelInput = {
  bookings: Booking[];
  customers: Customer[];
  users: AppUser[];
  dateRange: { start: string; end: string };
  bookingAreaTableLookup: BookingAreaTableLookup;
};

const EXPORT_HEADERS = [
  "Khách",
  "SĐT",
  "Ghi chú",
  "Giờ đến",
  "Giờ check-in",
  "Khu vực / Bàn",
  "Số khách",
  "Người tạo",
  "Tạo lúc",
  "Người sửa",
  "Lúc sửa",
  "Trạng thái",
] as const;

function resolveUserName(userId: string | null | undefined, users: AppUser[]): string {
  if (!userId) {
    return "—";
  }
  return users.find((item) => item.id === userId)?.fullName ?? "Không rõ";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("HH:mm DD/MM/YYYY") : "—";
}

function bookingToExportRow(
  booking: Booking,
  customers: Customer[],
  users: AppUser[],
  bookingAreaTableLookup: BookingAreaTableLookup
): (string | number)[] {
  const customer = customers.find((item) => item.id === booking.customerId);
  return [
    customer?.fullName ?? "—",
    displayCustomerPhone(customer?.phone),
    stripUnknownGuestTag(booking.note) ?? "—",
    formatDateTime(resolveBookingArrivalTime(booking)),
    formatDateTime(booking.checkedInAt),
    formatBookingAreaTable(booking, bookingAreaTableLookup),
    booking.guestCount,
    resolveUserName(booking.createdByUserId, users),
    formatDateTime(resolveBookingCreatedAt(booking)),
    resolveUserName(booking.lastEditedByUserId, users),
    formatDateTime(booking.lastEditedAt),
    bookingStatusLabel[booking.status],
  ];
}

function columnLetter(index: number): string {
  let letter = "";
  let n = index;
  while (n > 0) {
    const remainder = (n - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function autoColumnWidths(rows: (string | number)[][]): number[] {
  const columnCount = EXPORT_HEADERS.length;
  const widths = EXPORT_HEADERS.map((header) => header.length);

  for (const row of rows) {
    for (let index = 0; index < columnCount; index += 1) {
      const cell = String(row[index] ?? "");
      widths[index] = Math.max(widths[index] ?? 0, cell.length);
    }
  }

  return widths.map((width) => Math.min(Math.max(width + 2, 10), 48));
}

function downloadWorkbook(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportBookingsToExcel(input: ExportBookingsExcelInput): Promise<void> {
  const { bookings, customers, users, dateRange, bookingAreaTableLookup } = input;
  const rows = bookings.map((booking) =>
    bookingToExportRow(booking, customers, users, bookingAreaTableLookup)
  );

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Danh sách booking", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const lastColumn = columnLetter(EXPORT_HEADERS.length);
  const lastRow = rows.length + 1;

  worksheet.addTable({
    name: "DanhSachBooking",
    ref: `A1:${lastColumn}${lastRow}`,
    headerRow: true,
    style: {
      theme: "TableStyleMedium2",
      showRowStripes: true,
    },
    columns: EXPORT_HEADERS.map((header) => ({
      name: header,
      filterButton: true,
    })),
    rows,
  });

  autoColumnWidths(rows).forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `danh-sach-booking_${dateRange.start}_${dateRange.end}.xlsx`;
  downloadWorkbook(buffer, filename);
}
