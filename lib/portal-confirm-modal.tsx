"use client";

import { Button, Group, Stack, Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import type { ReactNode } from "react";
import { PORTAL_MODAL_CONFIRM_Z_INDEX, portalConfirmModalProps } from "@/lib/portal-z-index";

export type PortalConfirmOptions = {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
};

export type PortalModalsConfirmModalProps = Parameters<typeof modals.openConfirmModal>[0];

function renderMessage(message: ReactNode) {
  return typeof message === "string" ? <Text size="sm">{message}</Text> : message;
}

function mergePortalConfirmModalProps(
  options: PortalModalsConfirmModalProps
): PortalModalsConfirmModalProps {
  return {
    ...portalConfirmModalProps,
    ...options,
    zIndex: PORTAL_MODAL_CONFIRM_Z_INDEX,
    classNames: {
      ...portalConfirmModalProps.classNames,
      ...options.classNames,
      content: [portalConfirmModalProps.classNames?.content, options.classNames?.content]
        .filter(Boolean)
        .join(" "),
    },
  };
}

/** Mantine confirm modal that always stacks above page `<Modal>` / `PortalStandardModal`. */
export function openPortalModalsConfirmModal(options: PortalModalsConfirmModalProps): string {
  return modals.openConfirmModal(mergePortalConfirmModalProps(options));
}

/** In-app confirm dialog (replaces `window.confirm`). Resolves when the user chooses. */
export function openPortalConfirmModal(options: PortalConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    openPortalModalsConfirmModal({
      title: options.title,
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
    ...portalConfirmModalProps,
    title: options.title,
    zIndex: PORTAL_MODAL_CONFIRM_Z_INDEX,
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
