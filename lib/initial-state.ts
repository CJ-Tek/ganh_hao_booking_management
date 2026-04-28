import type { AppStateSnapshot } from "./types";

/**
 * Baseline empty snapshot when Supabase is not configured.
 * We intentionally do not ship any seeded users or demo data.
 */
export const initialState: AppStateSnapshot = {
  users: [],
  branches: [],
  areas: [],
  tables: [],
  customers: [],
  bookings: [],
  notifications: [],
  activeBranchId: undefined,
};

