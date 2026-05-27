"use client";

import dayjs from "dayjs";
import {
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { TableBlockConfirmedScheduleTable } from "@/components/floor-map/table-block-confirmed-schedule-table";
import { WaitlistEntryDetailModal } from "@/components/booking-management/waitlist-entry-detail-modal";
import { TableBlockWaitlistTable } from "@/components/floor-map/table-block-waitlist-table";
import { canChangeBookingTable } from "@/components/booking-management/shared";
import { PortalStandardModal } from "@/components/portal-standard-modal/portal-standard-modal";
import { bookingStatusColor, bookingStatusLabel, tableStatusLabel } from "@/lib/display";
import { inferGuestTypeLabel, stripUnknownGuestTag } from "@/lib/booking-meta";
import { formatMergeGroupDateRange } from "@/lib/merge-group-utils";
import {
  type Booking,
  type DiningTable,
  type BookingWaitlistEntry,
  type TableBlockState,
  type TableMergeGroup,
  type TableStatus,
} from "@/lib/types";

type HistorySubTab = "schedule" | "waitlist";

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
  waitlistConfirmLoadingId: string | null;
  onNewBooking: () => void;
  onAssignPending: () => void;
  onCheckIn: () => void;
  onComplete: () => void;
  onChangeTable: () => void;
  onCancelBooking: () => void;
  onConfirmWaitlistOffer: (entry: BookingWaitlistEntry) => void | Promise<void>;
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
    waitlistConfirmLoadingId,
    onNewBooking,
    onAssignPending,
    onCheckIn,
    onComplete,
    onChangeTable,
    onCancelBooking,
    onConfirmWaitlistOffer,
  } = props;

  const [historySubTab, setHistorySubTab] = useState<HistorySubTab>("schedule");
  const [waitlistDetailEntry, setWaitlistDetailEntry] = useState<BookingWaitlistEntry | null>(
    null
  );
  const waitlistCount = blockState?.waitlistQueue.length ?? 0;
  const isMerge = Boolean(mergeGroup);
  const displayStatus = isMerge ? mergeStatus : (table?.status ?? "available");
  const isOccupied = displayStatus === "occupied";

  useEffect(() => {
    if (opened) {
      setHistorySubTab("schedule");
    } else {
      setWaitlistDetailEntry(null);
    }
  }, [opened, table?.id, mergeGroup?.id]);

  const modalTitle = mergeGroup
    ? `${mergeGroup.mergedName} · Lịch sử booking & hàng chờ`
    : table
      ? `Bàn ${table.name} · Lịch sử booking & hàng chờ`
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
                ? `Tổng ${mergeGroup.totalCapacity} chỗ · ${mergeGroup.tableIds.length} bàn · ${formatMergeGroupDateRange(mergeGroup.startDate, mergeGroup.endDate)} · ${tableStatusLabel[displayStatus]}`
                : `${table!.seats} ghế · ${tableStatusLabel[displayStatus]}`}
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
              Lịch sử booking & hàng chờ
            </Text>
            <Tabs
              value={historySubTab}
              onChange={(value) =>
                setHistorySubTab(value === "waitlist" ? "waitlist" : "schedule")
              }
            >
              <Tabs.List grow>
                <Tabs.Tab value="schedule">Lịch đặt bàn sắp tới</Tabs.Tab>
                <Tabs.Tab value="waitlist">Hàng chờ ({waitlistCount})</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="schedule" pt="sm">
                <Stack gap="xs">
                  <Text size="xs" c="dimmed">
                    {isMerge
                      ? "Các booking đã gán cụm gộp từ hôm nay trở đi (đã xác nhận / đang phục vụ)."
                      : "Các booking đã gán bàn từ hôm nay trở đi (đã xác nhận / đang phục vụ)."}
                  </Text>
                  <TableBlockConfirmedScheduleTable
                    records={blockState?.confirmedSchedule ?? []}
                  />
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="waitlist" pt="sm">
                <Stack gap="xs">
                  <Text size="xs" c="dimmed">
                    {isMerge
                      ? "Khách xếp hàng khi khung giờ cụm gộp đã kín (gồm hàng chờ trên từng bàn thành viên)."
                      : "Khách xếp hàng khi khung giờ đã kín (khác với booking đã xác nhận ở trên)."}
                  </Text>
                  <TableBlockWaitlistTable
                    records={blockState?.waitlistQueue ?? []}
                    isEmployee={isEmployee}
                    actionLoadingId={waitlistConfirmLoadingId}
                    onRowClick={setWaitlistDetailEntry}
                    showLocationColumns={false}
                  />
                  <WaitlistEntryDetailModal
                    entry={waitlistDetailEntry}
                    opened={waitlistDetailEntry != null}
                    onClose={() => setWaitlistDetailEntry(null)}
                    isEmployee={isEmployee}
                    actionLoadingId={waitlistConfirmLoadingId}
                    showLocation={false}
                    onConfirmOffer={async (entry) => {
                      await onConfirmWaitlistOffer(entry);
                      setWaitlistDetailEntry(null);
                    }}
                  />
                </Stack>
              </Tabs.Panel>
            </Tabs>
          </Stack>
        </Stack>
      ) : null}
    </PortalStandardModal>
  );
}
