import type { AppUser, Role } from "./types";

export const BRANCH_PICK_SESSION_KEY = "ganh_hao_branch_pick_required_v1";

function activeBranchStorageKey(userId: string) {
  return `ganh_hao_active_branch_user_${userId}`;
}

export function shouldPickBranchOnLogin(role: Role): boolean {
  return role === "admin" || role === "general_manager";
}

export function setBranchPickRequired(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(BRANCH_PICK_SESSION_KEY, "1");
}

export function clearBranchPickRequired(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(BRANCH_PICK_SESSION_KEY);
}

export function isBranchPickRequired(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return sessionStorage.getItem(BRANCH_PICK_SESSION_KEY) === "1";
}

export function clearStoredActiveBranch(userId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(activeBranchStorageKey(userId));
}

export function readStoredActiveBranch(
  user: AppUser,
  allBranchIds?: readonly string[]
): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const raw = localStorage.getItem(activeBranchStorageKey(user.id));
  if (!raw) {
    return undefined;
  }
  if (user.role === "manager") {
    if (allBranchIds && allBranchIds.length > 0) {
      return allBranchIds.includes(raw) ? raw : undefined;
    }
    return raw;
  }
  if (user.branchIds.includes(raw)) {
    return raw;
  }
  return undefined;
}

export function resolveActiveBranchIdForUser(
  user: AppUser,
  options?: {
    allBranchIds?: readonly string[];
    /** When true, only restore a branch assigned to the user (e.g. on login / account switch). */
    assignedOnly?: boolean;
  }
): string | undefined {
  if (shouldPickBranchOnLogin(user.role) && isBranchPickRequired()) {
    return undefined;
  }
  if (user.branchIds.length === 0) {
    return undefined;
  }

  const stored = readStoredActiveBranch(user, options?.allBranchIds);

  if (options?.assignedOnly) {
    if (stored && user.branchIds.includes(stored)) {
      return stored;
    }
    return user.branchIds[0];
  }

  if (stored) {
    return stored;
  }

  return user.branchIds[0];
}

export function persistActiveBranch(user: AppUser, branchId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  if (user.role === "manager") {
    localStorage.setItem(activeBranchStorageKey(user.id), branchId);
    return;
  }
  if (!user.branchIds.includes(branchId)) {
    return;
  }
  const persistForEmployeeMulti = user.role === "employee" && user.branchIds.length > 1;
  if (shouldPickBranchOnLogin(user.role) || persistForEmployeeMulti) {
    localStorage.setItem(activeBranchStorageKey(user.id), branchId);
  }
}
