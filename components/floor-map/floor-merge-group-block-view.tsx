"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { memo, type CSSProperties } from "react";
import { bookingRowBusyStyle } from "@/lib/busy-row-style";
import { isGuestCountSpecified } from "@/lib/booking-meta";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import type { Booking, TableMergeGroup, TableStatus } from "@/lib/types";
import classes from "@/app/(portal)/floor-map/page.module.css";

const TABLE_STATUS_SURFACE_CLASS: Record<TableStatus, string> = {
  available: classes.statusSurface_available,
  hold: classes.statusSurface_hold,
  occupied: classes.statusSurface_occupied,
  locked: classes.statusSurface_locked,
};

function MergeBlockGuestBadge(props: { booking: Booking | null }) {
  const { booking } = props;
  if (!booking || !isGuestCountSpecified(booking)) {
    return null;
  }
  return (
    <Badge variant="filled" color="dark" size="xs" radius="sm" style={{ flexShrink: 0 }}>
      {booking.guestCount} khách
    </Badge>
  );
}

function MergeBlockBookingPeek(props: {
  displayBooking: Booking | null;
  customerName: string;
}) {
  const displayBooking = props.displayBooking;
  if (!displayBooking) {
    return null;
  }
  const start = displayBooking.startTime ?? displayBooking.bookingAt;
  const end = displayBooking.endTime;
  return (
    <Stack gap={2} mt={4} style={{ pointerEvents: "none" }}>
      <Text size="xs" fw={600} lineClamp={2} lh={1.25}>
        {props.customerName || "—"}
      </Text>
      <Text size="xs" c="dimmed" lineClamp={1}>
        Bắt đầu {dayjs(start).format("HH:mm · DD/MM")}
      </Text>
      {end ? (
        <Text size="xs" c="dimmed" lineClamp={1}>
          Kết thúc {dayjs(end).format("HH:mm · DD/MM")}
        </Text>
      ) : null}
      {(displayBooking.status === "checked_in" || displayBooking.status === "seated") &&
      displayBooking.checkedInAt ? (
        <Text size="xs" c="dimmed" lineClamp={1}>
          Check-in {dayjs(displayBooking.checkedInAt).format("HH:mm · DD/MM")}
        </Text>
      ) : null}
    </Stack>
  );
}

export type FloorMergeGroupBlockViewProps = {
  group: TableMergeGroup;
  status: TableStatus;
  style: CSSProperties;
  displayBooking: Booking | null;
  customerName: string;
  isBusy: boolean;
  isDragging: boolean;
  onOpen: () => void;
};

function FloorMergeGroupBlockViewInner(props: FloorMergeGroupBlockViewProps) {
  const {
    group,
    status,
    style,
    displayBooking,
    customerName,
    isBusy,
    isDragging,
    onOpen,
  } = props;

  return (
    <div className={classes.mergeGroupBlockAnchor} style={style}>
      <button
        type="button"
        data-table-block="true"
        data-table-status={status}
        className={`${classes.tableBlock} ${classes.tableBlockView} ${classes.mergeGroupBlock} ${TABLE_STATUS_SURFACE_CLASS[status]} ${
          isDragging ? classes.tableBlockDragging : ""
        }`}
        style={bookingRowBusyStyle(isBusy)}
        onClick={(event) => {
          event.stopPropagation();
          if (isBusy) {
            return;
          }
          onOpen();
        }}
      >
        <Group gap={6} wrap="nowrap" align="center" justify="space-between">
          <Text fw={600} size="sm" lineClamp={1} style={{ minWidth: 0, flex: 1 }}>
            {group.mergedName}
          </Text>
          <MergeBlockGuestBadge booking={displayBooking} />
        </Group>
        <Text size="xs">{group.tableIds.length} bàn</Text>
        <Badge color={tableStatusColor[status]} variant="light" size="xs">
          {tableStatusLabel[status]}
        </Badge>
        <MergeBlockBookingPeek displayBooking={displayBooking} customerName={customerName} />
      </button>
    </div>
  );
}

function propsAreEqual(
  prev: FloorMergeGroupBlockViewProps,
  next: FloorMergeGroupBlockViewProps
): boolean {
  return (
    prev.group.id === next.group.id &&
    prev.group.mergedName === next.group.mergedName &&
    prev.group.tableIds.length === next.group.tableIds.length &&
    prev.status === next.status &&
    prev.isBusy === next.isBusy &&
    prev.isDragging === next.isDragging &&
    prev.displayBooking?.id === next.displayBooking?.id &&
    prev.displayBooking?.status === next.displayBooking?.status &&
    prev.displayBooking?.startTime === next.displayBooking?.startTime &&
    prev.displayBooking?.endTime === next.displayBooking?.endTime &&
    prev.displayBooking?.bookingAt === next.displayBooking?.bookingAt &&
    prev.displayBooking?.guestCount === next.displayBooking?.guestCount &&
    prev.displayBooking?.note === next.displayBooking?.note &&
    prev.displayBooking?.checkedInAt === next.displayBooking?.checkedInAt &&
    prev.customerName === next.customerName &&
    prev.style.left === next.style.left &&
    prev.style.top === next.style.top
  );
}

export const FloorMergeGroupBlockView = memo(FloorMergeGroupBlockViewInner, propsAreEqual);
