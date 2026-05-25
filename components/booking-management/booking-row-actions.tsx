"use client";

import { Button, Group } from "@mantine/core";
import { BookingCheckInButton } from "@/components/booking-management/booking-check-in-button";
import { canChangeBookingTable, canEditBookingOrder } from "@/components/booking-management/shared";
import { type Booking } from "@/lib/types";

export function BookingRowActions(props: {
  booking: Booking;
  busy?: boolean;
  size?: "compact-xs" | "sm";
  /** When false, hides the edit control (e.g. Booking hôm nay — edit lives in Danh sách booking). */
  showEdit?: boolean;
  onEdit: (booking: Booking) => void;
  onChangeTable?: (booking: Booking) => void;
  onAssign: (booking: Booking) => void;
  onCheckIn: (bookingId: string) => void;
  onComplete: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
}) {
  const {
    booking,
    busy = false,
    size = "compact-xs",
    showEdit = true,
    onEdit,
    onChangeTable,
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
      {showEdit && canEditBookingOrder(booking) ? (
        <Button
          size={size}
          variant="default"
          disabled={busy}
          onClick={() => onEdit(booking)}
        >
          Sửa
        </Button>
      ) : null}
      {canChangeBookingTable(booking) && onChangeTable ? (
        <Button
          size={size}
          variant="light"
          color="blue"
          disabled={busy}
          onClick={() => onChangeTable(booking)}
        >
          Đổi bàn
        </Button>
      ) : null}
      {booking.status === "pending" ? (
        <Button
          size={size}
          variant="filled"
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
          variant="default"
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
