export const CHEF_CATALOG_EFFECTS = [
  "none",
  "local_read",
  "bff_read",
  "session_reversible",
  "explicit_preference",
  "inferred_preference_low_confidence",
  "preview_then_confirm"
] as const;

export type ChefCatalogEffect = typeof CHEF_CATALOG_EFFECTS[number];
export type ChefCatalogTool = Readonly<{
  id: string;
  skillId: string;
  executor: "local" | "bff";
  effect: ChefCatalogEffect;
  inputSchema: Readonly<Record<string, unknown>>;
  resultSchema: Readonly<Record<string, unknown>>;
}>;
export type ChefCatalogSkill = Readonly<{
  id: string;
  dependencies: readonly string[];
  summary: string;
  instructions: string;
  toolIds: readonly string[];
}>;
export type ChefCatalogManifest = Readonly<{
  catalogRevision: string;
  skills: readonly ChefCatalogSkill[];
  tools: readonly ChefCatalogTool[];
}>;
