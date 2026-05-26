"use client";

import dayjs from "dayjs";
import { Badge, Divider, Drawer, Group, Modal, Stack, Text } from "@mantine/core";
import { useMemo, type ReactNode } from "react";
import { BookingRowActions } from "@/components/booking-management/booking-row-actions";
import { useAppContext } from "@/contexts/app-context";
import { bookingStatusColor, bookingStatusLabel } from "@/lib/display";
import {
  displayCustomerPhone,
  formatBookingAreaTable,
  formatTodayBookingAreaTable,
  getReceptionBookingStatus,
  inferGuestTypeLabel,
  isGuestCountSpecified,
  stripUnknownGuestTag,
} from "@/lib/booking-meta";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking } from "@/lib/types";

function BookingDetailField(props: { label: string; value: ReactNode }) {
  const { label, value } = props;
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
      <Text size="sm" c="dimmed" style={{ flexShrink: 0 }}>
        {label}
      </Text>
      <div style={{ minWidth: 0, flex: 1, textAlign: "right" }}>{value}</div>
    </Group>
  );
}

function bookingLastEditorName(
  booking: Pick<Booking, "lastEditedByUserId">,
  users: { id: string; fullName: string }[]
): string {
  if (!booking.lastEditedByUserId) {
    return "—";
  }
  return users.find((item) => item.id === booking.lastEditedByUserId)?.fullName ?? "Không rõ";
}

export type BookingOrderDetailModalProps = {
  booking: Booking | null;
  opened: boolean;
  onClose: () => void;
  source: "list" | "today";
  receptionThresholds?: {
    groupPartyGuestThreshold: number;
    repeatCustomerMinCompleted: number;
    receptionArrivalGraceMinutes: number;
    noShowGraceMinutes: number;
  };
  completedBookingsByCustomer?: Map<string, number>;
  isBookingRowBusy: (bookingId: string) => boolean;
  showEdit?: boolean;
  onEdit: (booking: Booking) => void;
  onChangeTable: (booking: Booking) => void;
  onAssign: (booking: Booking) => void;
  onCheckIn: (bookingId: string) => void;
  onComplete: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
};

