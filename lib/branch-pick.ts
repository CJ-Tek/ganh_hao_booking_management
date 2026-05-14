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

export function readStoredActiveBranch(user: AppUser): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const raw = localStorage.getItem(activeBranchStorageKey(user.id));
  if (raw && user.branchIds.includes(raw)) {
    return raw;
  }
  return undefined;
}

export function persistActiveBranch(user: AppUser, branchId: string): void {
  if (typeof window === "undefined") {
    return;
  }
  if (!user.branchIds.includes(branchId)) {
    return;
  }
  const persistForManagerMulti =
    (user.role === "manager" || user.role === "employee") && user.branchIds.length > 1;
  if (shouldPickBranchOnLogin(user.role) || persistForManagerMulti) {
    localStorage.setItem(activeBranchStorageKey(user.id), branchId);
  }
}
