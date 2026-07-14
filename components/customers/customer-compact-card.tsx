"use client";

import dayjs from "dayjs";
import { Checkbox } from "@mantine/core";
import { BookingSummaryCompactCard } from "@/components/booking-management/booking-summary-compact-card";
import { displayCustomerPhone } from "@/lib/booking-meta";

export type CustomerListRow = {
  id: string;
  fullName: string;
  phone: string | null;
  note?: string | null;
  bookingCount: number;
  latestBooking?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function CustomerCompactCard(props: {
  row: CustomerListRow;
  onClick: () => void;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  selectionDisabled?: boolean;
}) {
  const { row, onClick, selected = false, onSelectedChange, selectionDisabled = false } = props;
  const phone = displayCustomerPhone(row.phone);
  const createdLabel = row.createdAt
    ? `Tạo ${dayjs(row.createdAt).format("DD/MM/YYYY")}`
    : null;
  const updatedLabel = row.updatedAt
    ? `Cập nhật ${dayjs(row.updatedAt).format("DD/MM/YYYY")}`
    : null;

  const latestBookingLabel = row.latestBooking
    ? `Booking gần nhất ${dayjs(row.latestBooking).format("HH:mm")} ${dayjs(row.latestBooking).format("DD/MM/YYYY")}`
    : "Chưa có booking";

  return (
    <BookingSummaryCompactCard
      showTimeColumn={false}
      title={row.fullName}
      titleSuffix={{ bold: phone, normal: "" }}
      badge={{
        label: `${row.bookingCount} booking`,
        color: row.bookingCount > 0 ? "green" : "gray",
      }}
      metaSegments={[{ text: latestBookingLabel, emphasize: false }]}
      metaTrailingSegments={[
        ...(createdLabel ? [{ text: createdLabel, emphasize: false }] : []),
        ...(updatedLabel ? [{ text: updatedLabel, emphasize: false }] : []),
      ]}
      note={row.note?.trim() ? row.note : null}
      onClick={onClick}
      leadingSlot={
        onSelectedChange ? (
          <Checkbox
            checked={selected}
            disabled={selectionDisabled}
            aria-label={`Chọn khách ${row.fullName}`}
            onChange={(event) => onSelectedChange(event.currentTarget.checked)}
            onClick={(event) => event.stopPropagation()}
          />
        ) : undefined
      }
    />
  );
}
