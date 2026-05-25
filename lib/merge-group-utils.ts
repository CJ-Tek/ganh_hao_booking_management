import dayjs, { type Dayjs } from "dayjs";
import type { TableMergeGroup } from "@/lib/types";

export type TableMergeGroupDateRange = {
  startDate: string;
  endDate: string;
};

export type TableMergeGroupRowLike = {
  id: string;
  branch_id: string;
  area_id: string;
  auto_number: number | null;
  merged_name: string;
  total_capacity: number | null;
  status: string;
  created_at: string;
  released_at: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

export function formatMergeGroupDate(value: Dayjs | Date | string): string {
  return dayjs(value).format("YYYY-MM-DD");
}

export function formatMergeGroupDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    return dayjs(startDate).format("DD/MM/YYYY");
  }
  return `${dayjs(startDate).format("DD/MM")} – ${dayjs(endDate).format("DD/MM/YYYY")}`;
}

export function mergeDateRangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

export function resolveMergeGroupDateRange(
  row: Pick<TableMergeGroupRowLike, "created_at" | "start_date" | "end_date">
): TableMergeGroupDateRange {
  const fallback = formatMergeGroupDate(row.created_at);
  return {
    startDate: row.start_date ?? fallback,
    endDate: row.end_date ?? fallback,
  };
}

export function mapTableMergeGroupFromRow(
  row: TableMergeGroupRowLike,
  tableIds: string[] = []
): TableMergeGroup {
  const { startDate, endDate } = resolveMergeGroupDateRange(row);
  return {
    id: row.id,
    branchId: row.branch_id,
    areaId: row.area_id,
    autoNumber: row.auto_number ?? 0,
    mergedName: row.merged_name,
    totalCapacity: row.total_capacity ?? 0,
    tableIds,
    status: row.status === "released" ? "released" : "active",
    createdAt: row.created_at,
    releasedAt: row.released_at,
    startDate,
    endDate,
  };
}

export function isMergeGroupEffectiveOnDate(
  group: Pick<TableMergeGroup, "status" | "startDate" | "endDate">,
  date: Dayjs
): boolean {
  if (group.status !== "active") {
    return false;
  }
  const day = date.startOf("day");
  return (
    !day.isBefore(group.startDate, "day") && !day.isAfter(group.endDate, "day")
  );
}

export function isMergeGroupExpired(
  group: Pick<TableMergeGroup, "status" | "endDate">,
  asOf: Dayjs = dayjs()
): boolean {
  if (group.status !== "active") {
    return false;
  }
  return asOf.startOf("day").isAfter(group.endDate, "day");
}

export function validateMergeGroupDateRange(input: {
  startDate: string;
  endDate: string;
}): { ok: true } | { ok: false; message: string } {
  const start = dayjs(input.startDate, "YYYY-MM-DD", true);
  const end = dayjs(input.endDate, "YYYY-MM-DD", true);
  if (!start.isValid() || !end.isValid()) {
    return { ok: false, message: "Ngày bắt đầu hoặc ngày kết thúc không hợp lệ." };
  }
  if (end.isBefore(start, "day")) {
    return { ok: false, message: "Ngày kết thúc phải sau hoặc bằng ngày bắt đầu." };
  }
  return { ok: true };
}
