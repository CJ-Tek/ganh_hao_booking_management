import dayjs from "dayjs";
import ExcelJS from "exceljs";
import {
  displayCustomerPhone,
  formatBookingAreaTable,
  isBookingTableAssigned,
  resolveBookingArrivalTime,
  resolveBookingLeadingColumn,
  type BookingAreaTableLookup,
} from "@/lib/booking-meta";
import { formatBookingListDateRangeLabel, isBookingInDateRange } from "@/lib/booking-list-date-range";
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

const COLUMN_COUNT = EXPORT_HEADERS.length;

const SECTION_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD5E0EA" },
};

const GROUP_HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8EEF4" },
};

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF4F6F8" },
};

const PRINT_BORDER_COLOR = { argb: "FFD0D7DE" } as const;

const FONT_SIZE = {
  title: 11,
  header: 10,
  body: 9,
} as const;

/** Approx. printable width (character units) for portrait A4/A5 with margins. */
const PRINTABLE_PAGE_WIDTH_CHARS = 78;

const COLUMN_MIN_WIDTH = 6;

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

function resolveBookingAreaId(
  booking: Pick<Booking, "areaId" | "mergeGroupId">,
  bookingAreaTableLookup: BookingAreaTableLookup
): string | null {
  if (booking.areaId) {
    return booking.areaId;
  }
  if (booking.mergeGroupId) {
    const group = bookingAreaTableLookup.mergeGroups.find(
      (item) => item.id === booking.mergeGroupId
    );
    return group?.areaId ?? null;
  }
  return null;
}

function resolveBookingAreaName(
  booking: Pick<Booking, "areaId" | "mergeGroupId">,
  bookingAreaTableLookup: BookingAreaTableLookup
): string {
  const areaId = resolveBookingAreaId(booking, bookingAreaTableLookup);
  if (!areaId) {
    return "Chưa gán khu vực";
  }
  return bookingAreaTableLookup.areas.find((item) => item.id === areaId)?.name ?? "Không rõ khu vực";
}

function resolveBookingAreaKey(
  booking: Pick<Booking, "areaId" | "mergeGroupId">,
  bookingAreaTableLookup: BookingAreaTableLookup
): string {
  return resolveBookingAreaId(booking, bookingAreaTableLookup) ?? "unassigned";
}

function formatBookingTableForSectionedExport(
  booking: Pick<Booking, "areaId" | "tableId" | "mergeGroupId">,
  bookingAreaTableLookup: BookingAreaTableLookup
): string {
  if (!isBookingTableAssigned(booking)) {
    return formatBookingAreaTable(booking, bookingAreaTableLookup);
  }
  return resolveBookingLeadingColumn(booking, bookingAreaTableLookup).primary;
}

function bookingToExportRow(
  booking: Booking,
  customers: Customer[],
  bookingAreaTableLookup: BookingAreaTableLookup
): (string | number)[] {
  const customer = customers.find((item) => item.id === booking.customerId);
  return [
    formatBookingTableForSectionedExport(booking, bookingAreaTableLookup),
    booking.guestCount,
    formatArrivalTime(resolveBookingArrivalTime(booking)),
    customer?.fullName ?? "—",
    displayCustomerPhone(customer?.phone),
  ];
}

