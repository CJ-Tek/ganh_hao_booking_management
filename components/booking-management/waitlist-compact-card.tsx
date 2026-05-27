"use client";

import dayjs from "dayjs";
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
  onClick?: () => void;
}) {
  const { entry, customerName, areaLabel, tableLabel, showLocation, onClick } = props;

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
    <BookingSummaryCompactCard
      timeLabel={`#${entry.position}`}
      title={customerName}
      badge={{
        label: waitlistStatusLabel[entry.status],
        color: waitlistStatusColor[entry.status],
      }}
      metaSegments={metaSegments}
      onClick={onClick}
    />
  );
}
