"use client";

import dayjs from "dayjs";
import {
  Alert,
  Badge,
  Button,
  Card,
  Divider,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useEffect, useMemo } from "react";
import { TableBlockConfirmedScheduleTable } from "@/components/floor-map/table-block-confirmed-schedule-table";
import { canChangeBookingTable } from "@/components/booking-management/shared";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { useAppContext } from "@/contexts/app-context";
import { tableStatusLabel } from "@/lib/display";
import {
  canQueueBooking,
  getReceptionBookingStatus,
  inferGuestTypeLabel,
  stripUnknownGuestTag,
} from "@/lib/booking-meta";
import { formatMergeGroupDateRange } from "@/lib/merge-group-utils";
import { isSplitCloneTable } from "@/lib/table-split-clone-utils";
import {
  type Booking,
  type DiningTable,
  type TableBlockState,
  type TableMergeGroup,
  type TableStatus,
} from "@/lib/types";

function formatActiveBookingVisitDate(date: dayjs.Dayjs): string {
  if (date.isSame(dayjs(), "day")) {
    return "Hôm nay";
  }
  if (date.isSame(dayjs().add(1, "day"), "day")) {
    return "Ngày mai";
  }
  return date.format("DD/MM/YYYY");
}

export type TableBlockDetailModalProps = {
  opened: boolean;
  onClose: () => void;
  table: DiningTable | null;
  mergeGroup?: TableMergeGroup | null;
  mergeStatus?: TableStatus;
  /** Merge-group check-in blocked while member tables have their own seated guests. */
  mergeMemberOccupiedTableNames?: string[];
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
  onQueueBooking?: () => void;
  /** Opens merge-group member management (view mode; non-employees only). */
  onOpenMergeGroupManage?: () => void;
};

