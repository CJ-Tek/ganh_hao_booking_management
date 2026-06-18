"use client";

import dayjs from "dayjs";
import { Group } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { usePortalCompact } from "@/lib/use-portal-compact";

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
  const isCompact = usePortalCompact();
  const isPanel = layout === "panel";
  const isFluid = isCompact || isPanel;
  const inputStyle = isFluid ? { flex: "1 1 0", minWidth: 0 } : { flexShrink: 0 };
  const inputMinWidth = isCompact ? 0 : isPanel ? "6.5rem" : 148;

  const handleStartChange = (value: string | null) => {
    if (!value) {
      return;
    }
    onStartDateChange(value);
    if (endDate && dayjs(endDate).isBefore(value, "day")) {
      onEndDateChange(value);
    }
  };

  const handleEndChange = (value: string | null) => {
    if (!value) {
      return;
    }
    onEndDateChange(value);
  };

  return (
    <Group
      gap="sm"
      wrap="nowrap"
      align="flex-end"
      w={isCompact ? "100%" : undefined}
      grow={isCompact}
      style={isPanel ? { flex: "1 1 0", minWidth: 0 } : undefined}
    >
      <DatePickerInput
        label="Từ ngày"
        value={startDate}
        onChange={handleStartChange}
        valueFormat="DD/MM/YYYY"
        dropdownType="modal"
        size={size}
        disabled={disabled}
        style={inputStyle}
        miw={inputMinWidth}
      />
      <DatePickerInput
        label="Đến ngày"
        value={endDate}
        onChange={handleEndChange}
        valueFormat="DD/MM/YYYY"
        dropdownType="modal"
        minDate={startDate ? dayjs(startDate).toDate() : undefined}
        size={size}
        disabled={disabled}
        style={inputStyle}
        miw={inputMinWidth}
      />
    </Group>
  );
}
