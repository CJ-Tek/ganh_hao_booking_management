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

export function normalizeVietnameseName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isLikelySameGuestName(left: string, right: string): boolean {
  const a = normalizeVietnameseName(left);
  const b = normalizeVietnameseName(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  if (a.includes(b) || b.includes(a)) {
    return true;
  }
  const aTokens = a.split(" ").filter(Boolean);
  const bTokens = b.split(" ").filter(Boolean);
  if (aTokens.length === 0 || bTokens.length === 0) {
    return false;
  }
  const overlap = aTokens.filter((token) => bTokens.includes(token));
  return overlap.length >= Math.min(2, Math.max(1, Math.min(aTokens.length, bTokens.length)));
}

export type BookingDuplicateInfo = {
  bookingId: string;
  bookingAt: string;
  guestCount: number;
  receiverFullName: string;
  receiverUserId?: string;
  customerName?: string;
  tableLabel?: string;
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
