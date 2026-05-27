"use client";

import dayjs from "dayjs";
import { Badge, Divider, Drawer, Group, Modal, Stack, Text } from "@mantine/core";
import { useMemo, type ReactNode } from "react";
import { WaitlistRowActions, canManageWaitlistEntry } from "@/components/booking-management/waitlist-row-actions";
import {
  waitlistStatusColor,
  waitlistStatusLabel,
} from "@/components/booking-management/waitlist-status-filter-chips";
import { useAppContext } from "@/contexts/app-context";
import { displayCustomerPhone } from "@/lib/booking-meta";
import { type BookingWaitlistEntry } from "@/lib/types";
import { usePortalCompact } from "@/lib/use-portal-compact";

function WaitlistDetailField(props: { label: string; value: ReactNode }) {
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

export function WaitlistEntryDetailModal(props: {
  entry: BookingWaitlistEntry | null;
  opened: boolean;
  onClose: () => void;
  isEmployee: boolean;
  actionLoadingId?: string | null;
  showLocation?: boolean;
  onConfirmOffer: (entry: BookingWaitlistEntry) => void;
  onEdit?: (entry: BookingWaitlistEntry) => void;
  onPromote?: (entry: BookingWaitlistEntry) => void;
  onTransfer?: (entry: BookingWaitlistEntry) => void;
}) {
  const {
    entry,
    opened,
    onClose,
    isEmployee,
    actionLoadingId = null,
    showLocation = true,
    onConfirmOffer,
    onEdit,
    onPromote,
    onTransfer,
  } = props;

  const { state } = useAppContext();
  const isCompact = usePortalCompact();

  const entryLive = useMemo(() => {
    if (!entry) {
      return null;
    }
    return entry;
  }, [entry]);

  const customer = entryLive
    ? state.customers.find((item) => item.id === entryLive.customerId)
    : undefined;

  const title = customer?.fullName ?? "Chi tiết hàng chờ";

  const resolveTableLabel = (waitlistEntry: BookingWaitlistEntry) => {
    const table = state.tables.find((item) => item.id === waitlistEntry.tableId);
    const tableName = table?.name ?? "—";
    const mergeGroup = state.mergeGroups.find(
      (group) => group.status === "active" && group.tableIds.includes(waitlistEntry.tableId)
    );
    if (mergeGroup) {
      return `${tableName} · ${mergeGroup.mergedName}`;
    }
    return tableName;
  };

  const resolveAreaLabel = (waitlistEntry: BookingWaitlistEntry) => {
    const areaId =
      waitlistEntry.areaId ??
      state.tables.find((item) => item.id === waitlistEntry.tableId)?.areaId;
    if (!areaId) {
      return "—";
    }
    return state.areas.find((item) => item.id === areaId)?.name ?? "—";
  };

  const canManage =
    !isEmployee &&
    Boolean(onEdit && onPromote && onTransfer) &&
    entryLive != null &&
    canManageWaitlistEntry(entryLive);

  const panel =
    entryLive && opened ? (
      <Stack gap="md">
        <Group justify="flex-end">
          <Badge
            color={waitlistStatusColor[entryLive.status]}
            variant="light"
            size="lg"
          >
            {waitlistStatusLabel[entryLive.status]}
          </Badge>
        </Group>
        <Stack gap="sm">
          <WaitlistDetailField
            label="Vị trí hàng"
            value={
              <Text size="sm" fw={500}>
                #{entryLive.position}
              </Text>
            }
          />
          <WaitlistDetailField
            label="Chi nhánh"
            value={
              <Text size="sm">
                {state.branches.find((item) => item.id === entryLive.branchId)?.name ?? "—"}
              </Text>
            }
          />
          <WaitlistDetailField
            label="Khung giờ"
            value={
              <Text size="sm">
                {dayjs(entryLive.desiredStartTime).format("HH:mm · DD/MM/YYYY")} –{" "}
                {dayjs(entryLive.desiredEndTime).format("HH:mm")}
              </Text>
            }
          />
          {showLocation ? (
            <>
              <WaitlistDetailField
                label="Khu vực"
                value={<Text size="sm">{resolveAreaLabel(entryLive)}</Text>}
              />
              <WaitlistDetailField
                label="Bàn"
                value={<Text size="sm">{resolveTableLabel(entryLive)}</Text>}
              />
            </>
          ) : null}
          <WaitlistDetailField
            label="Số khách"
            value={<Text size="sm">{entryLive.partySize} khách</Text>}
          />
          <WaitlistDetailField
            label="Số điện thoại"
            value={<Text size="sm">{displayCustomerPhone(customer?.phone)}</Text>}
          />
          {entryLive.status === "offered" && entryLive.offerExpiresAt ? (
            <WaitlistDetailField
              label="Hết hạn suất"
              value={
                <Text size="sm">
                  {dayjs(entryLive.offerExpiresAt).format("HH:mm · DD/MM/YYYY")}
                </Text>
              }
            />
          ) : null}
          {entryLive.bookingId ? (
            <WaitlistDetailField
              label="Booking liên kết"
              value={<Text size="sm">Có — chờ xếp bàn</Text>}
            />
          ) : null}
        </Stack>
        {canManage || (!isEmployee && entryLive.status === "offered") ? (
          <>
            <Divider />
            <WaitlistRowActions
              entry={entryLive}
              size="sm"
              busy={actionLoadingId === entryLive.id}
              confirmLoading={actionLoadingId === entryLive.id}
              onEdit={canManage ? onEdit : undefined}
              onPromote={canManage ? onPromote : undefined}
              onTransfer={canManage ? onTransfer : undefined}
              onConfirmOffer={onConfirmOffer}
            />
          </>
        ) : null}
      </Stack>
    ) : null;

  if (isCompact) {
    return (
      <Drawer
        opened={opened && entryLive != null}
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
    <Modal
      opened={opened && entryLive != null}
      onClose={onClose}
      title={title}
      size="lg"
      centered
    >
      {panel}
    </Modal>
  );
}
