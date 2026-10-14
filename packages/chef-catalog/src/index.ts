export * from "./types";
export * from "./generated/catalog";

import { CHEF_CATALOG } from "./generated/catalog";

export function resolveChefSkillClosure(skillIds: readonly string[]): string[] | null {
  const byId = new Map(CHEF_CATALOG.skills.map((skill) => [skill.id, skill]));
  const active = new Set<string>();
  const visit = (id: string): boolean => {
    const skill = byId.get(id);
    if (!skill) return false;
    if (active.has(id)) return true;
    active.add(id);
    return skill.dependencies.every(visit);
  };
  return skillIds.every(visit) ? CHEF_CATALOG.skills.map(({ id }) => id).filter((id) => active.has(id)) : null;
}

export function chefCatalogToolsForSkills(skillIds: readonly string[]): string[] | null {
  const closure = resolveChefSkillClosure(skillIds);
  if (!closure) return null;
  const active = new Set(closure);
  return CHEF_CATALOG.tools.filter((tool) => active.has(tool.skillId)).map((tool) => tool.id);
}
