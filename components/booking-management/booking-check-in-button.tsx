"use client";

import { Button, Tooltip } from "@mantine/core";
import type { CSSProperties } from "react";

export function BookingCheckInButton(props: {
  size: "compact-xs" | "sm";
  disabled: boolean;
  loading?: boolean;
  onCheckIn: () => void;
  style?: CSSProperties;
  fullWidth?: boolean;
}) {
  const { size, disabled, loading = false, onCheckIn, style, fullWidth = false } = props;
  const btn = (
    <Button
      size={size}
      variant={disabled ? "default" : "filled"}
      color={disabled ? undefined : "green"}
      onClick={() => void onCheckIn()}
      disabled={disabled || loading}
      loading={loading}
      style={style}
      fullWidth={fullWidth}
    >
      Check-in
    </Button>
  );
  if (!disabled) {
    return btn;
  }
  return (
    <Tooltip label="Chỉ check-in khi booking đã xác nhận." withArrow>
      <span style={{ display: "inline-flex", minWidth: 0, ...style }}>{btn}</span>
    </Tooltip>
  );
}
