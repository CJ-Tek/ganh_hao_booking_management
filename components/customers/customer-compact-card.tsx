"use client";

import dayjs from "dayjs";
import { BookingSummaryCompactCard } from "@/components/booking-management/booking-summary-compact-card";
import { displayCustomerPhone } from "@/lib/booking-meta";

export type CustomerListRow = {
  id: string;
  fullName: string;
  phone: string | null;
  note?: string | null;
  bookingCount: number;
  latestBooking?: string;
};

export function CustomerCompactCard(props: {
  row: CustomerListRow;
  onClick: () => void;
}) {
  const { row, onClick } = props;
  const phone = displayCustomerPhone(row.phone);

  return (
    <BookingSummaryCompactCard
      showTimeColumn={false}
      title={row.fullName}
      titleSuffix={{ bold: phone, normal: "" }}
      badge={{
        label: `${row.bookingCount} booking`,
        color: row.bookingCount > 0 ? "green" : "gray",
      }}
      metaSegments={
        row.latestBooking
          ? [
              { text: "Booking gần nhất", emphasize: false },
              { text: dayjs(row.latestBooking).format("HH:mm"), emphasize: false },
              { text: dayjs(row.latestBooking).format("DD/MM/YYYY"), emphasize: false },
            ]
          : [{ text: "Chưa có booking", emphasize: false }]
      }
      note={row.note?.trim() ? row.note : null}
      onClick={onClick}
    />
  );
}
