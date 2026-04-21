import type { Area, DiningTable } from "@/lib/types";

/**
 * Area "sức chứa" is the seat budget for the zone: sum of `seats` on all tables
 * in that area must stay within this limit.
 */
export function getAreaSeatBudget(
  areas: Area[],
  tables: DiningTable[],
  areaId: string
): { capacity: number; used: number; remaining: number } | null {
  const area = areas.find((a) => a.id === areaId);
  if (!area) {
    return null;
  }
  const used = tables
    .filter((t) => t.areaId === areaId)
    .reduce((sum, t) => sum + t.seats, 0);
  return {
    capacity: area.capacity,
    used,
    remaining: Math.max(0, area.capacity - used),
  };
}
