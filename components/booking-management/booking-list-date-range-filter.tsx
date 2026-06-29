"use client";

import { useEffect, useState } from "react";
import { Stack } from "@mantine/core";
import { DatePicker } from "@mantine/dates";

export function BookingListDateRangeFilter(props: {
  startDate: string;
  endDate: string;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  layout?: "default" | "panel";
}) {
  const {
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange,
    size = "sm",
    disabled = false,
    layout = "default",
  } = props;
  const isPanel = layout === "panel";

  const [pickerValue, setPickerValue] = useState<[string | null, string | null]>([
    startDate || null,
    endDate || null,
  ]);

  useEffect(() => {
    setPickerValue([startDate || null, endDate || null]);
  }, [startDate, endDate]);

  const handleRangeChange = (value: [string | null, string | null]) => {
    if (disabled) {
      return;
    }

    const [start, end] = value;
    setPickerValue(value);

    if (!start || !end) {
      return;
    }

    onStartDateChange(start);
    onEndDateChange(end);
  };

  return (
    <Stack
      w={isPanel ? "auto" : "100%"}
      style={{
        ...(isPanel ? { flexShrink: 0 } : undefined),
        ...(disabled ? { pointerEvents: "none", opacity: 0.6 } : undefined),
      }}
      aria-disabled={disabled || undefined}
    >
      <DatePicker
        type="range"
        value={pickerValue}
        onChange={handleRangeChange}
        allowSingleDateInRange
        fullWidth={!isPanel}
        size={isPanel ? "xs" : size}
      />
    </Stack>
  );
}
