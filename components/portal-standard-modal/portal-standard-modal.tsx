"use client";

import { Modal, type ModalProps } from "@mantine/core";
import { type ReactNode } from "react";
import { usePortalModalLayoutProps } from "@/lib/use-portal-modal-layout";
import classes from "./portal-standard-modal.module.css";

export type PortalStandardModalProps = ModalProps & {
  footer?: ReactNode;
  /** Full-width notice below the modal header (does not scroll with body). */
  topNotice?: ReactNode;
};

export function PortalStandardModal({
  footer,
  topNotice,
  children,
  classNames,
  ...rest
}: PortalStandardModalProps) {
  const modalLayout = usePortalModalLayoutProps();
  const contentClassName = [classes.modalContent, "portal-standard-modal-content", classNames?.content]
    .filter(Boolean)
    .join(" ");

  return (
    <Modal
      {...modalLayout}
      {...rest}
      classNames={{
        ...classNames,
        header: classNames?.header ?? classes.modalHeader,
        body: classNames?.body ?? classes.modalBody,
        content: contentClassName,
      }}
    >
      {topNotice ? <div className={classes.modalTopNotice}>{topNotice}</div> : null}
      <div className={classes.modalBodyScroll}>{children}</div>
      {footer ? <div className={classes.modalFooter}>{footer}</div> : null}
    </Modal>
  );
}