export function TableBlockDetailModal(props: TableBlockDetailModalProps) {
  const {
    opened,
    onClose,
    table,
    mergeGroup = null,
    mergeStatus = "available",
    mergeMemberOccupiedTableNames = [],
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
    onQueueBooking,
    onOpenMergeGroupManage,
  } = props;

  const { state } = useAppContext();
  const receptionThresholds = useMemo(
    () => ({
      groupPartyGuestThreshold: state.bookingRuntimeSettings.groupPartyGuestThreshold,
      repeatCustomerMinCompleted: state.bookingRuntimeSettings.repeatCustomerMinCompleted,
      receptionArrivalGraceMinutes: state.bookingRuntimeSettings.receptionArrivalGraceMinutes,
      noShowGraceMinutes: state.bookingRuntimeSettings.noShowGraceMinutes,
    }),
    [state.bookingRuntimeSettings]
  );

  const isMerge = Boolean(mergeGroup);
  const displayStatus = isMerge ? mergeStatus : (table?.status ?? "available");
  const isOccupied = displayStatus === "occupied";
  const mergeMemberOccupiedBlocksCheckIn =
    isMerge && mergeMemberOccupiedTableNames.length > 0;

  useEffect(() => {
    if (!opened) {
      return;
    }
  }, [opened, table?.id, mergeGroup?.id]);

  const tableDisplayName = mergeGroup
    ? mergeGroup.mergedName
    : table
      ? `Bàn ${table.name}`
      : null;

  const modalTitle = tableDisplayName ? (
    <Group gap="xs" wrap="wrap">
      <Text fw={700} span>
        Lịch sử booking
      </Text>
      <Text fw={700} c="blue.6" span>
        {tableDisplayName}
      </Text>
    </Group>
  ) : (
    "Thông tin bàn"
  );

  const targetReady = Boolean(table || mergeGroup);

  const upcomingScheduleRecords = useMemo(
    () =>
      (blockState?.confirmedSchedule ?? []).filter(
        (booking) => !activeBooking || booking.id !== activeBooking.id
      ),
    [activeBooking, blockState?.confirmedSchedule]
  );

  const mergeMemberOccupiedNotice =
    mergeMemberOccupiedBlocksCheckIn ? (
      <Alert color="yellow" variant="light" title="Chưa thể check-in">
        Không thể check-in cụm gộp khi còn bàn thành viên đang có khách: Bàn{" "}
        {mergeMemberOccupiedTableNames.join(", Bàn ")}.
      </Alert>
    ) : null;

  return (
    <PortalStandardModal
      opened={opened}
      onClose={onClose}
      title={modalTitle}
      size="xl"
      centered
      topNotice={mergeMemberOccupiedNotice}
      overlayProps={{ backgroundOpacity: 0.55, blur: 4 }}
    >
      {targetReady ? (
        <Stack gap="md">
          <Group justify="space-between" align="flex-start" wrap="wrap" gap="xs">
            <Text size="sm" c="dimmed">
              {mergeGroup
                ? `${mergeGroup.tableIds.length} bàn · ${formatMergeGroupDateRange(mergeGroup.startDate, mergeGroup.endDate)} · ${tableStatusLabel[displayStatus]}`
                : table && isSplitCloneTable(table) && table.splitStartDate && table.splitEndDate
                  ? `Khả dụng: ${formatMergeGroupDateRange(table.splitStartDate, table.splitEndDate)} · ${tableStatusLabel[displayStatus]}`
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
            <Group justify="space-between" align="center" wrap="wrap" gap="xs" w="100%">
              <Group gap="xs" wrap="wrap">
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
              {mergeGroup && onOpenMergeGroupManage ? (
                <Button
                  variant="light"
                  color="blue"
                  size="compact-sm"
                  onClick={onOpenMergeGroupManage}
                  style={{ marginLeft: "auto" }}
                >
                  Quản lý bàn thành viên
                </Button>
              ) : null}
            </Group>
          ) : null}

          {activeBooking ? (
            (() => {
              const receptionStatus = getReceptionBookingStatus(
                activeBooking,
                receptionThresholds
              );
              const visitStart = dayjs(
                activeBooking.startTime ?? activeBooking.bookingAt
              );
              const visitEnd = dayjs(activeBooking.endTime);
              const visitDateHeadline = formatActiveBookingVisitDate(visitStart);
              const visitDateSubLabel = visitStart.format("DD/MM/YYYY");

              return (
                <Card
                  withBorder
                  radius="md"
                  padding="md"
                  className="portal-section-card"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftStyle: "solid",
                    borderLeftColor: `var(--mantine-color-${receptionStatus.color}-6)`,
                    backgroundColor: `var(--mantine-color-${receptionStatus.color}-0)`,
                  }}
                >
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
                      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed" lh={1.2}>
                          Booking hiện tại
                        </Text>
                        <Text fw={700} size="md" c="brand" lh={1.2} style={{ wordBreak: "break-word" }}>
                          {activeBookingCustomerName || "—"}
                        </Text>
                      </Stack>
                      <Badge
                        color={receptionStatus.color}
                        variant="filled"
                        size="md"
                        style={{ flexShrink: 0 }}
                      >
                        {receptionStatus.label}
                      </Badge>
                    </Group>

                    <Group gap="xl" wrap="wrap" align="flex-start">
                      <Stack gap={4} style={{ minWidth: "8.5rem" }}>
                        <Text size="xs" fw={700} c="dimmed" lh={1.2}>
                          Giờ phục vụ
                        </Text>
                        <Text fw={700} size="lg" lh={1.1}>
                          {visitStart.format("HH:mm")} – {visitEnd.format("HH:mm")}
                        </Text>
                        <Text size="xs" c="dimmed" lh={1.35}>
                          Bắt đầu {visitStart.format("HH:mm")} · Kết thúc dự kiến{" "}
                          {visitEnd.format("HH:mm")}
                        </Text>
                      </Stack>
                      <Stack gap={4} style={{ minWidth: "7rem" }}>
                        <Text size="xs" fw={700} c="dimmed" lh={1.2}>
                          Ngày đến
                        </Text>
                        <Text fw={700} size="md" lh={1.2}>
                          {visitDateHeadline}
                        </Text>
                        {visitDateHeadline !== visitDateSubLabel ? (
                          <Text size="xs" c="dimmed" lh={1.35}>
                            {visitDateSubLabel}
                          </Text>
                        ) : null}
                      </Stack>
                    </Group>

                    <Text size="sm" lh={1.45}>
                      <Text component="span" fw={700}>
                        {activeBooking.guestCount} khách
                      </Text>
                      <Text component="span" c="dimmed">
                        {" · "}
                      </Text>
                      <Text component="span" fw={600}>
                        {inferGuestTypeLabel(activeBooking)}
                      </Text>
                    </Text>

                    <Text size="sm" lh={1.45}>
                      <Text component="span" fw={700}>
                        Ghi chú:{" "}
                      </Text>
                      <Text component="span" c="dimmed" fw={500}>
                        {stripUnknownGuestTag(activeBooking.note) ?? "—"}
                      </Text>
                    </Text>

                    <Divider />

                    <Group justify="flex-end" gap="xs">
                      {isEmployee ? (
                        (activeBooking.status === "checked_in" ||
                          activeBooking.status === "seated") &&
                        isOccupied ? (
                          <Button
                            size="sm"
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
                              size="sm"
                              variant="light"
                              color="blue"
                              loading={bookingActionLoading}
                              onClick={onChangeTable}
                            >
                              Đổi bàn
                            </Button>
                          ) : null}
                          {canQueueBooking(activeBooking) && onQueueBooking ? (
                            <Button
                              size="sm"
                              variant="light"
                              color="yellow"
                              loading={bookingActionLoading}
                              onClick={onQueueBooking}
                            >
                              Chờ
                            </Button>
                          ) : null}
                          {!isOccupied ? (
                            <Button
                              size="sm"
                              variant="filled"
                              color="green"
                              disabled={
                                activeBooking.status !== "confirmed" ||
                                mergeMemberOccupiedBlocksCheckIn
                              }
                              loading={bookingActionLoading}
                              onClick={onCheckIn}
                            >
                              Check-in
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
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
                </Card>
              );
            })()
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
              Lịch đặt bàn sắp tới ({upcomingScheduleRecords.length})
            </Text>
            <Text size="xs" c="dimmed">
              {isMerge
                ? "Các booking đã gán cụm gộp từ hôm nay trở đi (đã xác nhận / đang phục vụ)."
                : "Các booking đã gán bàn từ hôm nay trở đi (đã xác nhận / đang phục vụ)."}
            </Text>
            <TableBlockConfirmedScheduleTable records={upcomingScheduleRecords} />
          </Stack>
        </Stack>
      ) : null}
    </PortalStandardModal>
  );
}
