"use client";

import dayjs from "dayjs";
import { Alert, Badge, Button, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EditableNumberInput } from "@/components/editable-number-input";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import { PortalDataTable } from "@/components/portal-data-table";
import { PortalSectionCard } from "@/components/portal-page";
import { useAppContext } from "@/contexts/app-context";
import { bookingListRowStyle } from "@/lib/busy-row-style";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import {
  displayCustomerPhone,
  formatBookingAreaTable,
  isGuestCountSpecified,
  minutesLateForBooking,
  resolveBookingArrivalTime,
} from "@/lib/booking-meta";
import { type Booking, type Customer } from "@/lib/types";

export type BookingLateListPanelProps = {
  bookings: Booking[];
  customers: Customer[];
  areas: { id: string; name: string }[];
  tables: { id: string; name: string; areaId?: string }[];
  mergeGroups: { id: string; areaId: string; mergedName: string }[];
  busyBookingId?: string | null;
  embedded?: boolean;
  emptyText?: string;
  lateGraceMinutes: number;
  canEditLateConfig?: boolean;
  onSaveLateGraceMinutes?: (minutes: number) => Promise<{ ok: boolean; message: string }>;
  onRowClick?: (booking: Booking) => void;
};

export function BookingLateListPanel({
  bookings,
  customers,
  areas,
  tables,
  mergeGroups,
  busyBookingId = null,
  embedded = false,
  emptyText = "Không có khách trong Danh sách trễ.",
  lateGraceMinutes,
  canEditLateConfig = false,
  onSaveLateGraceMinutes,
  onRowClick,
}: BookingLateListPanelProps) {
  const { state } = useAppContext();
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<Booking>>({
    columnAccessor: "lateMinutes",
    direction: "desc",
  });
  const [draftLateMinutes, setDraftLateMinutes] = useState<number>(lateGraceMinutes);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    setDraftLateMinutes(lateGraceMinutes);
  }, [lateGraceMinutes]);

  const customerById = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const customer of customers) {
      map.set(customer.id, customer);
    }
    return map;
  }, [customers]);

  const lookup = useMemo(
    () => ({ areas, tables, mergeGroups }),
    [areas, mergeGroups, tables]
  );

  const sorted = useMemo(() => {
    const rows = [...bookings];
    const accessor = sortStatus.columnAccessor;
    const dir = sortStatus.direction === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (accessor === "lateMinutes") {
        return (minutesLateForBooking(a) - minutesLateForBooking(b)) * dir;
      }
      if (accessor === "arrival") {
        return (
          (dayjs(resolveBookingArrivalTime(a)).valueOf() -
            dayjs(resolveBookingArrivalTime(b)).valueOf()) *
          dir
        );
      }
      const nameA = customerById.get(a.customerId)?.fullName ?? "";
      const nameB = customerById.get(b.customerId)?.fullName ?? "";
      return nameA.localeCompare(nameB, "vi") * dir;
    });
    return rows;
  }, [bookings, customerById, sortStatus.columnAccessor, sortStatus.direction]);

  const getRecordSearchValue = useCallback(
    (booking: Booking) => {
      const customer = customerById.get(booking.customerId);
      return [
        customer?.fullName ?? "",
        displayCustomerPhone(customer?.phone ?? null),
        dayjs(resolveBookingArrivalTime(booking)).format("HH:mm DD/MM/YYYY"),
        `${minutesLateForBooking(booking)} phút`,
        formatBookingAreaTable(booking, lookup, { pendingLabel: "Chưa gán" }),
        bookingStatusLabel.late,
        String(booking.guestCount),
      ]
        .join(" ")
        .toLowerCase();
    },
    [customerById, lookup]
  );

  const handleSaveConfig = async () => {
    if (!onSaveLateGraceMinutes) {
      return;
    }
    const parsed = draftLateMinutes;
    if (!Number.isFinite(parsed) || parsed < 1) {
      notifications.show({ color: "red", message: "Nhập số phút trễ hợp lệ (≥ 1)." });
      return;
    }
    setSavingConfig(true);
    try {
      const result = await onSaveLateGraceMinutes(Math.round(parsed));
      notifications.show({ color: result.ok ? "green" : "red", message: result.message });
    } finally {
      setSavingConfig(false);
    }
  };

  const content = (
    <Stack gap="sm">
      {canEditLateConfig && onSaveLateGraceMinutes ? (
        <Stack gap="xs">
          <EditableNumberInput
            label="Thời gian trễ tối đa (phút)"
            description="Khách đã xác nhận quá N phút sau giờ đến mà chưa check-in sẽ tự chuyển Trễ. Không đến chỉ áp dụng cuối ngày nếu vẫn Trễ."
            value={draftLateMinutes}
            onChange={(value) => setDraftLateMinutes(value ?? lateGraceMinutes)}
            min={1}
            max={180}
            disabled={savingConfig}
          />
          <Group justify="flex-end">
            <Button
              size="compact-sm"
              variant="light"
              loading={savingConfig}
              onClick={handleSaveConfig}
            >
              Lưu cấu hình trễ
            </Button>
          </Group>
        </Stack>
      ) : (
        <Alert variant="light" color="orange" title="Quy tắc trễ">
          Khách xác nhận quá <strong>{lateGraceMinutes} phút</strong> sau giờ đến mà chưa check-in
          → tự chuyển <strong>Trễ</strong>. Cuối ngày nếu vẫn Trễ → <strong>Không đến</strong>.
        </Alert>
      )}
      <PortalDataTable<Booking>
        records={sorted}
        sortStatus={sortStatus}
        onSortStatusChange={setSortStatus}
        getRecordSearchValue={getRecordSearchValue}
        searchPlaceholder="Khách, SĐT, giờ đến, bàn..."
        minHeight={220}
        noRecordsText={emptyText}
        onRowClick={onRowClick ? ({ record }) => onRowClick(record) : undefined}
        rowStyle={(record) =>
          bookingListRowStyle(record.id, {
            busyBookingId: busyBookingId ?? null,
            extra: onRowClick ? { cursor: "pointer" } : undefined,
          })
        }
        mobileCardRender={(row) => {
          const customer = customerById.get(row.customerId);
          const creator =
            state.users.find((item) => item.id === row.createdByUserId)?.fullName ??
            "Không rõ";
          const lastEditor =
            row.lastEditedByUserId != null
              ? state.users.find((item) => item.id === row.lastEditedByUserId)?.fullName
              : undefined;

          return (
            <BookingCompactCard
              key={row.id}
              booking={row}
              variant="list"
              customerName={customer?.fullName ?? "—"}
              creatorName={creator}
              bookingAreaTableLookup={lookup}
              lastEditorName={lastEditor}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={bookingListRowStyle(row.id, {
                busyBookingId: busyBookingId ?? null,
                extra: onRowClick ? { cursor: "pointer" } : undefined,
              })}
            />
          );
        }}
        columns={[
          {
            accessor: "customer",
            title: "Khách",
            sortable: true,
            render: (row) => customerById.get(row.customerId)?.fullName ?? "—",
          },
          {
            accessor: "phone",
            title: "SĐT",
            render: (row) =>
              displayCustomerPhone(customerById.get(row.customerId)?.phone ?? null),
          },
          {
            accessor: "guestCount",
            title: "Số khách",
            render: (row) => (isGuestCountSpecified(row) ? row.guestCount : "—"),
          },
          {
            accessor: "arrival",
            title: "Giờ đến",
            sortable: true,
            render: (row) => dayjs(resolveBookingArrivalTime(row)).format("HH:mm DD/MM/YYYY"),
          },
          {
            accessor: "lateMinutes",
            title: "Trễ (phút)",
            sortable: true,
            render: (row) => `${minutesLateForBooking(row)} phút`,
          },
          {
            accessor: "status",
            title: "Trạng thái",
            render: () => (
              <Badge color={bookingStatusColor.late} variant="light">
                {bookingStatusLabel.late}
              </Badge>
            ),
          },
          {
            accessor: "areaTable",
            title: "Khu / Bàn",
            render: (row) =>
              formatBookingAreaTable(row, lookup, { pendingLabel: "Chưa gán" }),
          },
        ]}
      />
    </Stack>
  );

  if (embedded) {
    return content;
  }

  return <PortalSectionCard>{content}</PortalSectionCard>;
}
