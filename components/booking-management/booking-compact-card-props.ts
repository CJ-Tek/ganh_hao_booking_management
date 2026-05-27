import dayjs from "dayjs";
import type { BookingSummaryMetaSegment } from "@/components/booking-management/booking-summary-compact-card";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import {
  formatBookingAreaTable,
  formatTodayBookingAreaTable,
  getReceptionBookingStatus,
  isGuestCountSpecified,
  stripUnknownGuestTag,
  type BookingAreaTableLookup,
  type ReceptionThresholdSettings,
} from "@/lib/booking-meta";
import { type Booking } from "@/lib/types";

export type BookingsListViewVariant = "today" | "list";

export function getBookingCompactCardProps(props: {
  booking: Booking;
  variant: BookingsListViewVariant;
  customerName: string;
  creatorName: string;
  bookingAreaTableLookup: BookingAreaTableLookup;
  receptionThresholds: Partial<ReceptionThresholdSettings>;
  getGuestTypeLabel?: (booking: Booking) => string;
  lastEditorName?: string;
}) {
  const {
    booking,
    variant,
    customerName,
    creatorName,
    bookingAreaTableLookup,
    receptionThresholds,
    getGuestTypeLabel,
    lastEditorName,
  } = props;

  const titleSuffix = isGuestCountSpecified(booking)
    ? { bold: String(booking.guestCount), normal: " khách" }
    : { bold: "", normal: "Chưa rõ số khách" };

  const assigneeLabel = `Người nhận: ${creatorName}`;

  const metaSegments: BookingSummaryMetaSegment[] =
    variant === "today"
      ? [
          { text: getGuestTypeLabel?.(booking) ?? "Khách thường", emphasize: true },
          {
            text: formatTodayBookingAreaTable(booking, bookingAreaTableLookup),
            emphasize: true,
          },
        ]
      : [
          { text: dayjs(booking.bookingAt).format("DD/MM/YYYY") },
          {
            text: formatBookingAreaTable(booking, bookingAreaTableLookup, {
              tableNamePrefix: true,
            }),
            emphasize: true,
          },
        ];

  if (variant === "list" && booking.checkedInAt) {
    metaSegments.splice(1, 0, {
      text: `Check-in ${dayjs(booking.checkedInAt).format("HH:mm")}`,
      emphasize: true,
    });
  }

  if (variant === "list" && booking.lastEditedAt && lastEditorName) {
    metaSegments.push({
      text: `Sửa ${lastEditorName} ${dayjs(booking.lastEditedAt).format("HH:mm DD/MM")}`,
    });
  }

  const badge =
    variant === "today"
      ? (() => {
          const receptionStatus = getReceptionBookingStatus(booking, receptionThresholds);
          return { label: receptionStatus.label, color: receptionStatus.color };
        })()
      : {
          label: bookingStatusLabel[booking.status],
          color: bookingStatusColor[booking.status],
        };

  return {
    timeLabel: dayjs(booking.bookingAt).format("HH:mm"),
    title: customerName,
    titleSuffix,
    assigneeLabel,
    badge,
    metaSegments,
    note: stripUnknownGuestTag(booking.note),
  };
}

/** Guest-type filter options derived from bookings (today tab). */
export function buildGuestTypeFilterOptions(
  bookings: Booking[],
  getLabel: (booking: Booking) => string
) {
  const labels = new Set(bookings.map((booking) => getLabel(booking)));
  return [...labels]
    .sort((a, b) => a.localeCompare(b, "vi"))
    .map((label) => ({ value: label, label }));
}
