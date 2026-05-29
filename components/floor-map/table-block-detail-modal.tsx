"use client";

import dayjs from "dayjs";
import {
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { useEffect } from "react";
import { TableBlockConfirmedScheduleTable } from "@/components/floor-map/table-block-confirmed-schedule-table";
import { canChangeBookingTable } from "@/components/booking-management/shared";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { bookingStatusColor, bookingStatusLabel, tableStatusLabel } from "@/lib/display";
import { inferGuestTypeLabel, stripUnknownGuestTag } from "@/lib/booking-meta";
import { formatMergeGroupDateRange } from "@/lib/merge-group-utils";
import {
  type Booking,
  type DiningTable,
  type TableBlockState,
  type TableMergeGroup,
  type TableStatus,
} from "@/lib/types";

export type TableBlockDetailModalProps = {
  opened: boolean;
  onClose: () => void;
  table: DiningTable | null;
  mergeGroup?: TableMergeGroup | null;
  mergeStatus?: TableStatus;
  blockState: TableBlockState | null;
  blockLoading: boolean;
  activeBooking: Booking | null;
  activeBookingCustomerName: string;
  isEmployee: boolean;
  bookingActionLoading: boolean;
  onNewBooking: () => void;
  onAssignPending: () => void;
  onCheckIn: () => void;
  onComplete: () => void;
  onChangeTable: () => void;
  onCancelBooking: () => void;
};

export function TableBlockDetailModal(props: TableBlockDetailModalProps) {
  const {
    opened,
    onClose,
    table,
    mergeGroup = null,
    mergeStatus = "available",
    blockState,
    blockLoading,
    activeBooking,
    activeBookingCustomerName,
    isEmployee,
    bookingActionLoading,
    onNewBooking,
    onAssignPending,
    onCheckIn,
    onComplete,
    onChangeTable,
    onCancelBooking,
  } = props;

  const isMerge = Boolean(mergeGroup);
  const displayStatus = isMerge ? mergeStatus : (table?.status ?? "available");
  const isOccupied = displayStatus === "occupied";

  useEffect(() => {
    if (!opened) {
      return;
    }
  }, [opened, table?.id, mergeGroup?.id]);

  const modalTitle = mergeGroup
    ? `${mergeGroup.mergedName} · Lịch sử booking`
    : table
      ? `Bàn ${table.name} · Lịch sử booking`
      : "Thông tin bàn";

  const targetReady = Boolean(table || mergeGroup);

  return (
    <PortalStandardModal
      opened={opened}
      onClose={onClose}
      title={modalTitle}
      size="xl"
      centered
      overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
    >
      {targetReady ? (
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
            <Text size="sm" c="dimmed">
              {mergeGroup
                ? `${mergeGroup.tableIds.length} bàn · ${formatMergeGroupDateRange(mergeGroup.startDate, mergeGroup.endDate)} · ${tableStatusLabel[displayStatus]}`
                : tableStatusLabel[displayStatus]}
            </Text>
            {blockLoading ? (
              <Group gap={6}>
                <Loader size="xs" />
                <Text size="xs" c="dimmed">
                  Đang tải lịch...
                </Text>
              </Group>
            ) : blockState ? (
              <Text size="xs" c="dimmed">
                Khung giờ: {dayjs(blockState.slotStartTime).format("HH:mm DD/MM")} –{" "}
                {dayjs(blockState.slotEndTime).format("HH:mm DD/MM")}
              </Text>
            ) : null}
          </Group>

          {!isEmployee ? (
            <Group gap="xs">
              {displayStatus === "occupied" || displayStatus === "hold" ? (
                <Button variant="filled" color="brand" size="compact-sm" onClick={onNewBooking}>
                  Đặt bàn mới
                </Button>
              ) : null}
              {displayStatus === "hold" ? (
                <Button variant="filled" color="blue" size="compact-sm" onClick={onAssignPending}>
                  {isMerge ? "Gán booking chờ vào cụm này" : "Gán booking chờ vào bàn này"}
                </Button>
              ) : null}
            </Group>
          ) : null}

          {activeBooking ? (
            <Stack gap="xs">
              <Text fw={600} size="sm">
                Booking hiện tại · {activeBookingCustomerName || "—"}
              </Text>
              <Group gap="lg" wrap="wrap">
                <Text size="sm">
                  Giờ đến:{" "}
                  {dayjs(activeBooking.startTime ?? activeBooking.bookingAt).format(
                    "HH:mm DD/MM/YYYY"
                  )}
                </Text>
                <Text size="sm">
                  Kết thúc: {dayjs(activeBooking.endTime).format("HH:mm DD/MM/YYYY")}
                </Text>
                <Text size="sm">Số khách: {activeBooking.guestCount}</Text>
                <Text size="sm">Loại khách: {inferGuestTypeLabel(activeBooking)}</Text>
              </Group>
              {activeBooking.checkedInAt ? (
                <Text size="sm" c="dimmed">
                  Check-in: {dayjs(activeBooking.checkedInAt).format("HH:mm DD/MM/YYYY")}
                </Text>
              ) : null}
              <Text size="sm" c="dimmed">
                Ghi chú: {stripUnknownGuestTag(activeBooking.note) ?? "—"}
              </Text>
              <Badge
                color={bookingStatusColor[activeBooking.status]}
                variant="light"
                w="fit-content"
              >
                {bookingStatusLabel[activeBooking.status]}
              </Badge>
              <Group justify="flex-end" gap="xs">
                {isEmployee ? (
                  (activeBooking.status === "checked_in" ||
                    activeBooking.status === "seated") &&
                  isOccupied ? (
                    <Button
                      size="xs"
                      variant="filled"
                      color="green"
                      loading={bookingActionLoading}
                      onClick={onComplete}
                    >
                      Hoàn thành
                    </Button>
                  ) : null
                ) : (
                  <>
                    {canChangeBookingTable(activeBooking) ? (
                      <Button
                        size="xs"
                        variant="light"
                        color="blue"
                        loading={bookingActionLoading}
                        onClick={onChangeTable}
                      >
                        Đổi bàn
                      </Button>
                    ) : null}
                    {!isOccupied
                      ? (() => {
                          const checkInDisabled = activeBooking.status !== "confirmed";
                          const checkInBtn = (
                            <Button
                              size="xs"
                              variant="filled"
                              color="green"
                              disabled={checkInDisabled}
                              loading={bookingActionLoading}
                              onClick={onCheckIn}
                            >
                              Check-in
                            </Button>
                          );
                          return checkInDisabled ? (
                            <Tooltip label="Chỉ check-in khi booking đã xác nhận." withArrow>
                              <span style={{ display: "inline-flex" }}>{checkInBtn}</span>
                            </Tooltip>
                          ) : (
                            checkInBtn
                          );
                        })()
                      : null}
                    <Button
                      size="xs"
                      variant="filled"
                      color={
                        activeBooking.status === "checked_in" ||
                        activeBooking.status === "seated"
                          ? "green"
                          : "red"
                      }
                      disabled={
                        activeBooking.status === "cancelled" ||
                        activeBooking.status === "completed" ||
                        activeBooking.status === "no_show"
                      }
                      loading={bookingActionLoading}
                      onClick={() => {
                        if (
                          activeBooking.status === "checked_in" ||
                          activeBooking.status === "seated"
                        ) {
                          onComplete();
                        } else if (
                          activeBooking.status !== "cancelled" &&
                          activeBooking.status !== "completed" &&
                          activeBooking.status !== "no_show"
                        ) {
                          onCancelBooking();
                        }
                      }}
                    >
                      {activeBooking.status === "checked_in" ||
                      activeBooking.status === "seated"
                        ? "Hoàn thành"
                        : "Hủy booking"}
                    </Button>
                  </>
                )}
              </Group>
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">
              {isMerge
                ? "Không có booking đang hoạt động trên cụm gộp này."
                : "Không có booking đang hoạt động trên bàn này."}
            </Text>
          )}

          <Divider />

          <Stack gap="xs">
            <Text fw={600} size="sm">
              Lịch đặt bàn sắp tới
            </Text>
            <Text size="xs" c="dimmed">
              {isMerge
                ? "Các booking đã gán cụm gộp từ hôm nay trở đi (đã xác nhận / đang phục vụ)."
                : "Các booking đã gán bàn từ hôm nay trở đi (đã xác nhận / đang phục vụ)."}
            </Text>
            <TableBlockConfirmedScheduleTable records={blockState?.confirmedSchedule ?? []} />
          </Stack>
        </Stack>
      ) : null}
    </PortalStandardModal>
  );
}
