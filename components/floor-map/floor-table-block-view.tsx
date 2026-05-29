"use client";

import { ActionIcon, Badge, Group, Menu, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { MoreVertical } from "lucide-react";
import { memo, type CSSProperties, type MouseEvent } from "react";
import { bookingRowBusyStyle } from "@/lib/busy-row-style";
import { isGuestCountSpecified } from "@/lib/booking-meta";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import type { Booking, DiningTable, TableStatus } from "@/lib/types";
import classes from "@/app/(portal)/floor-map/page.module.css";

const TABLE_STATUS_SURFACE_CLASS: Record<TableStatus, string> = {
  available: classes.statusSurface_available,
  hold: classes.statusSurface_hold,
  occupied: classes.statusSurface_occupied,
  locked: classes.statusSurface_locked,
};

function stopMenuAction(event: MouseEvent) {
  event.stopPropagation();
  event.preventDefault();
}

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

function TableBlockBookingPeek(props: {
  displayBooking: Booking | null;
  customerName: string;
}) {
  const displayBooking = props.displayBooking;
  if (!displayBooking) {
    return null;
  }
  return (
    <Stack gap={2} mt={4} style={{ pointerEvents: "none" }}>
      <Text size="xs" fw={600} lineClamp={2} lh={1.25}>
        {props.customerName || "—"}
      </Text>
      <Text size="xs" c="dimmed" lineClamp={1}>
        Đặt {dayjs(displayBooking.bookingAt).format("HH:mm · DD/MM")}
      </Text>
      {(displayBooking.status === "checked_in" || displayBooking.status === "seated") &&
      displayBooking.checkedInAt ? (
        <Text size="xs" c="dimmed" lineClamp={1}>
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
  isEmployee: boolean;
  isBusy: boolean;
  isDragging: boolean;
  /** Trống, Khóa, or Đã ngồi — not Giữ chỏ (reservation). */
  showStatusMenu: boolean;
  canComplete: boolean;
  canLock: boolean;
  showUnlock: boolean;
  onOpenTable: () => void;
  onOpenDetail: () => void;
  onCompleteBooking: () => void;
  onLockTable: () => void;
  onUnlockTable: () => void;
  onStatusMenuOpen: () => void;
  onStatusMenuClose: () => void;
};

function FloorTableBlockViewInner(props: FloorTableBlockViewProps) {
  const {
    table,
    style,
    isMergeMember,
    displayBooking,
    customerName,
    isEmployee,
    isBusy,
    isDragging,
    showStatusMenu,
    canComplete,
    canLock,
    showUnlock,
    onOpenTable,
    onOpenDetail,
    onCompleteBooking,
    onLockTable,
    onUnlockTable,
    onStatusMenuOpen,
    onStatusMenuClose,
  } = props;

  const hasQuickActions = canComplete || canLock || showUnlock;

  return (
    <div
      className={`${classes.tableFloorAnchor} ${isMergeMember ? classes.tableBlockMergeMember : ""}`}
      style={style}
    >
      <div
        data-table-block="true"
        data-table-status={table.status}
        className={`${classes.tableBlock} ${classes.tableBlockView} ${TABLE_STATUS_SURFACE_CLASS[table.status]} ${
          isDragging ? classes.tableBlockDragging : ""
        }`}
        style={bookingRowBusyStyle(isBusy)}
        onClick={(event) => {
          event.stopPropagation();
          if (isBusy) {
            return;
          }
          onOpenTable();
        }}
      >
        <Group gap={6} wrap="nowrap" align="center" justify="space-between">
          <Text fw={600} size="sm" lineClamp={1} style={{ minWidth: 0, flex: 1 }}>
            {table.name}
          </Text>
          <TableBlockGuestBadge booking={displayBooking} />
        </Group>
        <Badge color={tableStatusColor[table.status]} variant="light" size="xs">
          {tableStatusLabel[table.status]}
        </Badge>
        <TableBlockBookingPeek displayBooking={displayBooking} customerName={customerName} />
      </div>
      {showStatusMenu && !isEmployee ? (
        <div className={classes.tableBlockStatusMenuAnchor} data-table-status-menu="">
          <Menu
            withinPortal
            position="bottom-end"
            closeOnItemClick
            onOpen={onStatusMenuOpen}
            onClose={onStatusMenuClose}
          >
            <Menu.Target>
              <ActionIcon
                type="button"
                variant="subtle"
                color="gray"
                size="sm"
                className={classes.tableBlockStatusMenuBtn}
                aria-label="Thao tác bàn"
                disabled={isBusy}
                onClick={stopMenuAction}
              >
                <MoreVertical size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                disabled={isBusy}
                onClick={(event) => {
                  stopMenuAction(event);
                  onOpenDetail();
                }}
              >
                Lịch sử booking
              </Menu.Item>
              {hasQuickActions ? <Menu.Divider /> : null}
              {canComplete ? (
                <Menu.Item
                  disabled={isBusy}
                  onClick={(event) => {
                    stopMenuAction(event);
                    onCompleteBooking();
                  }}
                >
                  Hoàn thành
                </Menu.Item>
              ) : null}
              {showUnlock ? (
                <Menu.Item
                  disabled={isBusy}
                  onClick={(event) => {
                    stopMenuAction(event);
                    onUnlockTable();
                  }}
                >
                  Mở khóa
                </Menu.Item>
              ) : null}
              {canLock ? (
                <Menu.Item
                  disabled={isBusy}
                  onClick={(event) => {
                    stopMenuAction(event);
                    onLockTable();
                  }}
                >
                  Khóa
                </Menu.Item>
              ) : null}
            </Menu.Dropdown>
          </Menu>
        </div>
      ) : null}
    </div>
  );
}

function propsAreEqual(prev: FloorTableBlockViewProps, next: FloorTableBlockViewProps): boolean {
  return (
    prev.table.id === next.table.id &&
    prev.table.status === next.table.status &&
    prev.table.name === next.table.name &&
    prev.isMergeMember === next.isMergeMember &&
    prev.isEmployee === next.isEmployee &&
    prev.isBusy === next.isBusy &&
    prev.isDragging === next.isDragging &&
    prev.showStatusMenu === next.showStatusMenu &&
    prev.canComplete === next.canComplete &&
    prev.canLock === next.canLock &&
    prev.showUnlock === next.showUnlock &&
    prev.displayBooking?.id === next.displayBooking?.id &&
    prev.displayBooking?.status === next.displayBooking?.status &&
    prev.displayBooking?.bookingAt === next.displayBooking?.bookingAt &&
    prev.displayBooking?.guestCount === next.displayBooking?.guestCount &&
    prev.displayBooking?.note === next.displayBooking?.note &&
    prev.displayBooking?.checkedInAt === next.displayBooking?.checkedInAt &&
    prev.customerName === next.customerName &&
    prev.style.left === next.style.left &&
    prev.style.top === next.style.top
  );
}

export const FloorTableBlockView = memo(FloorTableBlockViewInner, propsAreEqual);
