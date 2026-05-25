"use client";

import { ActionIcon, Badge, Menu, Stack, Text } from "@mantine/core";
import dayjs from "dayjs";
import { MoreVertical } from "lucide-react";
import { memo, type CSSProperties } from "react";
import { bookingRowBusyStyle } from "@/lib/busy-row-style";
import { tableStatusColor, tableStatusLabel } from "@/lib/display";
import type { Booking, DiningTable, TableStatus } from "@/lib/types";
import classes from "@/app/(portal)/floor-map/page.module.css";

const TABLE_STATUS_SURFACE_CLASS: Record<TableStatus, string> = {
  available: classes.statusSurface_available,
  hold: classes.statusSurface_hold,
  occupied: classes.statusSurface_occupied,
  locked: classes.statusSurface_locked,
};

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
  onOpenTable: () => void;
  onOpenDetail: () => void;
  onStatusChange: (status: TableStatus) => void;
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
    onOpenTable,
    onOpenDetail,
    onStatusChange,
    onStatusMenuOpen,
    onStatusMenuClose,
  } = props;

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
        {!isEmployee ? (
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
                aria-label="Đổi trạng thái"
                data-table-status-menu=""
                onClick={(event) => event.stopPropagation()}
              >
                <MoreVertical size={14} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={onOpenDetail}>Lịch sử booking & hàng chờ</Menu.Item>
              <Menu.Divider />
              {(["available", "hold", "occupied", "locked"] as TableStatus[]).map((nextStatus) => (
                <Menu.Item
                  key={nextStatus}
                  disabled={table.status === nextStatus || isBusy}
                  onClick={() => onStatusChange(nextStatus)}
                >
                  {tableStatusLabel[nextStatus]}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        ) : null}
        <Text fw={600} size="sm" lineClamp={1}>
          {table.name}
        </Text>
        <Text size="xs">{table.seats} ghế</Text>
        <Badge color={tableStatusColor[table.status]} variant="light" size="xs">
          {tableStatusLabel[table.status]}
        </Badge>
        <TableBlockBookingPeek displayBooking={displayBooking} customerName={customerName} />
      </div>
    </div>
  );
}

function propsAreEqual(prev: FloorTableBlockViewProps, next: FloorTableBlockViewProps): boolean {
  return (
    prev.table.id === next.table.id &&
    prev.table.status === next.table.status &&
    prev.table.name === next.table.name &&
    prev.table.seats === next.table.seats &&
    prev.isMergeMember === next.isMergeMember &&
    prev.isEmployee === next.isEmployee &&
    prev.isBusy === next.isBusy &&
    prev.isDragging === next.isDragging &&
    prev.displayBooking?.id === next.displayBooking?.id &&
    prev.displayBooking?.status === next.displayBooking?.status &&
    prev.displayBooking?.bookingAt === next.displayBooking?.bookingAt &&
    prev.displayBooking?.checkedInAt === next.displayBooking?.checkedInAt &&
    prev.customerName === next.customerName &&
    prev.style.left === next.style.left &&
    prev.style.top === next.style.top
  );
}

export const FloorTableBlockView = memo(FloorTableBlockViewInner, propsAreEqual);
