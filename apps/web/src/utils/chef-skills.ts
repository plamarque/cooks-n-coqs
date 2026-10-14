import { CHEF_CATALOG, chefCatalogToolsForSkills, resolveChefSkillClosure } from "@cookies-et-coquilettes/domain/chef-catalog";
import type { ChefMcpToolNameV1, ChefSkillIdV1 } from "@cookies-et-coquilettes/domain";

export type ChefSkillManifest = Readonly<{ id: string; instructions: string; tools: readonly string[] }>;

/** Savoirs C&C versionnés localement; aucun contenu utilisateur n'est un skill. */
export const CHEF_SKILLS_V1: readonly ChefSkillManifest[] = CHEF_CATALOG.skills.map((skill) => Object.freeze({ id: skill.id, instructions: skill.instructions, tools: skill.toolIds }));

export function activeChefSkills(skillIds: readonly string[]): string[] | null { return resolveChefSkillClosure(skillIds); }

export function allowedChefTools(skills: readonly ChefSkillIdV1[] | readonly string[]): ChefMcpToolNameV1[] {
  return (chefCatalogToolsForSkills(skills) ?? []) as ChefMcpToolNameV1[];
}
