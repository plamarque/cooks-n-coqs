import type { ChefMcpToolNameV1, ChefSkillIdV1 } from "@cookies-et-coquilettes/domain";

export type ChefSkillManifest = Readonly<{ id: ChefSkillIdV1; instructions: string; tools: readonly ChefMcpToolNameV1[] }>;

/** Savoirs C&C versionnés localement; aucun contenu utilisateur n'est un skill. */
export const CHEF_SKILLS_V1: readonly ChefSkillManifest[] = [
  { id: "chef-core", instructions: "Répondre avec les capacités C&C autorisées, sans écriture implicite.", tools: ["search-notebook", "assistant-advice", "classify-turn"] },
  { id: "adapter-une-recette", instructions: "Lire l'extrait de recette minimal avant de conseiller ou préparer une variante.", tools: ["get-recipe-context", "prepare-preview", "assistant-advice"] }
];

export function allowedChefTools(skills: readonly ChefSkillIdV1[]): ChefMcpToolNameV1[] {
  return [...new Set(CHEF_SKILLS_V1.filter((skill) => skills.includes(skill.id)).flatMap((skill) => skill.tools))];
}