function sortBookingsForExport(
  bookings: Booking[],
  bookingAreaTableLookup: BookingAreaTableLookup
): Booking[] {
  return [...bookings].sort((left, right) => {
    const areaCompare = resolveBookingAreaName(left, bookingAreaTableLookup).localeCompare(
      resolveBookingAreaName(right, bookingAreaTableLookup),
      "vi"
    );
    if (areaCompare !== 0) {
      return areaCompare;
    }

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

function applyCellBorder(cell: ExcelJS.Cell): void {
  const border = { style: "thin" as const, color: PRINT_BORDER_COLOR };
  cell.border = {
    top: border,
    left: border,
    bottom: border,
    right: border,
  };
}

function applyRowBorders(row: ExcelJS.Row, fromColumn = 1, toColumn = COLUMN_COUNT): void {
  for (let column = fromColumn; column <= toColumn; column += 1) {
    applyCellBorder(row.getCell(column));
  }
}

function measureCellText(value: ExcelJS.CellValue): number {
  if (value == null) {
    return 0;
  }
  if (typeof value === "number") {
    return String(value).length;
  }
  if (typeof value === "string") {
    return value.length;
  }
  if (value instanceof Date) {
    return dayjs(value).format("DD/MM/YYYY HH:mm").length;
  }
  return String(value).length;
}

function autoColumnWidths(worksheet: ExcelJS.Worksheet, headerRowNumber: number): void {
  const naturalWidths = EXPORT_HEADERS.map((header, index) => {
    const columnIndex = index + 1;
    let maxWidth = header.length;

    worksheet.getColumn(columnIndex).eachCell({ includeEmpty: false }, (cell) => {
      if (Number(cell.row) === headerRowNumber) {
        return;
      }
      maxWidth = Math.max(maxWidth, measureCellText(cell.value));
    });

    return Math.max(maxWidth + 1, COLUMN_MIN_WIDTH);
  });

  const totalNaturalWidth = naturalWidths.reduce((sum, width) => sum + width, 0);
  const scale =
    totalNaturalWidth > PRINTABLE_PAGE_WIDTH_CHARS
      ? PRINTABLE_PAGE_WIDTH_CHARS / totalNaturalWidth
      : 1;

  naturalWidths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = Math.max(
      COLUMN_MIN_WIDTH,
      Math.round(width * scale * 10) / 10
    );
  });
}

const EXCEL_SHEET_NAME_MAX_LENGTH = 31;

function createWorksheetOptions() {
  return {
    views: [{ state: "frozen" as const, ySplit: 2 }],
    properties: {
      outlineProperties: {
        summaryBelow: false,
        summaryRight: false,
      },
    },
  };
}

function listDaysInRange(startDate: string, endDate: string): string[] {
  const rangeStart = dayjs(startDate, "YYYY-MM-DD", true).startOf("day");
  const rangeEnd = dayjs(endDate, "YYYY-MM-DD", true).startOf("day");
  if (!rangeStart.isValid() || !rangeEnd.isValid() || rangeEnd.isBefore(rangeStart)) {
    return [startDate];
  }

  const days: string[] = [];
  let cursor = rangeStart;
  while (!cursor.isAfter(rangeEnd)) {
    days.push(cursor.format("YYYY-MM-DD"));
    cursor = cursor.add(1, "day");
  }
  return days;
}

function buildWorksheetName(day: string, usedNames: Set<string>): string {
  const parsed = dayjs(day, "YYYY-MM-DD", true);
  const base = parsed.isValid() ? parsed.format("DD-MM-YYYY") : day;
  let candidate = base.slice(0, EXCEL_SHEET_NAME_MAX_LENGTH);
  let suffix = 2;

  while (usedNames.has(candidate)) {
    const stem = base.slice(0, EXCEL_SHEET_NAME_MAX_LENGTH - 2);
    candidate = `${stem}_${suffix}`;
    suffix += 1;
  }

  usedNames.add(candidate);
  return candidate;
}

function buildWorksheetTitle(dateRange: { start: string; end: string }): string {
  const rangeLabel = formatBookingListDateRangeLabel(dateRange.start, dateRange.end);
  return rangeLabel ? `Danh sách booking · ${rangeLabel}` : "Danh sách booking";
}

function applyPrintSetup(worksheet: ExcelJS.Worksheet, headerRowNumber: number): void {
  worksheet.pageSetup = {
    orientation: "portrait",
    fitToWidth: 1,
    margins: {
      left: 0.45,
      right: 0.45,
      top: 0.55,
      bottom: 0.55,
      header: 0.25,
      footer: 0.25,
    },
    printTitlesRow: `1:${headerRowNumber}`,
    horizontalCentered: true,
  };
  worksheet.headerFooter = {
    oddFooter: "&C&8Trang &P / &N",
  };
}

function populateBookingWorksheet(
  worksheet: ExcelJS.Worksheet,
  input: {
    bookings: Booking[];
    customers: Customer[];
    dateRange: { start: string; end: string };
    bookingAreaTableLookup: BookingAreaTableLookup;
  }
): void {
  const { bookings, customers, dateRange, bookingAreaTableLookup } = input;
  const sortedBookings = sortBookingsForExport(bookings, bookingAreaTableLookup);
  const isDateRange = dateRange.start !== dateRange.end;

  const titleRow = worksheet.addRow([buildWorksheetTitle(dateRange)]);
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, COLUMN_COUNT);
  titleRow.font = { bold: true, size: FONT_SIZE.title };
  titleRow.alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 22;

  const headerRow = worksheet.addRow([...EXPORT_HEADERS]);
  headerRow.font = { bold: true, size: FONT_SIZE.header };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.fill = HEADER_FILL;
  headerRow.height = 20;
  applyRowBorders(headerRow);

  let currentSectionKey: string | null = null;
  let currentHourKey: string | null = null;

  for (const booking of sortedBookings) {
    const sectionKey = resolveBookingAreaKey(booking, bookingAreaTableLookup);
    const hourKey = resolveArrivalHourKey(booking);

    if (sectionKey !== currentSectionKey) {
      currentSectionKey = sectionKey;
      currentHourKey = null;

      const sectionLabel = resolveBookingAreaName(booking, bookingAreaTableLookup);
      const sectionRow = worksheet.addRow([sectionLabel]);
      worksheet.mergeCells(sectionRow.number, 1, sectionRow.number, COLUMN_COUNT);
      sectionRow.font = { bold: true, size: FONT_SIZE.header };
      sectionRow.fill = SECTION_HEADER_FILL;
      sectionRow.alignment = { horizontal: "left", vertical: "middle" };
      sectionRow.height = 20;
    }

    if (hourKey !== currentHourKey) {
      currentHourKey = hourKey;
      const arrival = resolveBookingArrivalTime(booking);
      const groupLabel = formatHourGroupLabel(arrival, isDateRange);
      const hourRow = worksheet.addRow(["", "", groupLabel, "", ""]);
      hourRow.font = { bold: true, size: FONT_SIZE.body };
      hourRow.fill = GROUP_HEADER_FILL;
      hourRow.alignment = { vertical: "middle" };
      applyRowBorders(hourRow);
    }

    const dataRow = worksheet.addRow(
      bookingToExportRow(booking, customers, bookingAreaTableLookup)
    );
    dataRow.outlineLevel = 1;
    dataRow.font = { size: FONT_SIZE.body };
    dataRow.alignment = { vertical: "middle", wrapText: true };
    applyRowBorders(dataRow);
  }

  if (sortedBookings.length > 0) {
    worksheet.properties.outlineLevelRow = 1;
  }

  autoColumnWidths(worksheet, headerRow.number);
  applyPrintSetup(worksheet, headerRow.number);
}