export function BookingOrderDetailModal(props: BookingOrderDetailModalProps) {
  const {
    booking,
    opened,
    onClose,
    source,
    receptionThresholds,
    completedBookingsByCustomer,
    isBookingRowBusy,
    showEdit = source === "list",
    onEdit,
    onChangeTable,
    onAssign,
    onCheckIn,
    onComplete,
    onCancel,
  } = props;

  const { state } = useAppContext();
  const isCompact = usePortalCompact();

  const bookingLive = useMemo(() => {
    if (!booking) {
      return null;
    }
    return state.bookings.find((item) => item.id === booking.id) ?? booking;
  }, [booking, state.bookings]);

  const bookingAreaTableLookup = useMemo(
    () => ({
      areas: state.areas,
      tables: state.tables,
      mergeGroups: state.mergeGroups,
    }),
    [state.areas, state.mergeGroups, state.tables]
  );

  const title = bookingLive
    ? (state.customers.find((item) => item.id === bookingLive.customerId)?.fullName ??
      "Chi tiết booking")
    : "Chi tiết booking";

  const panel =
    bookingLive && opened ? (
      (() => {
        const customer = state.customers.find((item) => item.id === bookingLive.customerId);
        const locationLine =
          source === "today"
            ? formatTodayBookingAreaTable(bookingLive, bookingAreaTableLookup)
            : formatBookingAreaTable(bookingLive, bookingAreaTableLookup, {
                tableNamePrefix: true,
              });
        const creator =
          state.users.find((item) => item.id === bookingLive.createdByUserId)?.fullName ??
          "Không rõ";
        const note = stripUnknownGuestTag(bookingLive.note);
        const receptionStatus =
          receptionThresholds != null
            ? getReceptionBookingStatus(bookingLive, receptionThresholds)
            : null;
        const todayGuestTypeLabel =
          source === "today" && receptionThresholds != null
            ? inferGuestTypeLabel(bookingLive, {
                completedBookingCountForCustomer:
                  completedBookingsByCustomer?.get(bookingLive.customerId) ?? 0,
                thresholds: receptionThresholds,
              })
            : null;
        const statusBadge =
          source === "today" && receptionStatus ? (
            <Badge color={receptionStatus.color} variant="light" size="lg">
              {receptionStatus.label}
            </Badge>
          ) : (
            <Badge color={bookingStatusColor[bookingLive.status]} variant="light" size="lg">
              {bookingStatusLabel[bookingLive.status]}
            </Badge>
          );

        return (
          <Stack gap="md">
            <Group justify="flex-end">{statusBadge}</Group>
            <Stack gap="sm">
              <BookingDetailField
                label="Giờ đặt"
                value={
                  <Text size="sm" fw={500}>
                    {dayjs(bookingLive.bookingAt).format("HH:mm · DD/MM/YYYY")}
                  </Text>
                }
              />
              {source === "list" ? (
                <BookingDetailField
                  label="Giờ check-in"
                  value={
                    bookingLive.checkedInAt ? (
                      <Text size="sm">
                        {dayjs(bookingLive.checkedInAt).format("HH:mm · DD/MM/YYYY")}
                      </Text>
                    ) : (
                      <Text size="sm" c="dimmed">
                        —
                      </Text>
                    )
                  }
                />
              ) : null}
              <BookingDetailField
                label="Số điện thoại"
                value={<Text size="sm">{displayCustomerPhone(customer?.phone)}</Text>}
              />
              <BookingDetailField
                label="Khu vực / Bàn"
                value={<Text size="sm">{locationLine}</Text>}
              />
              <BookingDetailField
                label="Số khách"
                value={
                  <Text size="sm">
                    {isGuestCountSpecified(bookingLive)
                      ? `${bookingLive.guestCount} khách`
                      : "Chưa rõ"}
                  </Text>
                }
              />
              {todayGuestTypeLabel ? (
                <BookingDetailField
                  label="Loại khách"
                  value={<Text size="sm">{todayGuestTypeLabel}</Text>}
                />
              ) : null}
              <BookingDetailField
                label={source === "today" ? "Người nhận" : "Người tạo"}
                value={<Text size="sm">{creator}</Text>}
              />
              <BookingDetailField
                label="Người sửa"
                value={<Text size="sm">{bookingLastEditorName(bookingLive, state.users)}</Text>}
              />
              <BookingDetailField
                label="Lúc sửa"
                value={
                  bookingLive.lastEditedAt ? (
                    <Text size="sm">
                      {dayjs(bookingLive.lastEditedAt).format("HH:mm · DD/MM/YYYY")}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )
                }
              />
              <BookingDetailField
                label="Ghi chú"
                value={
                  note ? (
                    <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                      {note}
                    </Text>
                  ) : (
                    <Text size="sm" c="dimmed">
                      —
                    </Text>
                  )
                }
              />
            </Stack>
            {bookingLive.status === "cancelled" ||
            bookingLive.status === "completed" ||
            bookingLive.status === "no_show" ? null : (
              <>
                <Divider />
                <BookingRowActions
                  booking={bookingLive}
                  size="sm"
                  showEdit={showEdit}
                  busy={isBookingRowBusy(bookingLive.id)}
                  onEdit={onEdit}
                  onChangeTable={onChangeTable}
                  onAssign={onAssign}
                  onCheckIn={onCheckIn}
                  onComplete={onComplete}
                  onCancel={onCancel}
                />
              </>
            )}
          </Stack>
        );
      })()
    ) : null;

  if (isCompact) {
    return (
      <Drawer
        opened={opened && bookingLive != null}
        onClose={onClose}
        title={title}
        position="bottom"
        size="92%"
        transitionProps={{ transition: "slide-up" }}
        styles={{
          content: { height: "92dvh", maxHeight: "92dvh" },
          body: { paddingTop: 4 },
        }}
      >
        {panel}
      </Drawer>
    );
  }

  return (
    <Modal opened={opened && bookingLive != null} onClose={onClose} title={title} size="lg" centered>
      {panel}
    </Modal>
  );
}
