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
  if (requestedId && modules.some((module) => module.id === requestedId)) {
    return requestedId as GuideModuleId;
  }
  return modules[0]?.id ?? "start";
}
