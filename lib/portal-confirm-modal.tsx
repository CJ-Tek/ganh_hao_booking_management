"use client";

import { Button, Group, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import type { ReactNode } from "react";

export type PortalConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
};

function renderMessage(message: ReactNode) {
  return typeof message === "string" ? <Text size="sm">{message}</Text> : message;
}

/** In-app confirm dialog (replaces `window.confirm`). Resolves when the user chooses. */
export function openPortalConfirmModal(options: PortalConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    modals.openConfirmModal({
      title: options.title,
      centered: true,
      children: renderMessage(options.message),
      labels: {
        cancel: options.cancelLabel ?? "Hủy",
        confirm: options.confirmLabel ?? "Xác nhận",
      },
      confirmProps: options.confirmColor ? { color: options.confirmColor } : undefined,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

/** In-app alert dialog (replaces `window.alert`). */
export function openPortalAlertModal(options: { title: string; message: ReactNode }) {
  modals.open({
    title: options.title,
    centered: true,
    withCloseButton: true,
    closeOnClickOutside: true,
    children: (
      <Stack gap="md">
        {renderMessage(options.message)}
        <Group justify="flex-end">
          <Button onClick={() => modals.closeAll()}>Đóng</Button>
        </Group>
      </Stack>
    ),
  });
}
