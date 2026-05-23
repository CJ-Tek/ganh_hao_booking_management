"use client";

import { useCallback, useState } from "react";

/** Tracks a single in-flight async action keyed by entity id (e.g. booking row). */
export function useBusyId() {
  const [busyId, setBusyId] = useState<string | null>(null);

  const isBusy = useCallback(
    (id?: string | null) => {
      if (busyId == null) {
        return false;
      }
      if (id == null) {
        return true;
      }
      return busyId === id;
    },
    [busyId]
  );

  const run = useCallback(async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
    setBusyId(id);
    try {
      return await fn();
    } finally {
      setBusyId(null);
    }
  }, []);

  const clear = useCallback(() => setBusyId(null), []);

  return { busyId, isBusy, run, clear };
}
