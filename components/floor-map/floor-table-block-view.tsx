"use client";

import { ActionIcon, Badge, Group, Menu, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { MoreVertical } from "lucide-react";
import { memo, type CSSProperties, type MouseEvent } from "react";
import { bookingRowBusyStyle } from "@/lib/busy-row-style";
import { isGuestCountSpecified } from "@/lib/booking-meta";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import { formatMergeGroupDateRange } from "@/lib/merge-group-utils";
import { isSplitCloneTable } from "@/lib/table-split-clone-utils";
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
    bookingGuestBadge = null,
    hideBookingPeek = false,
    onGridSelect = null,
    isGridSelected = false,
    suppressOpen = false,
  } = props;

  const hasQuickActions = canComplete || canLock || showUnlock;
  const guestBadgeBooking = bookingGuestBadge ?? displayBooking;

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
        } ${isGridSelected ? classes.tableBlockMergeSelected : ""} ${
          onGridSelect ? classes.tableBlockGridSelectable : ""
        }`}
        style={bookingRowBusyStyle(isBusy)}
        onPointerUp={(event) => {
          if (event.button !== 0) {
            return;
          }
          const target = event.target as HTMLElement;
          if (target.closest("[data-table-status-menu]")) {
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
        <Group gap={6} wrap="nowrap" align="center" justify="space-between">
          <Text fw={600} size="sm" lineClamp={1} style={{ minWidth: 0, flex: 1 }}>
            {table.name}
          </Text>
          <Group
            gap={4}
            wrap="nowrap"
            align="center"
            className={classes.tableBlockHeaderActions}
            data-table-status-menu=""
          >
            {showStatusMenu && !isEmployee && !onGridSelect ? (
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
            ) : null}
          </Group>
        </Group>
        <Group gap={6} wrap="nowrap" align="center" justify="space-between" w="100%">
          <Badge color={tableStatusColor[table.status]} variant="light" size="xs">
            {tableStatusLabel[table.status]}
          </Badge>
          <TableBlockGuestBadge booking={guestBadgeBooking} />
        </Group>
        {!hideBookingPeek ? (
          <TableBlockBookingPeek displayBooking={displayBooking} customerName={customerName} />
        ) : null}
        <TableBlockSplitCloneAvailability table={table} />
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
    prev.style.top === next.style.top &&
    prev.bookingGuestBadge?.id === next.bookingGuestBadge?.id &&
    prev.bookingGuestBadge?.guestCount === next.bookingGuestBadge?.guestCount &&
    prev.hideBookingPeek === next.hideBookingPeek &&
    Boolean(prev.onGridSelect) === Boolean(next.onGridSelect) &&
    prev.isGridSelected === next.isGridSelected &&
    prev.suppressOpen === next.suppressOpen
  );
}

export const FloorTableBlockView = memo(FloorTableBlockViewInner, propsAreEqual);
