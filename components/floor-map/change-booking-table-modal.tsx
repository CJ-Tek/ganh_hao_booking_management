"use client";

import dayjs from "dayjs";
import { Alert, Button, Group, Modal, Select, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import {
  findAssignableSlotConflictsAtTable,
  formatTableSlotConflictMessage,
  getAssignableCandidateTables,
  getAssignableMergeGroups,
  hasAssignableSlotConflictAtMergeGroup,
} from "@/lib/booking-meta";
import { formatTableGuestCapacityHint } from "@/lib/table-capacity";
import type { Area, Booking, DiningTable, TableMergeGroup } from "@/lib/types";

export type ChangeBookingTableModalProps = {
  opened: boolean;
  onClose: () => void;
  booking: Booking | null;
  customerName: string;
  customers: readonly { id: string; fullName: string }[];
  areas: Area[];
  tables: DiningTable[];
  mergeGroups: TableMergeGroup[];
  bookings: readonly Booking[];
  defaultAreaId?: string | null;
  loading?: boolean;
  onConfirm: (target: {
    areaId: string;
    tableId: string | null;
    mergeGroupId: string | null;
  }) => void | Promise<void>;
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
    mergeGroups,
    bookings,
    defaultAreaId,
    loading = false,
    onConfirm,
  } = props;

  const [areaId, setAreaId] = useState<string | null>(null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [mergeGroupId, setMergeGroupId] = useState<string | null>(null);

  useEffect(() => {
    if (!opened || !booking) {
      return;
    }
    setAreaId(booking.areaId ?? defaultAreaId ?? null);
    setTableId(null);
    setMergeGroupId(null);
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
    return getAssignableCandidateTables(booking, tables, bookings, booking.guestCount).filter(
      (table) => (areaId ? table.areaId === areaId : true) && table.id !== booking.tableId
    );
  }, [areaId, booking, bookings, tables]);

  const tableOptions = useMemo(() => {
    return candidateTables.map((table) => ({
      value: table.id,
      label: `${table.name} · ${formatTableGuestCapacityHint(table.seats)}`,
    }));
  }, [candidateTables]);

  const mergeGroupOptions = useMemo(() => {
    if (!booking || !areaId) {
      return [];
    }
    return getAssignableMergeGroups(
      booking,
      mergeGroups.filter(
        (group) =>
          group.areaId === areaId &&
          group.id !== booking.mergeGroupId &&
          group.status === "active"
      ),
      bookings,
      booking.guestCount
    ).map((group) => ({
      value: group.id,
      label: `${group.mergedName} · ${group.totalCapacity} chỗ`,
    }));
  }, [areaId, booking, bookings, mergeGroups]);

  const targetConflictMessage = useMemo(() => {
    if (!booking) {
      return null;
    }
    if (tableId) {
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
    }
    if (mergeGroupId) {
      const group = mergeGroups.find((item) => item.id === mergeGroupId);
      if (!group) {
        return null;
      }
      if (
        hasAssignableSlotConflictAtMergeGroup(
          { ...booking, tableId: null, mergeGroupId },
          group,
          bookings
        )
      ) {
        return "Khung giờ trùng với booking khác trên cụm bàn gộp hoặc bàn thành viên.";
      }
    }
    return null;
  }, [booking, bookings, mergeGroupId, mergeGroups, tableId, tables]);

  const selectedTable = tableId ? tables.find((table) => table.id === tableId) : undefined;
  const sameAsCurrent =
    booking != null &&
    areaId === booking.areaId &&
    ((tableId != null && tableId === booking.tableId && !mergeGroupId) ||
      (mergeGroupId != null && mergeGroupId === booking.mergeGroupId && !tableId));

  const canSubmit =
    Boolean(areaId) &&
    Boolean(tableId || mergeGroupId) &&
    !(tableId && mergeGroupId) &&
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
            Chọn bàn hoặc cụm gộp mới. Khung giờ booking giữ nguyên; trạng thái check-in / đang
            ngồi được giữ khi đổi bàn.
          </Text>
          <Group grow>
            <Select
              label="Khu vực"
              data={areaOptions}
              value={areaId}
              onChange={(value) => {
                setAreaId(value);
                setTableId(null);
                setMergeGroupId(null);
              }}
              searchable
              comboboxProps={{ withinPortal: true }}
            />
            <Select
              label="Bàn đích"
              data={tableOptions}
              value={tableId}
              onChange={(value) => {
                setTableId(value);
                if (value) {
                  setMergeGroupId(null);
                }
              }}
              searchable
              clearable
              disabled={!areaId}
              placeholder={areaId ? "Chọn bàn" : "Chọn khu vực trước"}
              comboboxProps={{ withinPortal: true }}
            />
          </Group>
          {mergeGroupOptions.length > 0 ? (
            <Select
              label="Hoặc cụm bàn gộp"
              data={mergeGroupOptions}
              value={mergeGroupId}
              onChange={(value) => {
                setMergeGroupId(value);
                if (value) {
                  setTableId(null);
                }
              }}
              searchable
              clearable
              disabled={!areaId}
              comboboxProps={{ withinPortal: true }}
            />
          ) : null}
          {selectedTable ? (
            <Text size="xs" c="dimmed">
              Sức chứa bàn đích: {formatTableGuestCapacityHint(selectedTable.seats)}
            </Text>
          ) : null}
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
                if (!areaId || (!tableId && !mergeGroupId)) {
                  return;
                }
                void onConfirm({
                  areaId,
                  tableId: mergeGroupId ? null : tableId,
                  mergeGroupId: tableId ? null : mergeGroupId,
                });
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
