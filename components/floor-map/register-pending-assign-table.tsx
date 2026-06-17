"use client";

import dayjs from "dayjs";
import { Alert, Badge, Checkbox, Group, Stack, Text } from "@mantine/core";
import { BookingCompactCard } from "@/components/booking-management/booking-compact-card";
import { useBookingListTimeSort } from "@/components/booking-management/booking-list-filters-toolbar";
import { useCallback, useMemo } from "react";
import { PortalDataTable } from "@/components/portal-data-table";
import { useAppContext } from "@/contexts/app-context";
import { mergeRowStyles } from "@/lib/busy-row-style";
import {
  displayCustomerPhone,
  pickNonOverlappingBookingsForMergeGroup,
  pickNonOverlappingBookingsForTable,
  resolveBookingArrivalTime,
  resolveBookingCreatedAt,
} from "@/lib/booking-meta";
import {
  bookingListDefaultCreatedSort,
  sortBookingsForDataTable,
} from "@/lib/booking-list-sort";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import { type Booking, type TableMergeGroup } from "@/lib/types";

export function RegisterPendingAssignTable(props: {
  records: Booking[];
  tableId?: string;
  mergeGroup?: TableMergeGroup;
  selectedBookings: Booking[];
  onSelectedBookingsChange: (bookings: Booking[]) => void;
  onNavigateToBookingList?: (booking: Booking) => void;
  disabled?: boolean;
}) {
  const {
    records,
    tableId,
    mergeGroup,
    selectedBookings,
    onSelectedBookingsChange,
    onNavigateToBookingList,
    disabled,
  } = props;
  const { state } = useAppContext();
  const { sortStatus, setSortStatus, defaultSort, timeSortFilters } = useBookingListTimeSort(
    bookingListDefaultCreatedSort
  );

  const bookingAreaTableLookup = useMemo(
    () => ({
      areas: state.areas,
      tables: state.tables,
      mergeGroups: state.mergeGroups,
    }),
    [state.areas, state.mergeGroups, state.tables]
  );

  const assignPlan = useMemo(() => {
    if (mergeGroup) {
      return pickNonOverlappingBookingsForMergeGroup(
        selectedBookings,
        mergeGroup,
        state.bookings
      );
    }
    if (!tableId) {
      return {
        assignable: [],
        skippedSelectionOverlap: [],
        skippedTableConflict: [],
      };
    }
    return pickNonOverlappingBookingsForTable(selectedBookings, tableId, state.bookings);
  }, [mergeGroup, selectedBookings, state.bookings, tableId]);

  const skippedCount =
    assignPlan.skippedSelectionOverlap.length + assignPlan.skippedTableConflict.length;

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
        dayjs(resolveBookingCreatedAt(booking)).format("HH:mm DD/MM/YYYY"),
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
    (rows: Booking[], nextSortStatus: typeof sortStatus) =>
      sortBookingsForDataTable(rows, nextSortStatus, {
        customers: state.customers,
        getAreaTableSortKey: (booking) => {
          if (!booking.areaId && !booking.tableId) {
            return "";
          }
          const area = state.areas.find((item) => item.id === booking.areaId)?.name ?? "";
          const table = state.tables.find((item) => item.id === booking.tableId)?.name ?? "";
          return `${area} ${table}`;
        },
      }),
    [state.areas, state.customers, state.tables]
  );

  const assignableIds = useMemo(
    () => new Set(assignPlan.assignable.map((booking) => booking.id)),
    [assignPlan.assignable]
  );
  const selectedIds = useMemo(
    () => new Set(selectedBookings.map((booking) => booking.id)),
    [selectedBookings]
  );

  return (
    <Stack gap="xs">
      {selectedBookings.length === 0 ? (
        <Text size="xs" c="dimmed">
          {mergeGroup
            ? `Chọn booking chờ để gán vào ${mergeGroup.mergedName}. Chỉ gán các suất không trùng giờ với nhau hoặc booking đã có trên cụm. Bấm dòng để mở Danh sách booking.`
            : "Chọn một hoặc nhiều booking (checkbox) để gán vào bàn này. Chỉ gán các suất không trùng giờ với nhau. Bấm dòng để mở Danh sách booking."}
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
                    {mergeGroup ? " đã có trên cụm hoặc bàn thành viên" : " đã có trên bàn"}.
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
        sortStatus={sortStatus}
        onSortStatusChange={setSortStatus}
        defaultSort={defaultSort}
        filters={timeSortFilters}
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
        mobileCardRender={(booking) => {
          const customer = state.customers.find((item) => item.id === booking.customerId);
          const creator =
            state.users.find((item) => item.id === booking.createdByUserId)?.fullName ??
            "Không rõ";
          const isSelected = selectedIds.has(booking.id);
          const willAssign = isSelected && assignableIds.has(booking.id);
          const willSkip = isSelected && !assignableIds.has(booking.id);
          const selectionStyle = willAssign
            ? { backgroundColor: "var(--mantine-color-brand-light)" }
            : willSkip
              ? { backgroundColor: "var(--mantine-color-yellow-light)" }
              : undefined;

          return (
            <Stack key={booking.id} gap={4}>
              <BookingCompactCard
                booking={booking}
                variant="list"
                customerName={customer?.fullName ?? "Khách vãng lai"}
                creatorName={creator}
                bookingAreaTableLookup={bookingAreaTableLookup}
                customerPhone={displayCustomerPhone(customer?.phone)}
                style={selectionStyle}
                leadingSlot={
                  <Checkbox
                    checked={isSelected}
                    disabled={disabled}
                    aria-label={`Chọn booking ${customer?.fullName ?? booking.id}`}
                    onChange={(event) => {
                      if (disabled) {
                        return;
                      }
                      const checked = event.currentTarget.checked;
                      const next = checked
                        ? [...selectedBookings, booking]
                        : selectedBookings.filter((item) => item.id !== booking.id);
                      onSelectedBookingsChange(next);
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                }
              />
              {onNavigateToBookingList ? (
                <Text
                  size="xs"
                  c={disabled ? "dimmed" : "blue"}
                  style={{ cursor: disabled ? "default" : "pointer" }}
                  onClick={() => {
                    if (!disabled) {
                      onNavigateToBookingList(booking);
                    }
                  }}
                >
                  Xem chi tiết
                </Text>
              ) : null}
            </Stack>
          );
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
            accessor: "createdAt",
            title: "Tạo lúc",
            sortable: true,
            render: (booking) =>
              dayjs(resolveBookingCreatedAt(booking)).format("HH:mm DD/MM/YYYY"),
          },
          {
            accessor: "bookingAt",
            title: "Giờ đến",
            sortable: true,
            render: (booking) =>
              dayjs(resolveBookingArrivalTime(booking)).format("HH:mm DD/MM/YYYY"),
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
              if (booking.mergeGroupId) {
                const group = state.mergeGroups.find((item) => item.id === booking.mergeGroupId);
                const area = state.areas.find((item) => item.id === booking.areaId);
                return `${area?.name ?? "—"} · ${group?.mergedName ?? "Cụm gộp"}`;
              }
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
