import dayjs from "dayjs";

/** Chuẩn hóa số điện thoại VN (+84 → 0…). */
export function normalizeVietnamPhone(raw: string): string {
  const s = raw.replace(/[\s.-]/g, "");
  if (s.startsWith("+84")) {
    return `0${s.slice(3)}`;
  }
  if (s.startsWith("84") && s.length >= 10) {
    return `0${s.slice(2)}`;
  }
  return s;
}

export function isPlausibleVietnamPhone(normalized: string): boolean {
  return /^0[1-9]\d{8,9}$/.test(normalized);
}

export function bookingSlotKey(input: string) {
  const parsed = dayjs(input);
  if (!parsed.isValid()) {
    return null;
  }
  return {
    dayKey: parsed.format("YYYY-MM-DD"),
    timeKey: parsed.format("HH:mm"),
  };
}

export type BookingDuplicateInfo = {
  bookingId: string;
  bookingAt: string;
  guestCount: number;
  receiverFullName: string;
  receiverUserId?: string;
};

export function formatBookingDuplicateAlertMessage(
  duplicates: BookingDuplicateInfo[],
  referenceBookingAt?: string
): string | null {
  if (duplicates.length === 0) {
    return null;
  }
  const first = duplicates[0];
  const at = dayjs(first.bookingAt);
  const ref = referenceBookingAt ? dayjs(referenceBookingAt) : at;
  const slotLabel = at.isSame(dayjs(), "day")
    ? `hôm nay lúc ${at.format("HH:mm")}`
    : ref.isSame(at, "day")
      ? `lúc ${at.format("HH:mm")}`
      : `${at.format("DD/MM/YYYY")} lúc ${at.format("HH:mm")}`;
  const extraCount = duplicates.length - 1;
  const suffix = extraCount > 0 ? ` (+${extraCount} booking cùng khung)` : "";
  return `Số điện thoại này đã có booking ${slotLabel} - ${first.guestCount} khách - người nhận: ${first.receiverFullName}.${suffix}`;
}

export const DUPLICATE_BOOKING_CODE = "duplicate_booking" as const;
