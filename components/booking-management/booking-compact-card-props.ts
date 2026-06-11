import dayjs from "dayjs";
import type { BookingSummaryMetaSegment } from "@/components/booking-management/booking-summary-compact-card";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import {
  formatBookingAreaTable,
  formatTodayBookingAreaTable,
  getReceptionBookingStatus,
  isGuestCountSpecified,
  resolveBookingArrivalTime,
  resolveBookingCreatedAt,
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
  /** Prepended to meta row when set (e.g. customer phone on assign tables). */
  customerPhone?: string | null;
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
    customerPhone,
  } = props;

  const titleSuffix = isGuestCountSpecified(booking)
    ? { bold: String(booking.guestCount), normal: " khách" }
    : { bold: "", normal: "Chưa rõ số khách" };

  const createdBy = {
    name: creatorName,
    time: dayjs(resolveBookingCreatedAt(booking)).format("HH:mm DD/MM/YYYY"),
  };

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
          { text: dayjs(resolveBookingArrivalTime(booking)).format("DD/MM/YYYY") },
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

  if (customerPhone) {
    metaSegments.unshift({ text: customerPhone, emphasize: false });
  }

  const updatedLabel =
    variant === "list" && booking.lastEditedAt && lastEditorName
      ? {
          name: lastEditorName,
          time: dayjs(booking.lastEditedAt).format("HH:mm DD/MM"),
        }
      : null;

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
    timeLabel: dayjs(resolveBookingArrivalTime(booking)).format("HH:mm"),
    title: customerName,
    titleSuffix,
    createdBy,
    updatedLabel,
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
