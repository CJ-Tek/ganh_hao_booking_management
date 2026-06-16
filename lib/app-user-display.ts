import dayjs from "dayjs";
import type { AppUser, Role } from "@/lib/types";

export const APP_USER_ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  general_manager: "Quản lý tổng",
  manager: "Quản lý chi nhánh",
  employee: "Nhân viên",
};

/** Mantine color tokens — distinct hues for quick role scanning. */
export const APP_USER_ROLE_COLOR: Record<Role, string> = {
  admin: "grape",
  general_manager: "orange",
  manager: "blue",
  employee: "teal",
};

export const APP_USER_ROLE_FILTER_STATUSES: Role[] = [
  "admin",
  "general_manager",
  "manager",
  "employee",
];

export function scopedAppUserRoleFilterStatuses(viewerRole: Role | undefined): Role[] {
  if (viewerRole === "general_manager") {
    return APP_USER_ROLE_FILTER_STATUSES.filter((role) => role !== "admin");
  }
  return [...APP_USER_ROLE_FILTER_STATUSES];
}

export function userMatchesRoleFilters(role: Role, filters: readonly Role[]): boolean {
  return filters.includes(role);
}

export function toggleUserRoleFilter(current: readonly Role[], role: Role): Role[] {
  if (current.includes(role)) {
    if (current.length <= 1) {
      return [...current];
    }
    return current.filter((item) => item !== role);
  }
  return [...current, role];
}

export function normalizeUserRoleFilters(
  filters: readonly Role[],
  fallback: Role = "manager"
): Role[] {
  return filters.length > 0 ? [...filters] : [fallback];
}

export function appUserBranchNames(
  user: Pick<AppUser, "branchIds">,
  branches: readonly { id: string; name: string }[]
): string {
  return user.branchIds
    .map((id) => branches.find((branch) => branch.id === id)?.name ?? id)
    .join(", ");
}

export function appUserDisplayName(
  userId: string | null | undefined,
  users: readonly Pick<AppUser, "id" | "fullName">[]
): string {
  if (!userId) {
    return "—";
  }
  return users.find((user) => user.id === userId)?.fullName ?? "Không rõ";
}

export function formatAppUserAuditAt(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

export function formatAppUserPassword(password: string | null | undefined): string {
  const trimmed = password?.trim();
  return trimmed ? trimmed : "—";
}
