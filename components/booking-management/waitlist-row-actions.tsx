"use client";

import { Button, Group } from "@mantine/core";
import { type BookingWaitlistEntry } from "@/lib/types";

export function canManageWaitlistEntry(entry: BookingWaitlistEntry): boolean {
  return entry.status === "waiting" || entry.status === "offered";
}

export function WaitlistRowActions(props: {
  entry: BookingWaitlistEntry;
  busy?: boolean;
  size?: "compact-xs" | "sm";
  confirmLoading?: boolean;
  onEdit?: (entry: BookingWaitlistEntry) => void;
  onPromote?: (entry: BookingWaitlistEntry) => void;
  onTransfer?: (entry: BookingWaitlistEntry) => void;
  onConfirmOffer: (entry: BookingWaitlistEntry) => void;
}) {
  const {
    entry,
    busy = false,
    size = "compact-xs",
    confirmLoading = false,
    onEdit,
    onPromote,
    onTransfer,
    onConfirmOffer,
  } = props;

  if (!canManageWaitlistEntry(entry)) {
    return null;
  }

  const showManageActions = Boolean(onEdit && onPromote && onTransfer);

  return (
    <Group gap={6} wrap="wrap">
      {showManageActions ? (
        <>
          <Button size={size} variant="default" disabled={busy} onClick={() => onEdit!(entry)}>
            Sửa
          </Button>
          <Button
            size={size}
            variant="light"
            color="blue"
            disabled={busy}
            onClick={() => onPromote!(entry)}
          >
            Mời vào bàn
          </Button>
          <Button
            size={size}
            variant="light"
            color="grape"
            disabled={busy}
            onClick={() => onTransfer!(entry)}
          >
            Chuyển CN
          </Button>
        </>
      ) : null}
      {entry.status === "offered" ? (
        <Button
          size={size}
          variant="filled"
          color="green"
          loading={confirmLoading}
          disabled={busy && !confirmLoading}
          onClick={() => onConfirmOffer(entry)}
        >
          Xác nhận
        </Button>
      ) : null}
    </Group>
  );
}
