import dayjs from "dayjs";
import {
  isPlausibleVietnamPhone,
  normalizeVietnamPhone,
} from "@/lib/booking-duplicate";
import { isSyntheticPhoneValue } from "@/lib/booking-meta";

/** Minimal row shape for survivor / field-default helpers. */
export type MergeCustomerCandidate = {
  id: string;
  fullName: string;
  phone: string | null;
  note?: string | null;
  bookingCount: number;
  createdAt?: string;
};

/**
 * Survivor = most bookings; tie-break earliest createdAt, then id.
 */
export function pickSurvivorCustomer<T extends MergeCustomerCandidate>(rows: T[]): T {
  if (rows.length === 0) {
    throw new Error("Cần ít nhất một khách hàng để chọn hồ sơ giữ lại.");
  }
  return [...rows].sort((a, b) => {
    const byCount = b.bookingCount - a.bookingCount;
    if (byCount !== 0) {
      return byCount;
    }
    const aCreated = a.createdAt ? dayjs(a.createdAt).valueOf() : Number.POSITIVE_INFINITY;
    const bCreated = b.createdAt ? dayjs(b.createdAt).valueOf() : Number.POSITIVE_INFINITY;
    if (aCreated !== bCreated) {
      return aCreated - bCreated;
    }
    return a.id.localeCompare(b.id);
  })[0];
}

/** Normalize for merge storage; empty / synthetic → null. */
export function normalizeMergePhone(phone: string | null | undefined): string | null {
  if (phone == null) {
    return null;
  }
  const trimmed = phone.trim();
  if (!trimmed || isSyntheticPhoneValue(trimmed)) {
    return null;
  }
  const normalized = normalizeVietnamPhone(trimmed);
  if (!normalized || isSyntheticPhoneValue(normalized)) {
    return null;
  }
  return normalized;
}

/** Validate optional merge phone; empty → ok (null). */
export function validateMergePhoneInput(raw: string): {
  ok: boolean;
  phone: string | null;
  message?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: true, phone: null };
  }
  const phone = normalizeMergePhone(trimmed);
  if (!phone || !isPlausibleVietnamPhone(phone)) {
    return {
      ok: false,
      phone: null,
      message:
        "Số điện thoại không đúng định dạng Việt Nam (ví dụ 0912345678, +84912345678).",
    };
  }
  return { ok: true, phone };
}

export function defaultMergeFullName(rows: MergeCustomerCandidate[], survivorId: string): string {
  const survivor = rows.find((row) => row.id === survivorId);
  return survivor?.fullName?.trim() || rows[0]?.fullName?.trim() || "";
}

/** Prefer survivor’s real phone, else first non-null real phone among selected. */
export function defaultMergePhone(
  rows: MergeCustomerCandidate[],
  survivorId: string
): string | null {
  const survivor = rows.find((row) => row.id === survivorId);
  const fromSurvivor = normalizeMergePhone(survivor?.phone ?? null);
  if (fromSurvivor) {
    return fromSurvivor;
  }
  for (const row of rows) {
    const phone = normalizeMergePhone(row.phone);
    if (phone) {
      return phone;
    }
  }
  return null;
}

/** Survivor note if set, else first non-empty among selected. */
export function defaultMergeNote(
  rows: MergeCustomerCandidate[],
  survivorId: string
): string {
  const survivor = rows.find((row) => row.id === survivorId);
  const survivorNote = survivor?.note?.trim() ?? "";
  if (survivorNote) {
    return survivorNote;
  }
  for (const row of rows) {
    const note = row.note?.trim() ?? "";
    if (note) {
      return note;
    }
  }
  return "";
}

/** Unique non-empty notes joined with newlines (order preserved). */
export function concatenateMergeNotes(rows: MergeCustomerCandidate[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const row of rows) {
    const note = row.note?.trim() ?? "";
    if (!note || seen.has(note)) {
      continue;
    }
    seen.add(note);
    parts.push(note);
  }
  return parts.join("\n");
}

export function uniqueFieldValues(
  rows: MergeCustomerCandidate[],
  field: "fullName" | "phone" | "note"
): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const row of rows) {
    let raw: string;
    if (field === "fullName") {
      raw = row.fullName.trim();
    } else if (field === "phone") {
      const phone = normalizeMergePhone(row.phone);
      raw = phone ?? "";
    } else {
      raw = row.note?.trim() ?? "";
    }
    const key = field === "phone" ? raw : raw;
    if (field === "phone" && !key) {
      if (!seen.has("")) {
        seen.add("");
        values.push("");
      }
      continue;
    }
    if (!key && field !== "phone") {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    values.push(key);
  }
  return values;
}
