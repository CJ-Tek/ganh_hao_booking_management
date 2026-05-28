import dayjs from "dayjs";
import type { Booking, BookingStatus } from "@/lib/types";

export type RealtimeRow = Record<string, unknown>;

export type RealtimeBookingPayload = {
  eventType?: "INSERT" | "UPDATE" | "DELETE";
  new?: RealtimeRow;
  old?: RealtimeRow;
};

const BOOKING_STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "cancelled",
  "seated",
  "no_show",
  "checked_in",
  "completed",
];

/** Map a Supabase `bookings` realtime row to app `Booking`, or null if invalid. */
export function mapRealtimeBookingRow(row: RealtimeRow): Booking | null {
  const id = row.id;
  const customerId = row.customer_id;
  const branchId = row.branch_id;
  const areaId = row.area_id;
  const tableId = row.table_id;
  const mergeGroupId = row.merge_group_id;
  const guestCountRaw = row.guest_count;
  const guestCount =
    typeof guestCountRaw === "number"
      ? guestCountRaw
      : typeof guestCountRaw === "string" && guestCountRaw.trim().length > 0
        ? Number(guestCountRaw)
        : NaN;
  const bookingAt = row.booking_at;
  const startTimeRaw = row.start_time;
  const endTimeRaw = row.end_time;
  const startTime =
    typeof startTimeRaw === "string" && startTimeRaw.trim().length > 0
      ? startTimeRaw
      : typeof bookingAt === "string"
        ? bookingAt
        : null;
  const endTime =
    typeof endTimeRaw === "string" && endTimeRaw.trim().length > 0
      ? endTimeRaw
      : typeof startTime === "string"
        ? dayjs(startTime).add(90, "minute").toISOString()
        : null;
  const checkedInAt = row.checked_in_at;
  const noShowMarkedAt = row.no_show_marked_at;
  const note = row.note;
  const createdByUserId = row.created_by_user_id;
  const lastEditedAt = row.last_edited_at;
  const lastEditedByUserId = row.last_edited_by_user_id;
  const status = row.status;

  if (
    typeof id !== "string" ||
    typeof customerId !== "string" ||
    typeof branchId !== "string" ||
    !Number.isFinite(guestCount) ||
    typeof bookingAt !== "string" ||
    startTime === null ||
    endTime === null ||
    typeof createdByUserId !== "string" ||
    typeof status !== "string" ||
    !BOOKING_STATUSES.includes(status as BookingStatus)
  ) {
    return null;
  }
  if (areaId != null && typeof areaId !== "string") {
    return null;
  }
  if (tableId != null && typeof tableId !== "string") {
    return null;
  }
  if (mergeGroupId != null && typeof mergeGroupId !== "string") {
    return null;
  }
  if (checkedInAt !== null && typeof checkedInAt !== "string") {
    return null;
  }
  if (noShowMarkedAt !== null && typeof noShowMarkedAt !== "string") {
    return null;
  }
  if (note !== null && typeof note !== "string") {
    return null;
  }
  if (lastEditedAt !== null && typeof lastEditedAt !== "string") {
    return null;
  }
  if (lastEditedByUserId !== null && typeof lastEditedByUserId !== "string") {
    return null;
  }

  return {
    id,
    customerId,
    branchId,
    areaId: areaId ?? null,
    tableId: tableId ?? null,
    mergeGroupId: mergeGroupId ?? null,
    guestCount,
    bookingAt,
    startTime,
    endTime,
    checkedInAt: checkedInAt ?? undefined,
    noShowMarkedAt: noShowMarkedAt ?? undefined,
    note: note ?? undefined,
    createdByUserId,
    lastEditedAt: lastEditedAt ?? undefined,
    lastEditedByUserId: lastEditedByUserId ?? undefined,
    status: status as BookingStatus,
  };
}

export function normalizeRealtimePayload(payload: unknown): RealtimeBookingPayload {
  const raw = payload as Record<string, unknown>;
  const eventRaw = raw.eventType ?? raw.type ?? raw.event;
  const eventType =
    eventRaw === "INSERT" || eventRaw === "UPDATE" || eventRaw === "DELETE"
      ? eventRaw
      : undefined;
  return {
    eventType,
    new: raw.new as RealtimeRow | undefined,
    old: raw.old as RealtimeRow | undefined,
  };
}
