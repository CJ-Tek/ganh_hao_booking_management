"use client";

import { Modal, type ModalProps } from "@mantine/core";
import { type ReactNode } from "react";
import classes from "./portal-standard-modal.module.css";

export type PortalStandardModalProps = ModalProps & {
  footer?: ReactNode;
};

export function PortalStandardModal({
  footer,
  children,
  classNames,
  ...rest
}: PortalStandardModalProps) {
  return (
    <Modal
      {...rest}
      classNames={{
        header: classes.modalHeader,
        body: classes.modalBody,
        content: classes.modalContent,
        ...classNames,
      }}
    >
      <div className={classes.modalBodyScroll}>{children}</div>
      {footer ? <div className={classes.modalFooter}>{footer}</div> : null}
    </Modal>
  );
}
