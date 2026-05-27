"use client";

import {
  BookingSummaryCompactCard,
  type BookingSummaryCompactCardProps,
} from "@/components/booking-management/booking-summary-compact-card";
import {
  getBookingCompactCardProps,
  type BookingsListViewVariant,
} from "@/components/booking-management/booking-compact-card-props";
import type {
  BookingAreaTableLookup,
  ReceptionThresholdSettings,
} from "@/lib/booking-meta";
import { type Booking } from "@/lib/types";
import type { CSSProperties, ReactNode } from "react";

type BookingCompactCardOptions = {
  booking: Booking;
  variant: BookingsListViewVariant;
  customerName: string;
  creatorName: string;
  bookingAreaTableLookup: BookingAreaTableLookup;
  receptionThresholds?: Partial<ReceptionThresholdSettings>;
  getGuestTypeLabel?: (booking: Booking) => string;
  lastEditorName?: string;
  customerPhone?: string | null;
};

export function BookingCompactCard(
  props: BookingCompactCardOptions & {
    onClick?: () => void;
    className?: string;
    style?: CSSProperties;
    leadingSlot?: ReactNode;
  } & Pick<BookingSummaryCompactCardProps, "showTimeColumn">
) {
  const {
    booking,
    variant,
    customerName,
    creatorName,
    bookingAreaTableLookup,
    receptionThresholds = {},
    getGuestTypeLabel,
    lastEditorName,
    customerPhone,
    onClick,
    className,
    style,
    leadingSlot,
    showTimeColumn,
  } = props;

  return (
    <BookingSummaryCompactCard
      {...getBookingCompactCardProps({
        booking,
        variant,
        customerName,
        creatorName,
        bookingAreaTableLookup,
        receptionThresholds,
        getGuestTypeLabel,
        lastEditorName,
        customerPhone,
      })}
      showTimeColumn={showTimeColumn}
      leadingSlot={leadingSlot}
      onClick={onClick}
      className={className}
      style={style}
    />
  );
}
