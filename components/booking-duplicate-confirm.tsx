"use client";

import { Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import dayjs from "dayjs";
import { type BookingDuplicateInfo } from "@/lib/booking-duplicate";

export function confirmDuplicateBookingSecond(
  duplicates: BookingDuplicateInfo[],
  onConfirmSecondBooking: () => void
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
        {duplicates.length > 1 ? (
          <Text size="xs" c="dimmed">
            Còn {duplicates.length - 1} booking trùng cùng khung giờ.
          </Text>
        ) : null}
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
