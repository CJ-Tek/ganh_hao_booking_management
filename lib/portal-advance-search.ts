import dayjs, { type Dayjs } from "dayjs";
import {
  displayCustomerPhone,
  pickPrimaryBookingOnTable,
  stripUnknownGuestTag,
} from "@/lib/booking-meta";
import { bookingStatusLabel, tableStatusLabel } from "@/lib/display";
import { buildFloorMapHref } from "@/lib/floor-map-routes";
import type { AppStateSnapshot, Booking, DiningTable, TableStatus } from "@/lib/types";

export const PORTAL_SEARCH_QUERY_PARAM = "q";

export type PortalAdvanceSearchSection =
  | "floor-map"
  | "bookings"
  | "customers"
  | "tables";

export const portalAdvanceSearchSectionLabel: Record<PortalAdvanceSearchSection, string> = {
  "floor-map": "Sơ đồ",
  bookings: "Đặt bàn",
  customers: "Khách hàng",
  tables: "Quản lý bàn",
};

export type PortalAdvanceSearchResult = {
  id: string;
  section: PortalAdvanceSearchSection;
  title: string;
  subtitle: string;
  haystack: string;
  href: string;
  floorMapTableId?: string;
  floorMapAreaId?: string;
  tableStatus?: TableStatus;
};

export type PortalAdvanceSearchFloorMapContext = {
  selectedDate: Dayjs;
  dayBookings: Booking[];
};

const SECTION_ORDER: PortalAdvanceSearchSection[] = [
  "floor-map",
  "bookings",
  "customers",
  "tables",
];

const MAX_RESULTS = 120;

function branchName(snapshot: AppStateSnapshot, branchId: string): string {
  return snapshot.branches.find((branch) => branch.id === branchId)?.name ?? "";
}

function areaName(snapshot: AppStateSnapshot, areaId: string | null | undefined): string {
  if (!areaId) {
    return "";
  }
  return snapshot.areas.find((area) => area.id === areaId)?.name ?? "";
}

function customerName(snapshot: AppStateSnapshot, customerId: string): string {
  return snapshot.customers.find((customer) => customer.id === customerId)?.fullName ?? "";
}

function customerPhone(snapshot: AppStateSnapshot, customerId: string): string {
  const customer = snapshot.customers.find((item) => item.id === customerId);
  return displayCustomerPhone(customer?.phone);
}

function tableName(snapshot: AppStateSnapshot, tableId: string | null | undefined): string {
  if (!tableId) {
    return "";
  }
  return snapshot.tables.find((table) => table.id === tableId)?.name ?? "";
}

function buildBookingHaystack(snapshot: AppStateSnapshot, booking: Booking): string {
  const noteText = stripUnknownGuestTag(booking.note) ?? "";
  return [
    customerName(snapshot, booking.customerId),
    customerPhone(snapshot, booking.customerId),
    dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
    dayjs(booking.bookingAt).format("DD/MM/YYYY HH:mm"),
    booking.checkedInAt ? dayjs(booking.checkedInAt).format("HH:mm DD/MM/YYYY") : "",
    booking.checkedInAt ? dayjs(booking.checkedInAt).format("DD/MM/YYYY HH:mm") : "",
    "check-in",
    "checkin",
    String(booking.guestCount),
    areaName(snapshot, booking.areaId),
    tableName(snapshot, booking.tableId),
    bookingStatusLabel[booking.status],
    noteText,
    branchName(snapshot, booking.branchId),
  ]
    .join(" ")
    .toLowerCase();
}

function buildFloorMapTableResult(
  snapshot: AppStateSnapshot,
  table: DiningTable,
  floorMapContext: PortalAdvanceSearchFloorMapContext
): PortalAdvanceSearchResult {
  const displayBooking = pickPrimaryBookingOnTable(table.id, floorMapContext.dayBookings);
  const customer = displayBooking
    ? snapshot.customers.find((item) => item.id === displayBooking.customerId)
    : undefined;
  const haystackParts = [
    table.name,
    tableStatusLabel[table.status],
    areaName(snapshot, table.areaId),
    branchName(snapshot, table.branchId),
    customer?.fullName ?? "",
    displayCustomerPhone(customer?.phone),
  ];
  if (displayBooking) {
    haystackParts.push(
      dayjs(displayBooking.bookingAt).format("HH:mm DD/MM/YYYY"),
      dayjs(displayBooking.bookingAt).format("DD/MM/YYYY HH:mm"),
      bookingStatusLabel[displayBooking.status]
    );
  }
  const subtitleParts = [
    areaName(snapshot, table.areaId),
    customer?.fullName ? `Khách: ${customer.fullName}` : null,
  ].filter(Boolean);

  return {
    id: `floor-map:${table.id}`,
    section: "floor-map",
    title: table.name,
    subtitle: subtitleParts.join(" · "),
    haystack: haystackParts.join(" ").toLowerCase(),
    href: buildFloorMapHref(floorMapContext.selectedDate),
    floorMapTableId: table.id,
    floorMapAreaId: table.areaId,
    tableStatus: table.status,
  };
}

