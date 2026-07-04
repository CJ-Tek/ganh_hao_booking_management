"use client";

import { Button, Group } from "@mantine/core";
import { BookingCheckInButton } from "@/components/booking-management/booking-check-in-button";
import { canChangeBookingTable, canEditBookingOrder } from "@/components/booking-management/shared";
import { useAppContext } from "@/contexts/app-context";
import {
  canAssignBookingFromQueue,
  canCheckInBooking,
  canQueueBooking,
  checkInBookingDisabledReason,
} from "@/lib/booking-meta";
import { type Booking } from "@/lib/types";

export function BookingRowActions(props: {
  booking: Booking;
  busy?: boolean;
  size?: "compact-xs" | "sm";
  /** Drawer sheet: grid actions; Check-in/Chờ/Hủy bàn (or Hoàn thành) share structured rows. */
  layout?: "inline" | "drawer";
  /** When false, hides the edit control (e.g. Booking hôm nay — edit lives in Danh sách booking). */
  showEdit?: boolean;
  /** When true, only Hoàn thành is shown for seated/checked-in bookings. */
  employeeMode?: boolean;
  onEdit: (booking: Booking) => void;
  onChangeTable?: (booking: Booking) => void;
  onAssign: (booking: Booking) => void;
  onCheckIn: (bookingId: string) => void;
  onComplete: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  onQueue?: (booking: Booking) => void;
}) {
  const {
    booking,
    busy = false,
    size = "compact-xs",
    layout = "inline",
    showEdit = true,
    employeeMode = false,
    onEdit,
    onChangeTable,
    onAssign,
    onCheckIn,
    onComplete,
    onCancel,
    onQueue,
  } = props;

  const { state } = useAppContext();
  const checkInAllowed = canCheckInBooking(booking, state.bookings, {
    mergeGroups: state.mergeGroups,
  });
  const checkInDisabledReason =
    checkInBookingDisabledReason(booking, state.bookings, {
      mergeGroups: state.mergeGroups,
    }) ?? undefined;

  if (
    booking.status === "cancelled" ||
    booking.status === "completed" ||
    booking.status === "no_show"
  ) {
    return null;
  }

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

  if (employeeMode) {
    return completeAction;
  }

  const showCancel =
    booking.status !== "checked_in" && booking.status !== "seated";

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

  const assignAction = canAssignBookingFromQueue(booking) ? (
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

  const queueAction =
    canQueueBooking(booking) && onQueue ? (
      <Button
        size={size}
        variant="light"
        color="yellow"
        disabled={busy}
        onClick={() => onQueue(booking)}
      >
        Chờ
      </Button>
    ) : null;

  const checkInAction = (
    <BookingCheckInButton
      size={size}
      disabled={!checkInAllowed}
      disabledReason={checkInDisabledReason}
      loading={busy}
      onCheckIn={() => onCheckIn(booking.id)}
      fullWidth={layout === "drawer" && !showCancel && !queueAction}
    />
  );

  const cancelAction = showCancel ? (
    <Button
      size={size}
      variant={layout === "drawer" ? "filled" : "default"}
      color="red"
      disabled={busy}
      onClick={() => onCancel(booking)}
    >
      Hủy bàn
    </Button>
  ) : null;

  const utilityActions = (
    <>
      {editAction}
      {changeTableAction}
      {assignAction}
      {layout === "drawer" && completeAction ? queueAction : null}
    </>
  );

  const hasUtilityButtons =
    (showEdit && canEditBookingOrder(booking)) ||
    (canChangeBookingTable(booking) && !!onChangeTable) ||
    canAssignBookingFromQueue(booking) ||
    (layout === "drawer" && !!completeAction && !!queueAction);

  if (layout === "drawer") {
    const utilityButtons = (
      <>
        {editAction}
        {changeTableAction}
        {assignAction}
        {completeAction ? queueAction : null}
      </>
    );

    if (completeAction) {
      return (
        <div className="booking-row-actions-drawer">
          {hasUtilityButtons ? (
            <div className="booking-row-actions-drawer-utilities">{utilityButtons}</div>
          ) : null}
          <div className="booking-row-actions-drawer-span">{completeAction}</div>
        </div>
      );
    }

    const cancelBesideCheckIn = showCancel && !queueAction;

    return (
      <div className="booking-row-actions-drawer">
        {hasUtilityButtons ? (
          <div className="booking-row-actions-drawer-utilities">{utilityButtons}</div>
        ) : null}
        <div className="booking-row-actions-drawer-primary">
          {checkInAction}
          {queueAction ?? (cancelBesideCheckIn ? cancelAction : null)}
        </div>
        {showCancel && queueAction ? (
          <div className="booking-row-actions-drawer-span">{cancelAction}</div>
        ) : null}
      </div>
    );
  }

  return (
    <Group gap={6} wrap="wrap">
      {utilityActions}
      {checkInAction}
      {queueAction}
      {completeAction ?? cancelAction}
    </Group>
  );
}
