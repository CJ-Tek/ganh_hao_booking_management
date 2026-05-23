"use client";

import { Button, Group } from "@mantine/core";
import { BookingCheckInButton } from "@/components/booking-management/booking-check-in-button";
import { canEditBookingOrder } from "@/components/booking-management/shared";
import { type Booking } from "@/lib/types";

export function BookingRowActions(props: {
  booking: Booking;
  busy?: boolean;
  size?: "compact-xs" | "sm";
  onEdit: (booking: Booking) => void;
  onAssign: (booking: Booking) => void;
  onCheckIn: (bookingId: string) => void;
  onComplete: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
}) {
  const {
    booking,
    busy = false,
    size = "compact-xs",
    onEdit,
    onAssign,
    onCheckIn,
    onComplete,
    onCancel,
  } = props;

  if (
    booking.status === "cancelled" ||
    booking.status === "completed" ||
    booking.status === "no_show"
  ) {
    return null;
  }

  return (
    <Group gap={6} wrap="wrap">
      {canEditBookingOrder(booking) ? (
        <Button
          size={size}
          variant="outline"
          disabled={busy}
          onClick={() => onEdit(booking)}
        >
          Sửa
        </Button>
      ) : null}
      {booking.status === "pending" ? (
        <Button
          size={size}
          variant="outline"
          color="blue"
          disabled={busy}
          onClick={() => onAssign(booking)}
        >
          Gán vào bàn
        </Button>
      ) : null}
      <BookingCheckInButton
        size={size}
        disabled={booking.status !== "confirmed"}
        loading={busy}
        onCheckIn={() => onCheckIn(booking.id)}
      />
      {booking.status === "checked_in" || booking.status === "seated" ? (
        <Button
          size={size}
          variant="filled"
          color="green"
          disabled={busy}
          onClick={() => onComplete(booking)}
        >
          Hoàn thành
        </Button>
      ) : (
        <Button
          size={size}
          variant="outline"
          color="red"
          disabled={busy}
          onClick={() => onCancel(booking)}
        >
          Hủy
        </Button>
      )}
    </Group>
  );
}
