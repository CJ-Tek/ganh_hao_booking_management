import type { CSSProperties } from "react";

export const BOOKING_ROW_BUSY_CLASS = "booking-row-busy";

export function bookingRowBusyStyle(isBusy: boolean): CSSProperties | undefined {
  if (!isBusy) {
    return undefined;
  }
  return {
    opacity: 0.65,
    pointerEvents: "none",
  };
}

export function mergeRowStyles(
  ...styles: (CSSProperties | undefined)[]
): CSSProperties | undefined {
  const merged = styles.filter((style): style is CSSProperties => style != null);
  if (merged.length === 0) {
    return undefined;
  }
  return Object.assign({}, ...merged);
}

export function bookingListRowStyle(
  bookingId: string,
  options: {
    busyBookingId: string | null;
    focusBookingId?: string | null;
    focusPulse?: { cycleMs: number; cycles: number };
    extra?: CSSProperties;
  }
): CSSProperties | undefined {
  const { busyBookingId, focusBookingId, focusPulse, extra } = options;
  const isBusy = busyBookingId === bookingId;
  const isFocus = focusBookingId === bookingId && focusPulse != null;

  return mergeRowStyles(
    extra,
    bookingRowBusyStyle(isBusy),
    isFocus
      ? {
          animation: `booking-list-row-pulse ${focusPulse.cycleMs}ms ease-in-out ${focusPulse.cycles} forwards`,
        }
      : undefined
  );
}

export function bookingCardBusyProps(isBusy: boolean): {
  className?: string;
  style?: CSSProperties;
} {
  if (!isBusy) {
    return {};
  }
  return {
    className: BOOKING_ROW_BUSY_CLASS,
    style: bookingRowBusyStyle(true),
  };
}
