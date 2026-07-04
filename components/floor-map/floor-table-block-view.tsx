"use client";

import { Badge, Group, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { memo, type CSSProperties } from "react";
import { bookingRowBusyStyle } from "@/lib/busy-row-style";
import { isGuestCountSpecified } from "@/lib/booking-meta";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { formatMergeGroupDateRange } from "@/lib/merge-group-utils";
import { FLOOR_TABLE_BLOCK_AVAILABLE_EMPTY_HEIGHT_PX } from "@/lib/floor-map-layout";
import { isSplitCloneTable } from "@/lib/table-split-clone-utils";
import type { Booking, DiningTable, TableStatus } from "@/lib/types";
import classes from "@/app/(portal)/floor-map/page.module.css";

const TABLE_STATUS_SURFACE_CLASS: Record<TableStatus, string> = {
  available: classes.statusSurface_available,
  hold: classes.statusSurface_hold,
  late: classes.statusSurface_late,
  occupied: classes.statusSurface_occupied,
  locked: classes.statusSurface_locked,
};

function TableBlockGuestBadge(props: { booking: Booking | null }) {
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

function TableBlockSplitCloneAvailability(props: {
  table: Pick<DiningTable, "splitSourceTableId" | "splitStartDate" | "splitEndDate">;
}) {
  const { table } = props;
  if (
    !isSplitCloneTable(table) ||
    !table.splitStartDate ||
    !table.splitEndDate
  ) {
    return null;
  }
  return (
    <Text size="xs" c="dimmed" lineClamp={2} lh={1.25} mt={2}>
      Khả dụng: {formatMergeGroupDateRange(table.splitStartDate, table.splitEndDate)}
    </Text>
  );
}

function TableBlockBookingPeek(props: { displayBooking: Booking | null }) {
  const displayBooking = props.displayBooking;
  if (!displayBooking) {
    return null;
  }
  return (
    <Stack gap={1} className={classes.tableBlockBookingTimes} style={{ pointerEvents: "none" }}>
      <Text className={classes.tableBlockBookingTime} lineClamp={1}>
        Đặt {dayjs(displayBooking.bookingAt).format("HH:mm · DD/MM")}
      </Text>
      {(displayBooking.status === "checked_in" || displayBooking.status === "seated") &&
      displayBooking.checkedInAt ? (
        <Text className={classes.tableBlockBookingTime} lineClamp={1}>
          Check-in {dayjs(displayBooking.checkedInAt).format("HH:mm · DD/MM")}
        </Text>
      ) : null}
    </Stack>
  );
}

export type FloorTableBlockViewProps = {
  table: DiningTable;
  style: CSSProperties;
  isMergeMember: boolean;
  displayBooking: Booking | null;
  customerName: string;
  isBusy: boolean;
  isDragging: boolean;
  onOpenTable: () => void;
  /** When set (e.g. merge group booking), shown as guest badge even if displayBooking is null. */
  bookingGuestBadge?: Booking | null;
  hideBookingPeek?: boolean;
  /** Grid merge/split picking — tap the block to toggle selection. */
  onGridSelect?: (() => void) | null;
  isGridSelected?: boolean;
  /** When true, block click does not open register/detail (grid action mode). */
  suppressOpen?: boolean;
};

function FloorTableBlockViewInner(props: FloorTableBlockViewProps) {
  const {
    table,
    style,
    isMergeMember,
    displayBooking,
    customerName,
    isBusy,
    isDragging,
    onOpenTable,
    bookingGuestBadge = null,
    hideBookingPeek = false,
    onGridSelect = null,
    isGridSelected = false,
    suppressOpen = false,
  } = props;

  const guestBadgeBooking = bookingGuestBadge ?? displayBooking;
  const isAvailableEmpty = table.status === "available";
  const useStackedFooter =
    table.status === "hold" || table.status === "late" || table.status === "occupied";
  const hideMergeMemberAvailableExtras = isMergeMember && isAvailableEmpty;

  const statusFooter = (
    <div
      className={`${classes.tableBlockOccupiedFooter} ${
        useStackedFooter ? classes.tableBlockOccupiedFooterStacked : ""
      }`}
    >
      {useStackedFooter ? (
        <>
          <Text className={classes.tableBlockTableNameFooter} lineClamp={1}>
            {table.name}
          </Text>
          <div className={classes.tableBlockOccupiedFooterBadges}>
            <TableBlockGuestBadge booking={guestBadgeBooking} />
            <Badge color={tableStatusColor[table.status]} variant="light" size="xs">
              {tableStatusLabel[table.status]}
            </Badge>
          </div>
        </>
      ) : (
        <>
          <Badge color={tableStatusColor[table.status]} variant="light" size="xs">
            {tableStatusLabel[table.status]}
          </Badge>
          <TableBlockGuestBadge booking={guestBadgeBooking} />
        </>
      )}
    </div>
  );

  const availableStatusRow = (
    <Group gap={6} wrap="nowrap" align="center" justify="space-between" w="100%">
      <Badge color={tableStatusColor[table.status]} variant="light" size="xs">
        {tableStatusLabel[table.status]}
      </Badge>
      {!hideMergeMemberAvailableExtras ? (
        <TableBlockGuestBadge booking={guestBadgeBooking} />
      ) : null}
    </Group>
  );

  const showCustomerName = Boolean(customerName);
  const showBookingPeek =
    !hideBookingPeek &&
    table.status !== "hold" &&
    table.status !== "late" &&
    table.status !== "occupied" &&
    Boolean(displayBooking);

  return (
    <div
      className={`${classes.tableFloorAnchor} ${isMergeMember ? classes.tableBlockMergeMember : ""}`}
      style={isMergeMember ? undefined : style}
    >
      <div
        data-table-block="true"
        data-table-status={table.status}
        className={`${classes.tableBlock} ${classes.tableBlockView} ${TABLE_STATUS_SURFACE_CLASS[table.status]} ${
          isAvailableEmpty ? classes.tableBlockAvailableEmpty : ""
        } ${
          isDragging ? classes.tableBlockDragging : ""
        } ${isGridSelected ? classes.tableBlockMergeSelected : ""} ${
          onGridSelect ? classes.tableBlockGridSelectable : ""
        } ${isMergeMember ? classes.tableBlockMergeMemberSurface : ""}`}
        style={{
          ...bookingRowBusyStyle(isBusy),
          ...(isAvailableEmpty ? { minHeight: FLOOR_TABLE_BLOCK_AVAILABLE_EMPTY_HEIGHT_PX } : null),
          ...(isMergeMember ? style : null),
        }}
        onPointerUp={(event) => {
          if (event.button !== 0) {
            return;
          }
          event.stopPropagation();
          if (isBusy) {
            return;
          }
          if (onGridSelect) {
            onGridSelect();
            return;
          }
          if (suppressOpen) {
            return;
          }
          onOpenTable();
        }}
      >
        {isAvailableEmpty ? (
          <Stack gap={4} className={classes.tableBlockAvailableBody}>
            <Text
              fw={700}
              lineClamp={2}
              className={classes.tableBlockAvailableTitle}
              style={{ minWidth: 0 }}
            >
              {table.name}
            </Text>
            {customerName && !hideMergeMemberAvailableExtras ? (
              <Text className={classes.tableBlockCustomerName} lineClamp={2}>
                {customerName}
              </Text>
            ) : null}
            {availableStatusRow}
          </Stack>
        ) : (
          <div className={classes.tableBlockOccupiedBody}>
            <Stack gap={2} className={classes.tableBlockOccupiedContent}>
              {showCustomerName ? (
                <Text className={classes.tableBlockCustomerName} lineClamp={2}>
                  {customerName || "—"}
                </Text>
              ) : null}
              {!useStackedFooter ? (
                <Text className={classes.tableBlockTableName} lineClamp={1}>
                  {table.name}
                </Text>
              ) : null}
              {showBookingPeek ? (
                <TableBlockBookingPeek displayBooking={displayBooking} />
              ) : null}
              <TableBlockSplitCloneAvailability table={table} />
            </Stack>
            {statusFooter}
          </div>
        )}
      </div>
    </div>
  );
}

function propsAreEqual(prev: FloorTableBlockViewProps, next: FloorTableBlockViewProps): boolean {
  return (
    prev.table.id === next.table.id &&
    prev.table.status === next.table.status &&
    prev.table.name === next.table.name &&
    prev.table.splitSourceTableId === next.table.splitSourceTableId &&
    prev.table.splitStartDate === next.table.splitStartDate &&
    prev.table.splitEndDate === next.table.splitEndDate &&
    prev.isMergeMember === next.isMergeMember &&
    prev.isBusy === next.isBusy &&
    prev.isDragging === next.isDragging &&
    prev.displayBooking?.id === next.displayBooking?.id &&
    prev.displayBooking?.status === next.displayBooking?.status &&
    prev.displayBooking?.bookingAt === next.displayBooking?.bookingAt &&
    prev.displayBooking?.guestCount === next.displayBooking?.guestCount &&
    prev.displayBooking?.note === next.displayBooking?.note &&
    prev.displayBooking?.checkedInAt === next.displayBooking?.checkedInAt &&
    prev.customerName === next.customerName &&
    (prev.isMergeMember
      ? JSON.stringify(prev.style) === JSON.stringify(next.style)
      : prev.style.left === next.style.left && prev.style.top === next.style.top) &&
    prev.bookingGuestBadge?.id === next.bookingGuestBadge?.id &&
    prev.bookingGuestBadge?.guestCount === next.bookingGuestBadge?.guestCount &&
    prev.hideBookingPeek === next.hideBookingPeek &&
    Boolean(prev.onGridSelect) === Boolean(next.onGridSelect) &&
    prev.isGridSelected === next.isGridSelected &&
    prev.suppressOpen === next.suppressOpen
  );
}

export const FloorTableBlockView = memo(FloorTableBlockViewInner, propsAreEqual);
