"use client";

import { Button, Tooltip } from "@mantine/core";

export function BookingCheckInButton(props: {
  size: "compact-xs" | "sm";
  disabled: boolean;
  loading?: boolean;
  onCheckIn: () => void;
}) {
  const { size, disabled, loading = false, onCheckIn } = props;
  const btn = (
    <Button
      size={size}
      variant={disabled ? "default" : "filled"}
      color={disabled ? undefined : "green"}
      onClick={() => void onCheckIn()}
      disabled={disabled || loading}
      loading={loading}
    >
      Check-in
    </Button>
  );
  if (!disabled) {
    return btn;
  }
  return (
    <Tooltip label="Chỉ check-in khi booking đã xác nhận." withArrow>
      <span style={{ display: "inline-flex" }}>{btn}</span>
    </Tooltip>
  );
}
