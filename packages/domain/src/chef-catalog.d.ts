export declare const CHEF_CATALOG: Readonly<{ catalogRevision: string; skills: readonly Readonly<{ id: string; dependencies: readonly string[]; summary: string; instructions: string; toolIds: readonly string[]; }>[]; tools: readonly Readonly<{ id: string; skillId: string; inputSchema: Record<string, unknown>; resultSchema: Record<string, unknown>; executor: string; effect: string; }>[]; }>;
export declare const CHEF_CATALOG_REVISION: string;
export declare function resolveChefSkillClosure(skillIds: readonly string[]): string[] | null;
export declare function chefCatalogToolsForSkills(skillIds: readonly string[]): string[] | null;
export declare function isChefCatalogSafeJson(value: unknown): boolean;
export declare function validateChefCatalogToolValue(toolId: string, direction: "input" | "result", value: unknown): value is Record<string, unknown>;
