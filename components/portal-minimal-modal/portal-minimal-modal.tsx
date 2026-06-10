"use client";

import { Modal, type ModalProps } from "@mantine/core";
import { portalMinimalPageModalProps } from "@/lib/portal-z-index";

/** Compact centered modal on all viewports (delete confirms, short prompts). */
export function PortalMinimalModal({ classNames, ...rest }: ModalProps) {
  return (
    <Modal
      {...portalMinimalPageModalProps}
      {...rest}
      classNames={{
        ...portalMinimalPageModalProps.classNames,
        ...classNames,
        content: [portalMinimalPageModalProps.classNames.content, classNames?.content]
          .filter(Boolean)
          .join(" "),
        body: classNames?.body ?? portalMinimalPageModalProps.classNames.body,
      }}
    />
  );
}
