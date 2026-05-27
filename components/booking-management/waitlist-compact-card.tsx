"use client";

import dayjs from "dayjs";
import { Button, Stack } from "@mantine/core";
import { BookingSummaryCompactCard } from "@/components/booking-management/booking-summary-compact-card";
import {
  waitlistStatusColor,
  waitlistStatusLabel,
} from "@/components/booking-management/waitlist-status-filter-chips";
import { type BookingWaitlistEntry } from "@/lib/types";

export function WaitlistCompactCard(props: {
  entry: BookingWaitlistEntry;
  customerName: string;
  areaLabel: string;
  tableLabel: string;
  showLocation: boolean;
  isEmployee: boolean;
  confirmLoading: boolean;
  onConfirmOffer: () => void;
}) {
  const {
    entry,
    customerName,
    areaLabel,
    tableLabel,
    showLocation,
    isEmployee,
    confirmLoading,
    onConfirmOffer,
  } = props;

  const metaSegments = [
    {
      text: `${dayjs(entry.desiredStartTime).format("HH:mm")} – ${dayjs(entry.desiredEndTime).format("HH:mm")}`,
      emphasize: true,
    },
    ...(showLocation ? [{ text: `${areaLabel} · ${tableLabel}`, emphasize: true }] : []),
    {
      text: `${entry.partySize} khách`,
      emphasize: true,
    },
  ];

  if (entry.status === "offered" && entry.offerExpiresAt) {
    metaSegments.push({
      text: `Hết hạn ${dayjs(entry.offerExpiresAt).format("HH:mm DD/MM")}`,
      emphasize: false,
    });
  }

  return (
    <Stack gap={6}>
      <BookingSummaryCompactCard
        timeLabel={`#${entry.position}`}
        title={customerName}
        badge={{
          label: waitlistStatusLabel[entry.status],
          color: waitlistStatusColor[entry.status],
        }}
        metaSegments={metaSegments}
      />
      {!isEmployee && entry.status === "offered" ? (
        <Button
          size="compact-sm"
          variant="filled"
          color="green"
          loading={confirmLoading}
          onClick={onConfirmOffer}
        >
          Xác nhận
        </Button>
      ) : null}
    </Stack>
  );
}
