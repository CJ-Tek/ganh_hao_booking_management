"use client";

import dayjs from "dayjs";
import {
  Anchor,
  Badge,
  Divider,
  Drawer,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
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
import { PORTAL_MODAL_DETAIL_Z_INDEX } from "@/lib/portal-z-index";
import { usePortalCompact } from "@/lib/use-portal-compact";
import { type Booking } from "@/lib/types";
import classes from "./booking-order-detail-modal.module.css";

function bookingLastEditorName(
  booking: Pick<Booking, "lastEditedByUserId">,
  users: { id: string; fullName: string }[]
): string {
  if (!booking.lastEditedByUserId) {
    return "—";
  }
  return users.find((item) => item.id === booking.lastEditedByUserId)?.fullName ?? "Không rõ";
}

function DesktopDetailField(props: { label: string; value: ReactNode }) {
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

function CompactDetailRow(props: { label: string; value: ReactNode }) {
  return (
    <div className={classes.detailRow}>
      <span className={classes.detailLabel}>{props.label}</span>
      <div className={classes.detailValue}>{props.value}</div>
    </div>
  );
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
    showEdit = true,
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
        const statusColor =
          source === "today" && receptionStatus
            ? receptionStatus.color
            : bookingStatusColor[bookingLive.status];
        const statusLabel =
          source === "today" && receptionStatus
            ? receptionStatus.label
            : bookingStatusLabel[bookingLive.status];
        const guestLabel = isGuestCountSpecified(bookingLive)
          ? `${bookingLive.guestCount} khách`
          : "Chưa rõ";
        const phone = displayCustomerPhone(customer?.phone);
        const bookingAt = dayjs(bookingLive.bookingAt);
        const showActions =
          bookingLive.status !== "cancelled" &&
          bookingLive.status !== "completed" &&
          bookingLive.status !== "no_show";
        const actions = showActions ? (
          <BookingRowActions
            booking={bookingLive}
            size="sm"
            layout={isCompact ? "drawer" : "inline"}
            showEdit={showEdit}
            busy={isBookingRowBusy(bookingLive.id)}
            onEdit={onEdit}
            onChangeTable={onChangeTable}
            onAssign={onAssign}
            onCheckIn={onCheckIn}
            onComplete={onComplete}
            onCancel={onCancel}
          />
        ) : null;

        if (isCompact) {
          return (
            <div className={classes.sheet}>
              <div className={classes.handle} aria-hidden />

              <div
                className={classes.hero}
                style={{ borderLeftColor: `var(--mantine-color-${statusColor}-6)` }}
              >
                <div className={classes.heroTop}>
                  <div style={{ minWidth: 0 }}>
                    <Text className={classes.heroTime} fw={800} size="xl">
                      {bookingAt.format("HH:mm")}
                    </Text>
                    <Text className={classes.heroDate} size="sm" c="dimmed">
                      {bookingAt.format("DD/MM/YYYY")}
                    </Text>
                  </div>
                  <Badge color={statusColor} variant="filled" size="lg" style={{ flexShrink: 0 }}>
                    {statusLabel}
                  </Badge>
                </div>

                <div className={classes.factGrid}>
                  <div className={classes.factCell}>
                    <span className={classes.factLabel}>Khách</span>
                    <span className={classes.factValue}>{guestLabel}</span>
                  </div>
                  <div className={classes.factCell}>
                    <span className={classes.factLabel}>Bàn</span>
                    <span className={classes.factValue}>{locationLine}</span>
                  </div>
                  <div className={classes.factCell}>
                    <span className={classes.factLabel}>Liên hệ</span>
                    <span className={classes.factValue}>
                      {phone !== "—" ? (
                        <Anchor href={`tel:${phone}`} size="sm" fw={600} underline="hover">
                          {phone}
                        </Anchor>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div className={classes.detailsCard}>
                {source === "list" ? (
                  <CompactDetailRow
                    label="Giờ check-in"
                    value={
                      bookingLive.checkedInAt ? (
                        <Text size="sm" fw={500}>
                          {dayjs(bookingLive.checkedInAt).format("HH:mm · DD/MM/YYYY")}
                        </Text>
                      ) : (
                        <Text size="sm" c="dimmed">
                          Chưa check-in
                        </Text>
                      )
                    }
                  />
                ) : null}
                {todayGuestTypeLabel ? (
                  <CompactDetailRow
                    label="Loại khách"
                    value={<Text size="sm">{todayGuestTypeLabel}</Text>}
                  />
                ) : null}
                <CompactDetailRow
                  label={source === "today" ? "Người nhận" : "Người tạo"}
                  value={<Text size="sm">{creator}</Text>}
                />
                <CompactDetailRow
                  label="Người sửa"
                  value={<Text size="sm">{bookingLastEditorName(bookingLive, state.users)}</Text>}
                />
                <CompactDetailRow
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
              </div>

              {note ? (
                <div className={classes.noteBox}>
                  <span className={classes.noteLabel}>Ghi chú</span>
                  <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                    {note}
                  </Text>
                </div>
              ) : null}

              {actions ? <div className={classes.actions}>{actions}</div> : null}
            </div>
          );
        }

        return (
          <Stack gap="md">
            <Group justify="flex-end">
              <Badge color={statusColor} variant="light" size="lg">
                {statusLabel}
              </Badge>
            </Group>
            <Stack gap="sm">
              <DesktopDetailField
                label="Giờ đặt"
                value={
                  <Text size="sm" fw={500}>
                    {bookingAt.format("HH:mm · DD/MM/YYYY")}
                  </Text>
                }
              />
              {source === "list" ? (
                <DesktopDetailField
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
              <DesktopDetailField
                label="Số điện thoại"
                value={<Text size="sm">{phone}</Text>}
              />
              <DesktopDetailField label="Khu vực / Bàn" value={<Text size="sm">{locationLine}</Text>} />
              <DesktopDetailField label="Số khách" value={<Text size="sm">{guestLabel}</Text>} />
              {todayGuestTypeLabel ? (
                <DesktopDetailField
                  label="Loại khách"
                  value={<Text size="sm">{todayGuestTypeLabel}</Text>}
                />
              ) : null}
              <DesktopDetailField
                label={source === "today" ? "Người nhận" : "Người tạo"}
                value={<Text size="sm">{creator}</Text>}
              />
              <DesktopDetailField
                label="Người sửa"
                value={<Text size="sm">{bookingLastEditorName(bookingLive, state.users)}</Text>}
              />
              <DesktopDetailField
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
              <DesktopDetailField
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
            {actions ? (
              <>
                <Divider />
                {actions}
              </>
            ) : null}
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
        size="auto"
        zIndex={PORTAL_MODAL_DETAIL_Z_INDEX}
        transitionProps={{ transition: "slide-up" }}
        classNames={{
          content: classes.drawerContent,
          body: classes.drawerBody,
          header: classes.drawerHeader,
          title: classes.drawerTitle,
        }}
      >
        {panel}
      </Drawer>
    );
  }

  return (
    <Modal
      opened={opened && bookingLive != null}
      onClose={onClose}
      title={title}
      size="lg"
      centered
      zIndex={PORTAL_MODAL_DETAIL_Z_INDEX}
    >
      {panel}
    </Modal>
  );
}
