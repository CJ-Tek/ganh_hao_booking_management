"use client";

import dayjs from "dayjs";
import { Stack, TextInput } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";

export function bookingAtDatePart(bookingAt: string | null): string | null {
  if (!bookingAt) {
    return null;
  }
  const parsed = dayjs(bookingAt);
  return parsed.isValid() ? parsed.format("YYYY-MM-DD") : null;
}

export function bookingAtTimePart(bookingAt: string | null): string {
  if (!bookingAt) {
    return dayjs().format("HH:mm");
  }
  const parsed = dayjs(bookingAt);
  return parsed.isValid() ? parsed.format("HH:mm") : dayjs().format("HH:mm");
}

export function combineBookingAtLocal(datePart: string | null, timePart: string): string | null {
  if (!datePart) {
    return null;
  }
  const time = /^\d{2}:\d{2}$/.test(timePart) ? timePart : dayjs().format("HH:mm");
  return `${datePart}T${time}`;
}

export type BookingDateTimeFieldsProps = {
  labelDate?: string;
  labelTime?: string;
  value: string | null;
  onChange: (next: string | null) => void;
  disabled?: boolean;
  clearable?: boolean;
};

/** Modal date picker + native time input (standard across all viewports). */
export function BookingDateTimeFields(props: BookingDateTimeFieldsProps) {
  const {
    labelDate = "Ngày đến",
    labelTime = "Giờ đến",
    value,
    onChange,
    disabled = false,
    clearable = false,
  } = props;

  return (
    <Stack gap="sm">
      <DatePickerInput
        label={labelDate}
        value={bookingAtDatePart(value)}
        onChange={(dateValue) => {
          const next = combineBookingAtLocal(dateValue, bookingAtTimePart(value));
          onChange(next);
        }}
        valueFormat="DD/MM/YYYY"
        dropdownType="modal"
        clearable={clearable}
        disabled={disabled}
      />
      <TextInput
        label={labelTime}
        type="time"
        value={bookingAtTimePart(value)}
        onChange={(e) => {
          const next = combineBookingAtLocal(
            bookingAtDatePart(value) ?? dayjs().format("YYYY-MM-DD"),
            e.currentTarget.value
          );
          onChange(next);
        }}
        disabled={disabled}
      />
    </Stack>
  );
}
