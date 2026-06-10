"use client";

import dayjs from "dayjs";
import { Group, Text } from "@mantine/core";
import classes from "./booking-modal-context-banner.module.css";

export function BookingModalContextBanner(props: {
  customerName: string;
  bookingAt: string;
}) {
  const { customerName, bookingAt } = props;
  const visitAt = dayjs(bookingAt);

  return (
    <div className={classes.banner}>
      <Group gap={6} wrap="nowrap" align="center" style={{ minWidth: 0 }}>
        <Text size="sm" fw={700} className={classes.name}>
          {customerName}
        </Text>
        <Text size="sm" c="dimmed" aria-hidden>
          ·
        </Text>
        <Text size="sm" fw={600} c="brand" className={classes.time}>
          {visitAt.isValid() ? visitAt.format("HH:mm · DD/MM/YYYY") : "—"}
        </Text>
      </Group>
    </div>
  );
}
