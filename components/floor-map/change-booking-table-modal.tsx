"use client";

import dayjs from "dayjs";
import { Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { BookingTablePicker } from "@/components/booking-table-picker/booking-table-picker";
import {
  findAssignableSlotConflictsAtTable,
  formatTableSlotConflictMessage,
  getAssignableCandidateTables,
} from "@/lib/booking-meta";
import type { Area, Booking, DiningTable } from "@/lib/types";

export type ChangeBookingTableModalProps = {
  opened: boolean;
  onClose: () => void;
  booking: Booking | null;
  customerName: string;
  customers: readonly { id: string; fullName: string }[];
  areas: Area[];
  tables: DiningTable[];
  bookings: readonly Booking[];
  defaultAreaId?: string | null;
  loading?: boolean;
  onConfirm: (target: { areaId: string; tableId: string }) => void | Promise<void>;
};

export function ChangeBookingTableModal(props: ChangeBookingTableModalProps) {
  const {
    opened,
    onClose,
    booking,
    customerName,
    customers,
    areas,
    tables,
    bookings,
    defaultAreaId,
    loading = false,
    onConfirm,
  } = props;

  const [areaId, setAreaId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);

  useEffect(() => {
    if (!opened || !booking) {
      return;
    }
    setAreaId(booking.areaId ?? defaultAreaId ?? null);
    setTableId(null);
  }, [opened, booking, defaultAreaId]);

  const candidateTables = useMemo(() => {
    if (!booking) {
      return [];
    }
    return getAssignableCandidateTables(booking, tables, bookings).filter(
      (table) => (areaId ? table.areaId === areaId : true) && table.id !== booking.tableId
    );
  }, [areaId, booking, bookings, tables]);

  const selectableTableIds = useMemo(
    () => new Set(candidateTables.map((table) => table.id)),
    [candidateTables]
  );

  const targetConflictMessage = useMemo(() => {
    if (!booking || !tableId) {
      return null;
    }
    const conflicts = findAssignableSlotConflictsAtTable(
      { ...booking, tableId },
      tableId,
      bookings
    );
    if (conflicts.length === 0) {
      return null;
    }
    const tableName = tables.find((table) => table.id === tableId)?.name;
    const conflictCustomerName = customers.find(
      (item) => item.id === conflicts[0]?.customerId
    )?.fullName;
    return formatTableSlotConflictMessage(conflicts, {
      tableName,
      customerName: conflictCustomerName,
    });
  }, [booking, bookings, tableId, tables, customers]);

  const sameAsCurrent =
    booking != null &&
    areaId === booking.areaId &&
    tableId != null &&
    tableId === booking.tableId;

  const canSubmit =
    Boolean(areaId) &&
    Boolean(tableId) &&
    !sameAsCurrent &&
    !targetConflictMessage &&
    !loading;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Đổi bàn"
      size="xl"
      centered
      overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
    >
      {booking ? (
        <Stack gap="sm">
          <Text size="sm" c="dimmed">
            {customerName || "—"} · {dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY")} ·{" "}
            {booking.guestCount} khách
          </Text>
          <Text size="xs" c="dimmed">
            Chọn bàn mới trên sơ đồ. Khung giờ booking giữ nguyên; trạng thái check-in / đang ngồi
            được giữ khi đổi bàn.
          </Text>
          <BookingTablePicker
            mode="change_table"
            branchId={booking.branchId}
            areas={areas.filter((area) => area.branchId === booking.branchId)}
            tables={tables.filter((table) => table.branchId === booking.branchId)}
            mergeGroups={[]}
            bookings={bookings}
            layoutDate={dayjs(booking.bookingAt).format("YYYY-MM-DD")}
            areaId={areaId}
            tableId={tableId}
            mergeGroupId={null}
            selectableTableIds={selectableTableIds}
            highlightTableId={booking.tableId}
            disabled={loading}
            onChange={(patch) => {
              if (patch.areaId !== undefined) {
                setAreaId(patch.areaId);
              }
              if (patch.tableId !== undefined) {
                setTableId(patch.tableId);
              }
            }}
          />
          {targetConflictMessage ? (
            <Alert color="red" variant="light" title="Không thể đổi sang bàn này">
              {targetConflictMessage}
            </Alert>
          ) : null}
          {sameAsCurrent ? (
            <Text size="xs" c="dimmed">
              Bàn đích trùng với bàn hiện tại.
            </Text>
          ) : null}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={loading}>
              Hủy
            </Button>
            <Button
              loading={loading}
              disabled={!canSubmit}
              onClick={() => {
                if (!areaId || !tableId) {
                  return;
                }
                void onConfirm({ areaId, tableId });
              }}
            >
              Xác nhận đổi bàn
            </Button>
          </Group>
        </Stack>
      ) : null}
    </Modal>
  );
}
