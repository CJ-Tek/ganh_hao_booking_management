import type { GuideModule } from "./types";

function moduleSearchText(module: GuideModule): string {
  return [
    module.title,
    module.summary,
    module.intro,
    ...module.steps.flatMap((step) => [step.title, step.body]),
    ...module.tips,
  ]
    .join(" ")
    .toLowerCase();
}

/** Filter guide modules by user query (matches title, summary, steps, tips). */
export function searchGuideModules(modules: GuideModule[], query: string): GuideModule[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) {
    return modules;
  }

  return modules.filter((module) => {
    const haystack = moduleSearchText(module);
    return terms.every((term) => haystack.includes(term));
  });
}