function toDownloadBytes(
  buffer: ArrayBuffer | Uint8Array | { buffer: ArrayBufferLike; byteOffset?: number; byteLength?: number }
): BlobPart {
  if (buffer instanceof Uint8Array) {
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  }
  if (buffer instanceof ArrayBuffer) {
    return buffer;
  }
  return buffer.buffer.slice(
    buffer.byteOffset ?? 0,
    (buffer.byteOffset ?? 0) + (buffer.byteLength ?? buffer.buffer.byteLength)
  ) as ArrayBuffer;
}

function downloadWorkbook(
  buffer: ArrayBuffer | Uint8Array | { buffer: ArrayBufferLike; byteOffset?: number; byteLength?: number },
  filename: string
): void {
  const blob = new Blob([toDownloadBytes(buffer)], {
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

  const workbook = new ExcelJS.Workbook();
  const daysInRange = listDaysInRange(dateRange.start, dateRange.end);
  const isMultiDay = daysInRange.length > 1;
  const usedSheetNames = new Set<string>();

  for (const day of daysInRange) {
    const sheetBookings = isMultiDay
      ? bookings.filter((booking) => isBookingInDateRange(booking, day, day))
      : bookings;
    const sheetDateRange = isMultiDay ? { start: day, end: day } : dateRange;
    const sheetName = isMultiDay
      ? buildWorksheetName(day, usedSheetNames)
      : "Danh sách booking";

    const worksheet = workbook.addWorksheet(sheetName, createWorksheetOptions());
    populateBookingWorksheet(worksheet, {
      bookings: sheetBookings,
      customers,
      dateRange: sheetDateRange,
      bookingAreaTableLookup,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `danh-sach-booking_${dateRange.start}_${dateRange.end}.xlsx`;
  downloadWorkbook(buffer, filename);
}
