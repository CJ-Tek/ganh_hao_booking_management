import type { Role } from "@/lib/types";
import { buildGuideModules } from "./guide-modules";
import type { GuideModule, GuideModuleId } from "./types";

export function getGuideModulesForRole(role: Role): GuideModule[] {
  return buildGuideModules(role).filter((module) => module.roles.includes(role));
}

export function resolveGuideModuleId(
  modules: GuideModule[],
  requestedId: string | null | undefined
): GuideModuleId {
  const normalizedId =
    requestedId === "booking-order-flow" ? "booking-flow" : requestedId;
  if (normalizedId && modules.some((module) => module.id === normalizedId)) {
    return normalizedId as GuideModuleId;
  }
  return modules[0]?.id ?? "start";
}
