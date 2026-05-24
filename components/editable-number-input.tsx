"use client";

import { NumberInput, type NumberInputProps } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { parseGuestCountFromNumberInput } from "@/components/booking-management/shared";

export type EditableNumberInputProps = Omit<
  NumberInputProps,
  "value" | "onChange" | "defaultValue" | "clampBehavior" | "hideControls"
> & {
  value?: number;
  onChange?: (value: number | undefined) => void;
  /** When true, empty or invalid input on blur falls back to `min` (default 1). */
  required?: boolean;
  allowDecimal?: boolean;
};

/**
 * Mantine NumberInput with typing-friendly behavior: no strict per-keystroke clamp,
 * hidden spinners, and optional empty state while focused.
 */
export function EditableNumberInput({
  value,
  onChange,
  required = false,
  allowDecimal = false,
  min = 1,
  max,
  onFocus,
  onBlur,
  ...rest
}: EditableNumberInputProps) {
  const [draft, setDraft] = useState<string | number | undefined>(() => value);
  const focusedRef = useRef(false);
  const minValue = typeof min === "number" ? min : 1;

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value);
    }
  }, [value]);

  const parseValue = (raw: string | number | undefined): number | undefined => {
    const parsed = parseGuestCountFromNumberInput(raw);
    if (parsed === undefined) {
      return undefined;
    }
    return allowDecimal ? parsed : Math.round(parsed);
  };

  const commitValue = (raw: string | number | undefined): number | undefined => {
    const parsed = parseValue(raw);
    if (parsed !== undefined) {
      return parsed;
    }
    if (required) {
      return minValue;
    }
    return undefined;
  };

  return (
    <NumberInput
      allowDecimal={allowDecimal}
      clampBehavior="blur"
      hideControls
      inputMode={allowDecimal ? "decimal" : "numeric"}
      min={min}
      max={max}
      {...rest}
      value={draft}
      onChange={(next) => {
        setDraft(next);
        if (next === "" || next === undefined) {
          if (!required) {
            onChange?.(undefined);
          }
          return;
        }
        const parsed = parseValue(next);
        if (parsed !== undefined) {
          onChange?.(parsed);
        }
      }}
      onFocus={(event) => {
        focusedRef.current = true;
        onFocus?.(event);
      }}
      onBlur={(event) => {
        focusedRef.current = false;
        const committed = commitValue(draft);
        setDraft(committed);
        onChange?.(committed);
        onBlur?.(event);
      }}
    />
  );
}
