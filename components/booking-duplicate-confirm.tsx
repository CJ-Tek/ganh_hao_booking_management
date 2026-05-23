"use client";

import { Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import dayjs from "dayjs";
import { type BookingDuplicateInfo } from "@/lib/booking-duplicate";

export function confirmDuplicateBookingSecond(
  duplicates: BookingDuplicateInfo[],
  onConfirmSecondBooking: () => void,
  onViewBooking?: (bookingId: string) => void
) {
  const first = duplicates[0];
  if (!first) {
    return;
  }
  const at = dayjs(first.bookingAt);
  modals.openConfirmModal({
    title: "Phát hiện booking trùng theo SĐT",
    children: (
      <Stack gap={6}>
        <Text size="sm">
          Số điện thoại này đã có booking lúc <strong>{at.format("HH:mm DD/MM/YYYY")}</strong> -{" "}
          <strong>{first.guestCount}</strong> khách - người nhận:{" "}
          <strong>{first.receiverFullName}</strong>.
        </Text>
        <Stack gap={4}>
          {duplicates.slice(0, 5).map((duplicate) => (
            <Text
              key={duplicate.bookingId}
              size="xs"
              c={onViewBooking ? "blue" : "dimmed"}
              style={onViewBooking ? { cursor: "pointer" } : undefined}
              onClick={() => onViewBooking?.(duplicate.bookingId)}
            >
              {dayjs(duplicate.bookingAt).format("HH:mm DD/MM/YYYY")} · {duplicate.guestCount} khách
              {duplicate.customerName ? ` · ${duplicate.customerName}` : ""}
              {duplicate.tableLabel ? ` · ${duplicate.tableLabel}` : ""}
            </Text>
          ))}
          {duplicates.length > 5 ? (
            <Text size="xs" c="dimmed">
              Còn {duplicates.length - 5} booking trùng khác.
            </Text>
          ) : null}
        </Stack>
        <Text size="xs" c="dimmed">
          Nếu đây là khách đặt thêm bàn, bấm &quot;Tạo booking thứ 2&quot;. Nếu không, quay lại để
          tránh nhập trùng.
        </Text>
      </Stack>
    ),
    labels: { cancel: "Quay lại", confirm: "Tạo booking thứ 2" },
    confirmProps: { color: "orange" },
    onConfirm: onConfirmSecondBooking,
  });
}
