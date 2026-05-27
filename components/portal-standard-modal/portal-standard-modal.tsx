"use client";

import { Modal, type ModalProps } from "@mantine/core";
import classes from "./portal-standard-modal.module.css";

export function PortalStandardModal(props: ModalProps) {
  const { classNames, ...rest } = props;
  return (
    <Modal
      {...rest}
      classNames={{
        header: classes.modalHeader,
        body: classes.modalBody,
        content: classes.modalContent,
        ...classNames,
      }}
    />
  );
}

