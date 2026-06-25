import type { AppUser, Branch } from "./types";

export const MANAGER_VIEW_ONLY_BLOCKED =
  "Bạn đang xem chi nhánh này ở chế độ chỉ xem. Chuyển về chi nhánh được gán để thao tác.";

export function canManagerEditBranch(
  user: AppUser | null | undefined,
  branchId: string | undefined
): boolean {
  if (!user || user.role !== "manager" || !branchId) {
    return true;
  }
  return user.branchIds.includes(branchId);
}

export function isManagerViewOnlyBranch(
  user: AppUser | null | undefined,
  activeBranchId: string | undefined
): boolean {
  if (!user || user.role !== "manager" || !activeBranchId) {
    return false;
  }
  return !user.branchIds.includes(activeBranchId);
}

export function canEditActiveBranch(
  user: AppUser | null | undefined,
  activeBranchId: string | undefined
): boolean {
  if (!user) {
    return false;
  }
  if (user.role === "employee") {
    return false;
  }
  if (user.role === "manager") {
    return canManagerEditBranch(user, activeBranchId);
  }
  return true;
}

export function getBranchSwitcherBranches(
  user: AppUser | null | undefined,
  branches: Branch[]
): Branch[] {
  if (!user) {
    return [];
  }
  if (user.role === "manager") {
    return branches;
  }
  return branches.filter((branch) => user.branchIds.includes(branch.id));
}
