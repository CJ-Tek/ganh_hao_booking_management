"use client";

import { Button, Group } from "@mantine/core";
import { BookingCheckInButton } from "@/components/booking-management/booking-check-in-button";
import { canChangeBookingTable, canEditBookingOrder } from "@/components/booking-management/shared";
import { type Booking } from "@/lib/types";

export function BookingRowActions(props: {
  booking: Booking;
  busy?: boolean;
  size?: "compact-xs" | "sm";
  /** Drawer sheet: grid actions; Check-in/Hủy (or Hoàn thành) share one row. */
  layout?: "inline" | "drawer";
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
    layout = "inline",
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

  const editAction =
    showEdit && canEditBookingOrder(booking) ? (
      <Button size={size} variant="default" disabled={busy} onClick={() => onEdit(booking)}>
        Sửa
      </Button>
    ) : null;

  const changeTableAction =
    canChangeBookingTable(booking) && onChangeTable ? (
      <Button
        size={size}
        variant="light"
        color="blue"
        disabled={busy}
        onClick={() => onChangeTable(booking)}
      >
        Đổi bàn
      </Button>
    ) : null;

  const assignAction =
    booking.status === "pending" ? (
      <Button
        size={size}
        variant="filled"
        color="blue"
        disabled={busy}
        onClick={() => onAssign(booking)}
      >
        Gán vào bàn
      </Button>
    ) : null;

  const checkInAction = (
    <BookingCheckInButton
      size={size}
      disabled={booking.status !== "confirmed"}
      loading={busy}
      onCheckIn={() => onCheckIn(booking.id)}
      fullWidth={layout === "drawer"}
    />
  );

  const completeAction =
    booking.status === "checked_in" || booking.status === "seated" ? (
      <Button
        size={size}
        variant="filled"
        color="green"
        disabled={busy}
        fullWidth={layout === "drawer"}
        onClick={() => onComplete(booking)}
      >
        Hoàn thành
      </Button>
    ) : null;

  const cancelAction =
    booking.status === "checked_in" || booking.status === "seated" ? null : (
      <Button
        size={size}
        variant={layout === "drawer" ? "filled" : "default"}
        color="red"
        disabled={busy}
        fullWidth={layout === "drawer"}
        onClick={() => onCancel(booking)}
      >
        Hủy
      </Button>
    );

  const utilityActions = (
    <>
      {editAction}
      {changeTableAction}
      {assignAction}
    </>
  );

  if (layout === "drawer") {
    return (
      <div className="booking-row-actions-drawer">
        {utilityActions}
        {completeAction ? (
          <div className="booking-row-actions-drawer-span">{completeAction}</div>
        ) : (
          <>
            {checkInAction}
            {cancelAction}
          </>
        )}
      </div>
    );
  }

  return (
    <Group gap={6} wrap="wrap">
      {utilityActions}
      {checkInAction}
      {completeAction ?? cancelAction}
    </Group>
  );
}
