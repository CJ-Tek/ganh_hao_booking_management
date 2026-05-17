import {
  BOOKING_GUEST_TYPE_OPTIONS,
  type BookingGuestTypeLabel,
} from "@/lib/booking-meta";

/** Map LLM / speech hints to a known loại khách label, or null if unclear. */
export function normalizeGuestTypeHint(hint?: string | null): BookingGuestTypeLabel | null {
  const raw = hint?.trim();
  if (!raw) {
    return null;
  }

  const lower = raw.toLowerCase();
  const exact = BOOKING_GUEST_TYPE_OPTIONS.find((o) => o.toLowerCase() === lower);
  if (exact) {
    return exact;
  }

  if (/\bvip\b|khách\s*vip/.test(lower)) {
    return "Khách VIP";
  }
  if (/sinh\s*nhật|\bsn\b/.test(lower)) {
    return "Sinh nhật";
  }
  if (/đặt\s*món|order\s*trước|đặt\s*trước/.test(lower)) {
    return "Đặt món trước";
  }
  if (/đoàn|tour\b|đám\s*đông/.test(lower)) {
    return "Đoàn";
  }
  if (/khách\s*quen|quen\b/.test(lower)) {
    return "Khách quen";
  }
  if (/khách\s*thường|thường\b/.test(lower)) {
    return "Khách thường";
  }

  return null;
}
