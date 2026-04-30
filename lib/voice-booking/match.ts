export type AreaLite = { id: string; name: string };
export type TableLite = { id: string; name: string; seats: number; areaId: string; status?: string };

function normalize(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[().,;:!?'"’“”]/g, "");
}

function scoreMatch(target: string, query: string) {
  const t = normalize(target);
  const q = normalize(query);
  if (!q) return 0;
  if (t === q) return 100;
  if (t.includes(q)) return 80;
  if (q.includes(t)) return 70;
  return 0;
}

export function matchAreaId(areas: AreaLite[], areaNameHint?: string) {
  if (!areaNameHint) return null;
  let best: { id: string; score: number } | null = null;
  for (const a of areas) {
    const s = scoreMatch(a.name, areaNameHint);
    if (!best || s > best.score) best = { id: a.id, score: s };
  }
  return best && best.score >= 70 ? best.id : null;
}

export function matchTableId(
  tables: TableLite[],
  tableNameHint?: string,
  opts?: { preferAreaId?: string | null; minSeats?: number | null }
) {
  if (!tableNameHint) return null;
  const preferAreaId = opts?.preferAreaId ?? null;
  const minSeats = opts?.minSeats ?? null;

  let best: { id: string; score: number } | null = null;
  for (const t of tables) {
    if (preferAreaId && t.areaId !== preferAreaId) continue;
    if (minSeats != null && t.seats < minSeats) continue;
    const s = scoreMatch(t.name, tableNameHint);
    if (!best || s > best.score) best = { id: t.id, score: s };
  }
  return best && best.score >= 70 ? best.id : null;
}

