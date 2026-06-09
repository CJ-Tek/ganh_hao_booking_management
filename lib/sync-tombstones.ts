const DEFAULT_TTL_MS = 60_000;

/** Suppresses recently deleted rows from stale reload/realtime until the server confirms removal. */
export class SyncTombstones {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs;
  }

  register(ids: readonly string[]) {
    const now = Date.now();
    for (const id of ids) {
      if (id) {
        this.entries.set(id, now);
      }
    }
  }

  clear(id: string) {
    this.entries.delete(id);
  }

  has(id: string) {
    this.prune();
    return this.entries.has(id);
  }

  filterById<T extends { id: string }>(rows: readonly T[]): T[] {
    this.prune();
    if (this.entries.size === 0) {
      return [...rows];
    }
    return rows.filter((row) => !this.entries.has(row.id));
  }

  /** Drop tombstones once the server no longer returns the deleted id. */
  reconcile(serverRows: readonly { id: string }[]) {
    if (this.entries.size === 0) {
      return;
    }
    const serverIds = new Set(serverRows.map((row) => row.id));
    for (const id of this.entries.keys()) {
      if (!serverIds.has(id)) {
        this.entries.delete(id);
      }
    }
  }

  private prune() {
    if (this.entries.size === 0) {
      return;
    }
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, at] of this.entries) {
      if (at < cutoff) {
        this.entries.delete(id);
      }
    }
  }
}