export function buildPortalAdvanceSearchResults(input: {
  snapshot: AppStateSnapshot;
  filteredBranchIds: string[];
  sections: PortalAdvanceSearchSection[];
  floorMapContext?: PortalAdvanceSearchFloorMapContext;
}): PortalAdvanceSearchResult[] {
  const { snapshot, filteredBranchIds, sections, floorMapContext } = input;
  const sectionSet = new Set(sections);
  const results: PortalAdvanceSearchResult[] = [];

  if (sectionSet.has("floor-map") && floorMapContext) {
    for (const table of snapshot.tables) {
      if (!filteredBranchIds.includes(table.branchId)) {
        continue;
      }
      results.push(buildFloorMapTableResult(snapshot, table, floorMapContext));
    }
  }

  if (sectionSet.has("bookings")) {
    for (const booking of snapshot.bookings) {
      if (!filteredBranchIds.includes(booking.branchId)) {
        continue;
      }
      const customer = snapshot.customers.find((item) => item.id === booking.customerId);
      const area = areaName(snapshot, booking.areaId);
      const table = tableName(snapshot, booking.tableId);
      results.push({
        id: `bookings:${booking.id}`,
        section: "bookings",
        title: customer?.fullName ?? "Khách",
        subtitle: [
          dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
          area,
          table,
          bookingStatusLabel[booking.status],
        ]
          .filter(Boolean)
          .join(" · "),
        haystack: buildBookingHaystack(snapshot, booking),
        href: `/bookings?focusBooking=${encodeURIComponent(booking.id)}`,
      });
    }
  }

  if (sectionSet.has("customers")) {
    for (const customer of snapshot.customers) {
      const phone = displayCustomerPhone(customer.phone);
      const latestBooking = snapshot.bookings
        .filter(
          (booking) =>
            booking.customerId === customer.id && filteredBranchIds.includes(booking.branchId)
        )
        .sort((left, right) => dayjs(right.bookingAt).valueOf() - dayjs(left.bookingAt).valueOf())[0];
      results.push({
        id: `customers:${customer.id}`,
        section: "customers",
        title: customer.fullName,
        subtitle: [
          phone,
          latestBooking
            ? `Booking gần nhất ${dayjs(latestBooking.bookingAt).format("DD/MM/YYYY HH:mm")}`
            : "Chưa có booking",
        ]
          .filter(Boolean)
          .join(" · "),
        haystack: [customer.fullName, customer.phone ?? "", phone, customer.note ?? ""]
          .join(" ")
          .toLowerCase(),
        href: `/customers?${PORTAL_SEARCH_QUERY_PARAM}=${encodeURIComponent(customer.fullName)}`,
      });
    }
  }

  if (sectionSet.has("tables")) {
    for (const table of snapshot.tables) {
      if (!filteredBranchIds.includes(table.branchId)) {
        continue;
      }
      results.push({
        id: `tables:${table.id}`,
        section: "tables",
        title: table.name,
        subtitle: [branchName(snapshot, table.branchId), areaName(snapshot, table.areaId)]
          .filter(Boolean)
          .join(" · "),
        haystack: [
          table.name,
          tableStatusLabel[table.status],
          areaName(snapshot, table.areaId),
          branchName(snapshot, table.branchId),
        ]
          .join(" ")
          .toLowerCase(),
        href: `/tables?${PORTAL_SEARCH_QUERY_PARAM}=${encodeURIComponent(table.name)}`,
        tableStatus: table.status,
      });
    }
  }

  return results
    .sort((left, right) => {
      const sectionDelta =
        SECTION_ORDER.indexOf(left.section) - SECTION_ORDER.indexOf(right.section);
      if (sectionDelta !== 0) {
        return sectionDelta;
      }
      return left.title.localeCompare(right.title, "vi");
    })
    .slice(0, MAX_RESULTS);
}

export function filterPortalAdvanceSearchResults(
  results: PortalAdvanceSearchResult[],
  query: string
): PortalAdvanceSearchResult[] {
  const keyword = query.trim().toLowerCase();
  if (!keyword) {
    return [];
  }
  return results.filter((result) => result.haystack.includes(keyword));
}
