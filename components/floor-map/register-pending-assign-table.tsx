"use client";

import dayjs from "dayjs";
import { Alert, Badge, Group, Stack, Text } from "@mantine/core";
import { type DataTableSortStatus } from "mantine-datatable";
import { useCallback, useMemo } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { useAppContext } from "@/contexts/app-context";
import { mergeRowStyles } from "@/lib/busy-row-style";
import {
  displayCustomerPhone,
  pickNonOverlappingBookingsForTable,
} from "@/lib/booking-meta";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { type Booking } from "@/lib/types";

export function RegisterPendingAssignTable(props: {
  records: Booking[];
  tableId: string;
  tableSeats: number;
  selectedBookings: Booking[];
  onSelectedBookingsChange: (bookings: Booking[]) => void;
  onNavigateToBookingList?: (booking: Booking) => void;
  disabled?: boolean;
}) {
  const {
    records,
    tableId,
    tableSeats,
    selectedBookings,
    onSelectedBookingsChange,
    onNavigateToBookingList,
    disabled,
  } = props;
  const { state } = useAppContext();

  const assignPlan = useMemo(
    () =>
      pickNonOverlappingBookingsForTable(selectedBookings, tableId, state.bookings, {
        maxSeats: tableSeats > 0 ? tableSeats : undefined,
      }),
    [selectedBookings, state.bookings, tableId, tableSeats]
  );

  const skippedCount =
    assignPlan.skippedSelectionOverlap.length +
    assignPlan.skippedTableConflict.length +
    assignPlan.skippedOverCapacity.length;

  const getRecordSearchValue = useCallback(
    (booking: Booking) => {
      const customer = state.customers.find((item) => item.id === booking.customerId);
      const area = booking.areaId
        ? (state.areas.find((item) => item.id === booking.areaId)?.name ?? "")
        : "";
      const table = booking.tableId
        ? (state.tables.find((item) => item.id === booking.tableId)?.name ?? "")
        : "";
      return [
        dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
        customer?.fullName,
        displayCustomerPhone(customer?.phone),
        booking.guestCount,
        area,
        table,
        bookingStatusLabel[booking.status],
        booking.note,
      ]
        .filter(Boolean)
        .join(" ");
    },
    [state.areas, state.customers, state.tables]
  );

  const sortRecords = useCallback(
    (rows: Booking[], sortStatus: DataTableSortStatus<Booking>) => {
      const getValue = (booking: Booking) => {
        if (sortStatus.columnAccessor === "customerId") {
          return state.customers.find((item) => item.id === booking.customerId)?.fullName ?? "";
        }
        if (sortStatus.columnAccessor === "areaTable") {
          if (!booking.areaId && !booking.tableId) {
            return "";
          }
          const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "";
          const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "";
          return `${area} ${table}`;
        }
        if (sortStatus.columnAccessor === "guestCount") {
          return booking.guestCount;
        }
        if (sortStatus.columnAccessor === "status") {
          return bookingStatusLabel[booking.status];
        }
        return dayjs(booking.bookingAt).valueOf();
      };
      return [...rows].sort((left, right) => {
        const leftValue = getValue(left);
        const rightValue = getValue(right);
        const compare =
          typeof leftValue === "number" && typeof rightValue === "number"
            ? leftValue - rightValue
            : String(leftValue).localeCompare(String(rightValue), "vi");
        return sortStatus.direction === "asc" ? compare : -compare;
      });
    },
    [state.areas, state.customers, state.tables]
  );

  const assignableIds = useMemo(
    () => new Set(assignPlan.assignable.map((booking) => booking.id)),
    [assignPlan.assignable]
  );

  return (
    <Stack gap="xs">
      {selectedBookings.length === 0 ? (
        <Text size="xs" c="dimmed">
          Chọn một hoặc nhiều booking (checkbox) để gán vào bàn này. Chỉ gán các suất không trùng
          giờ với nhau. Bấm dòng để mở Danh sách booking.
        </Text>
      ) : (
        <Stack gap={6}>
          <Group gap="xs" wrap="wrap">
            <Text size="xs" c="dimmed">
              Đã chọn {selectedBookings.length} booking · sẽ gán {assignPlan.assignable.length}
            </Text>
            {skippedCount > 0 ? (
              <Badge color="yellow" variant="light" size="sm">
                Bỏ qua {skippedCount}
              </Badge>
            ) : null}
          </Group>
          {skippedCount > 0 ? (
            <Alert color="yellow" variant="light" title="Một số booking không gán được">
              <Stack gap={4}>
                {assignPlan.skippedSelectionOverlap.length > 0 ? (
                  <Text size="xs">
                    {assignPlan.skippedSelectionOverlap.length} booking trùng khung giờ với suất
                    khác trong lựa chọn.
                  </Text>
                ) : null}
                {assignPlan.skippedTableConflict.length > 0 ? (
                  <Text size="xs">
                    {assignPlan.skippedTableConflict.length} booking trùng khung giờ với booking
                    đã có trên bàn.
                  </Text>
                ) : null}
                {assignPlan.skippedOverCapacity.length > 0 ? (
                  <Text size="xs">
                    {assignPlan.skippedOverCapacity.length} booking vượt sức chứa bàn ({tableSeats}{" "}
                    ghế).
                  </Text>
                ) : null}
              </Stack>
            </Alert>
          ) : null}
        </Stack>
      )}
      <PortalDataTable<Booking>
        records={records}
        idAccessor="id"
        getRecordSearchValue={getRecordSearchValue}
        sortRecords={sortRecords}
        defaultSort={{ columnAccessor: "bookingAt", direction: "asc" }}
        searchPlaceholder="Khách, SĐT, giờ đặt, khu vực..."
        noRecordsText="Không có booking chờ trong phạm vi chi nhánh hiện tại."
        minHeight={220}
        defaultRecordsPerPage={8}
        selectedRecords={selectedBookings}
        onSelectedRecordsChange={(next) => {
          if (!disabled) {
            onSelectedBookingsChange(next);
          }
        }}
        onRowClick={({ record }) => {
          if (!disabled && onNavigateToBookingList) {
            onNavigateToBookingList(record);
          }
        }}
        rowStyle={(record) => {
          const isSelected = selectedBookings.some((booking) => booking.id === record.id);
          const willAssign = isSelected && assignableIds.has(record.id);
          const willSkip = isSelected && !assignableIds.has(record.id);
          return mergeRowStyles(
            onNavigateToBookingList && !disabled ? { cursor: "pointer" } : undefined,
            willAssign ? { backgroundColor: "var(--mantine-color-brand-light)" } : undefined,
            willSkip ? { backgroundColor: "var(--mantine-color-yellow-light)" } : undefined
          );
        }}
        columns={[
          {
            accessor: "bookingAt",
            title: "Giờ đặt",
            sortable: true,
            render: (booking) => dayjs(booking.bookingAt).format("HH:mm DD/MM/YYYY"),
          },
          {
            accessor: "customerId",
            title: "Khách",
            sortable: true,
            render: (booking) => {
              const customer = state.customers.find((item) => item.id === booking.customerId);
              return (
                <Stack gap={2}>
                  <Text size="sm">{customer?.fullName ?? "Khách vãng lai"}</Text>
                  <Text size="xs" c="dimmed">
                    {displayCustomerPhone(customer?.phone)}
                  </Text>
                </Stack>
              );
            },
          },
          {
            accessor: "guestCount",
            title: "Số khách",
            sortable: true,
          },
          {
            accessor: "areaTable",
            title: "Khu vực / Bàn",
            sortable: true,
            render: (booking) => {
              if (!booking.areaId && !booking.tableId) {
                return (
                  <Text size="sm" c="dimmed">
                    Chưa gán
                  </Text>
                );
              }
              const area = state.areas.find((item) => item.id === booking.areaId);
              const table = state.tables.find((item) => item.id === booking.tableId);
              return `${area?.name ?? "—"} · ${table?.name ?? "—"}`;
            },
          },
          {
            accessor: "status",
            title: "Trạng thái",
            sortable: true,
            render: (booking) => (
              <Badge color={bookingStatusColor[booking.status]} variant="light" size="sm">
                {bookingStatusLabel[booking.status]}
              </Badge>
            ),
          },
        ]}
      />
    </Stack>
  );
}
