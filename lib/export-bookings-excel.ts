import dayjs from "dayjs";
import ExcelJS from "exceljs";
import {
  displayCustomerPhone,
  formatBookingAreaTable,
  resolveBookingArrivalTime,
  type BookingAreaTableLookup,
} from "@/lib/booking-meta";
import { formatBookingListDateRangeLabel } from "@/lib/booking-list-date-range";
import type { Booking, Customer } from "@/lib/types";

export type ExportBookingsExcelInput = {
  bookings: Booking[];
  customers: Customer[];
  dateRange: { start: string; end: string };
  bookingAreaTableLookup: BookingAreaTableLookup;
};

const EXPORT_HEADERS = [
  "Khu vực/Bàn",
  "Số khách",
  "Giờ đến",
  "Khách",
  "SĐT",
] as const;

const GROUP_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF4" },
};

function formatArrivalTime(value: string): string {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("HH:mm") : "—";
}

function formatHourGroupLabel(arrivalIso: string, includeDate: boolean): string {
  const parsed = dayjs(arrivalIso);
  if (!parsed.isValid()) {
    return "Không rõ";
  }
  const start = parsed.startOf("hour").format("HH:mm");
  const end = parsed.endOf("hour").format("HH:mm");
  const timeRange = `${start} - ${end}`;
  if (!includeDate) {
    return timeRange;
  }
  return `${parsed.format("DD/MM/YYYY")} · ${timeRange}`;
}

function resolveArrivalHourKey(booking: Booking): string {
  const arrival = resolveBookingArrivalTime(booking);
  const parsed = dayjs(arrival);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD HH") : "unknown";
}

function bookingToExportRow(
  booking: Booking,
  customers: Customer[],
  bookingAreaTableLookup: BookingAreaTableLookup
): (string | number)[] {
  const customer = customers.find((item) => item.id === booking.customerId);
  return [
    formatBookingAreaTable(booking, bookingAreaTableLookup),
    booking.guestCount,
    formatArrivalTime(resolveBookingArrivalTime(booking)),
    customer?.fullName ?? "—",
    displayCustomerPhone(customer?.phone),
  ];
}

function sortBookingsForExport(bookings: Booking[]): Booking[] {
  return [...bookings].sort((left, right) => {
    const leftTime = dayjs(resolveBookingArrivalTime(left)).valueOf();
    const rightTime = dayjs(resolveBookingArrivalTime(right)).valueOf();
    const leftValid = Number.isFinite(leftTime);
    const rightValid = Number.isFinite(rightTime);

    if (!leftValid && !rightValid) {
      return 0;
    }
    if (!leftValid) {
      return 1;
    }
    if (!rightValid) {
      return -1;
    }
    return leftTime - rightTime;
  });
}

function autoColumnWidths(
  worksheet: ExcelJS.Worksheet,
  titleRowNumber: number,
  headerRowNumber: number
): void {
  const titleText = String(worksheet.getRow(titleRowNumber).getCell(1).value ?? "");

  EXPORT_HEADERS.forEach((header, index) => {
    const column = worksheet.getColumn(index + 1);
    let maxWidth = header.length;

    if (index === 0 && titleText) {
      maxWidth = Math.max(maxWidth, Math.ceil(titleText.length / EXPORT_HEADERS.length));
    }

    column.eachCell({ includeEmpty: false }, (cell) => {
      if (Number(cell.row) === headerRowNumber) {
        return;
      }
      maxWidth = Math.max(maxWidth, String(cell.value ?? "").length);
    });

    column.width = Math.min(Math.max(maxWidth + 2, 10), 48);
  });
}

function buildWorksheetTitle(dateRange: { start: string; end: string }): string {
  const rangeLabel = formatBookingListDateRangeLabel(dateRange.start, dateRange.end);
  return rangeLabel ? `Danh sách booking · ${rangeLabel}` : "Danh sách booking";
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
  const { bookings, customers, dateRange, bookingAreaTableLookup } = input;
  const sortedBookings = sortBookingsForExport(bookings);
  const isDateRange = dateRange.start !== dateRange.end;

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Danh sách booking", {
    views: [{ state: "frozen", ySplit: 2 }],
    properties: {
      outlineProperties: {
        summaryBelow: false,
        summaryRight: false,
      },
    },
  });

  const titleRow = worksheet.addRow([buildWorksheetTitle(dateRange)]);
  worksheet.mergeCells(1, 1, 1, EXPORT_HEADERS.length);
  titleRow.font = { bold: true, size: 12 };
  titleRow.alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 24;

  const headerRow = worksheet.addRow([...EXPORT_HEADERS]);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };

  let currentHourKey: string | null = null;

  for (const booking of sortedBookings) {
    const hourKey = resolveArrivalHourKey(booking);

    if (hourKey !== currentHourKey) {
      currentHourKey = hourKey;
      const arrival = resolveBookingArrivalTime(booking);
      const groupLabel = formatHourGroupLabel(arrival, isDateRange);
      const groupRow = worksheet.addRow(["", "", groupLabel, "", ""]);
      groupRow.font = { bold: true };
      groupRow.fill = GROUP_HEADER_FILL;
      groupRow.alignment = { vertical: "middle" };
    }

    const dataRow = worksheet.addRow(
      bookingToExportRow(booking, customers, bookingAreaTableLookup)
    );
    dataRow.outlineLevel = 1;
    dataRow.alignment = { vertical: "middle" };
  }

  autoColumnWidths(worksheet, titleRow.number, headerRow.number);

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `danh-sach-booking_${dateRange.start}_${dateRange.end}.xlsx`;
  downloadWorkbook(buffer, filename);
}
