import { type Booking } from "@/lib/types";

export const MANUAL_ASSIGN_MODAL_OPEN_DELAY_MS = 220;
export const MANUAL_ASSIGN_PAGE_MODAL_Z_INDEX = 600;
export const MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX = 700;

export const portalModalOverlayPopoverProps = {
  zIndex: MANUAL_ASSIGN_SELECT_COMBOBOX_Z_INDEX,
  withinPortal: true,
} as const;

export function canEditBookingOrder(booking: Pick<Booking, "status">): boolean {
  return booking.status === "pending" || booking.status === "confirmed";
}

/** Active reservation on a single table — eligible for Đổi bàn (not merge groups). */
export function canChangeBookingTable(
  booking: Pick<Booking, "status" | "tableId" | "mergeGroupId">
): boolean {
  if (booking.mergeGroupId) {
    return false;
  }
  return (
    (booking.status === "confirmed" ||
      booking.status === "seated" ||
      booking.status === "checked_in") &&
    Boolean(booking.tableId)
  );
}

export function bookingLastEditorName(
  booking: Pick<Booking, "lastEditedByUserId">,
  users: { id: string; fullName: string }[]
): string {
  if (!booking.lastEditedByUserId) {
    return "—";
  }
  return users.find((item) => item.id === booking.lastEditedByUserId)?.fullName ?? "Không rõ";
}

/** Mantine NumberInput may emit string while editing. */
export function parseGuestCountFromNumberInput(value: number | string | undefined): number | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const n = Number(String(value).trim().replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}
