"use client";

import dayjs from "dayjs";
import { Alert, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
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

  const areaOptions = useMemo(() => {
    if (!booking) {
      return [];
    }
    return [...areas.filter((area) => area.branchId === booking.branchId)]
      .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.id.localeCompare(b.id))
      .map((area) => ({ value: area.id, label: area.name }));
  }, [areas, booking]);

  const candidateTables = useMemo(() => {
    if (!booking) {
      return [];
    }
    return getAssignableCandidateTables(booking, tables, bookings).filter(
      (table) => (areaId ? table.areaId === areaId : true) && table.id !== booking.tableId
    );
  }, [areaId, booking, bookings, tables]);

  const tableOptions = useMemo(() => {
    return candidateTables.map((table) => ({
      value: table.id,
      label: table.name,
    }));
  }, [candidateTables]);

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
      size="lg"
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
            Chọn bàn mới. Khung giờ booking giữ nguyên; trạng thái check-in / đang ngồi được giữ
            khi đổi bàn.
          </Text>
          <Group grow>
            <Select
              label="Khu vực"
              data={areaOptions}
              value={areaId}
              onChange={(value) => {
                setAreaId(value);
                setTableId(null);
              }}
              searchable
              comboboxProps={{ withinPortal: true }}
            />
            <Select
              label="Bàn đích"
              data={tableOptions}
              value={tableId}
              onChange={setTableId}
              searchable
              clearable
              disabled={!areaId}
              placeholder={areaId ? "Chọn bàn" : "Chọn khu vực trước"}
              comboboxProps={{ withinPortal: true }}
            />
          </Group>
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
