"use client";

import { BookingCalendarPanel } from "@/components/booking-calendar-panel";

export default function CalendarPage() {
  return (
    <BookingCalendarPanel
      title="Lịch đặt bàn theo ngày / tuần"
      compactTitle="Lịch đặt bàn"
      showHeader
    />
  );
}
