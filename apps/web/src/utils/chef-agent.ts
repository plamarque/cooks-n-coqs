import type { ChefAgentContextV1, ChefAgentDecisionV1, ChefAgentDecisionV2, ChefAgentFinalV1, ChefAgentRequestV1, ChefAgentToolInputV1, ChefAgentToolResultV1, ChefAgentTurnWireV2, ChefMcpToolNameV1, ChefRuntimeLimitAuditEventV1, ChefRuntimeLimitKeyV1, ChefSkillIdV1 } from "@cookies-et-coquilettes/domain";
import { CHEF_AGENT_MAX_STEPS, CHEF_AGENT_MAX_TOOLS, CHEF_RUNTIME_LIMITS_V1, chefRuntimeLimitAudit, isChefAgentToolInputForTool } from "@cookies-et-coquilettes/domain";
import { CHEF_CATALOG_REVISION, isChefCatalogSafeJson, validateChefCatalogToolValue } from "@cookies-et-coquilettes/domain/chef-catalog";
import { activeChefSkills, allowedChefTools } from "./chef-skills";

export type ChefAgentResult = { kind: "final"; final: ChefAgentFinalV1; toolResults: ReadonlyArray<{ tool: ChefMcpToolNameV1; result: ChefAgentToolResultV1 }> } | { kind: "stopped"; reason: "cancelled" | "no_progress" | "invalid_tool" | "tool_error" };
export type ChefAgentDependencies = {
  decide(request: ChefAgentRequestV1, signal: AbortSignal): Promise<ChefAgentDecisionV1>;
  execute(tool: ChefMcpToolNameV1, input: ChefAgentToolInputV1, signal: AbortSignal): Promise<ChefAgentToolResultV1>;
};

/** Orchestrateur PWA: le modèle ne fait qu'annoncer l'étape suivante. */
export class ChefAgent {
  private requestId = 0;
  private controller: AbortController | null = null;
  constructor(private readonly dependencies: ChefAgentDependencies) {}

  cancel(): void { this.controller?.abort(); this.controller = null; this.requestId += 1; }

  async run(message: string, skills: readonly ChefSkillIdV1[] = ["chef-core", "adapter-une-recette"], parentSignal?: AbortSignal, context?: ChefAgentContextV1): Promise<ChefAgentResult> {
    this.cancel();
    const requestId = ++this.requestId;
    const controller = new AbortController(); this.controller = controller;
    const abortFromParent = () => controller.abort(parentSignal?.reason);
    if (parentSignal?.aborted) abortFromParent();
    else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
    const tools = allowedChefTools(skills);
    const results: Array<{ tool: ChefMcpToolNameV1; result: ChefAgentToolResultV1 }> = [];
    const seen = new Set<string>();
    let repeatedDecisionCount = 0;
    try {
      for (let step = 0; step < CHEF_AGENT_MAX_STEPS; step += 1) {
        const decision = await this.dependencies.decide({ message, skills: [...skills], tools, ...(context ? { context } : {}), ...(results.length ? { results } : {}) }, controller.signal);
        if (controller.signal.aborted || requestId !== this.requestId) return { kind: "stopped", reason: "cancelled" };
        if (decision.kind === "final") return { kind: "final", final: decision, toolResults: results };
        if (!tools.includes(decision.tool) || !isChefAgentToolInputForTool(decision.tool, decision.input) || results.length >= CHEF_AGENT_MAX_TOOLS) return { kind: "stopped", reason: "invalid_tool" };
        const fingerprint = `${decision.tool}:${JSON.stringify(decision.input)}`;
        // Une répétition isolée du raisonneur n'est pas une progression, mais
        // la réponse suivante peut correctement exploiter le résultat déjà
        // fourni. Deux répétitions consécutives ferment réellement la boucle.
        if (seen.has(fingerprint)) {
          repeatedDecisionCount += 1;
          if (repeatedDecisionCount >= 2) return { kind: "stopped", reason: "no_progress" };
          continue;
        }
        repeatedDecisionCount = 0;
        seen.add(fingerprint);
        let result: ChefAgentToolResultV1;
        try { result = await this.dependencies.execute(decision.tool, decision.input, controller.signal); }
        catch { return controller.signal.aborted || requestId !== this.requestId ? { kind: "stopped", reason: "cancelled" } : { kind: "stopped", reason: "tool_error" }; }
        if (controller.signal.aborted || requestId !== this.requestId) return { kind: "stopped", reason: "cancelled" };
        results.push({ tool: decision.tool, result });
      }
      return { kind: "stopped", reason: "no_progress" };
    } finally {
      parentSignal?.removeEventListener("abort", abortFromParent);
      if (requestId === this.requestId) this.controller = null;
    }
  }
}

export type ChefRuntimeV2ToolResult = Readonly<{ tool: string; result: Record<string, unknown> }>;
export type ChefRuntimeV2Result = { kind: "final"; final: Extract<ChefAgentDecisionV2, { kind: "final" }>; toolResults: readonly ChefRuntimeV2ToolResult[]; audits: readonly ChefRuntimeLimitAuditEventV1[] } | { kind: "stopped"; reason: "cancelled" | "catalog_mismatch" | "invalid_tool" | "no_progress" | "tool_error"; audits: readonly ChefRuntimeLimitAuditEventV1[] };
export type ChefRuntimeV2Dependencies = {
  decide(wire: ChefAgentTurnWireV2, signal: AbortSignal): Promise<ChefAgentDecisionV2>;
  execute(tool: string, input: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, unknown>>;
  audit?(event: ChefRuntimeLimitAuditEventV1): void;
};

/** Runtime V2 local: registre fermé, activation traçable et aucun effet durable. */
export class ChefRuntimeV2 {
  private requestId = 0;
  private controller: AbortController | null = null;
  constructor(private readonly dependencies: ChefRuntimeV2Dependencies, private readonly catalogRevision = CHEF_CATALOG_REVISION) {}
  cancel(): void { this.controller?.abort(); this.controller = null; this.requestId += 1; }
  async run(message: string, requestedSkills: readonly string[] = ["chef-core"], context?: ChefAgentContextV1, parentSignal?: AbortSignal, recentExcerpt?: string): Promise<ChefRuntimeV2Result> {
    this.cancel(); const requestId = ++this.requestId; const controller = new AbortController(); this.controller = controller;
    const abort = () => controller.abort(parentSignal?.reason); if (parentSignal?.aborted) abort(); else parentSignal?.addEventListener("abort", abort, { once: true });
    const audits: ChefRuntimeLimitAuditEventV1[] = [];
    const emit = (key: ChefRuntimeLimitKeyV1, observed: number, action: ChefRuntimeLimitAuditEventV1["action"], step: number): void => {
      const audit = chefRuntimeLimitAudit(this.catalogRevision, step, key, observed, action); if (audit) { audits.push(audit); this.dependencies.audit?.(audit); }
    };
    try {
      if (requestedSkills.length > CHEF_RUNTIME_LIMITS_V1.maxActiveSkills) { emit("maxActiveSkills", requestedSkills.length, "fallback", 0); return { kind: "stopped", reason: "catalog_mismatch", audits }; }
      const active = activeChefSkills(requestedSkills);
      if (!active || !active.includes("chef-core")) return { kind: "stopped", reason: "catalog_mismatch", audits };
      if (active.length > CHEF_RUNTIME_LIMITS_V1.maxActiveSkills) { emit("maxActiveSkills", active.length, "fallback", 0); return { kind: "stopped", reason: "catalog_mismatch", audits }; }
      let projectionMessage = message;
      let projectionContext = context;
      let projectionExcerpt = recentExcerpt;
      const contextSize = context ? JSON.stringify(context).length : 0;
      const excerptSize = recentExcerpt?.length ?? 0;
      const projectionSize = message.length + contextSize + excerptSize;
      if (projectionSize >= Math.ceil(CHEF_RUNTIME_LIMITS_V1.maxProjectionChars * CHEF_RUNTIME_LIMITS_V1.highWaterRatio) && projectionSize <= CHEF_RUNTIME_LIMITS_V1.maxProjectionChars) emit("maxProjectionChars", projectionSize, "observe", 0);
      if (projectionMessage.length > CHEF_RUNTIME_LIMITS_V1.maxProjectionChars) { emit("maxProjectionChars", projectionMessage.length, "truncate", 0); projectionMessage = projectionMessage.slice(0, CHEF_RUNTIME_LIMITS_V1.maxProjectionChars); }
      let remainingProjection = CHEF_RUNTIME_LIMITS_V1.maxProjectionChars - projectionMessage.length;
      if (projectionContext && contextSize > remainingProjection) { emit("maxProjectionChars", contextSize, "evict", 0); projectionContext = undefined; }
      else remainingProjection -= contextSize;
      if (projectionExcerpt && projectionExcerpt.length > remainingProjection) {
        emit("maxProjectionChars", projectionExcerpt.length, remainingProjection ? "truncate" : "omit", 0);
        projectionExcerpt = remainingProjection ? projectionExcerpt.slice(0, remainingProjection) : undefined;
      }
      const nonce = crypto.randomUUID().replace(/-/g, "");
      const results: ChefRuntimeV2ToolResult[] = [];
      let totalResultChars = 0;
      for (let step = 0; step < CHEF_RUNTIME_LIMITS_V1.maxSteps; step += 1) {
        const decision = await this.dependencies.decide({ catalogRevision: this.catalogRevision, nonce, step, activeSkills: [...active], projection: { message: projectionMessage, ...(projectionExcerpt ? { recentExcerpt: projectionExcerpt } : {}), ...(projectionContext ? { context: projectionContext } : {}) }, ...(results.length ? { results: results.map((entry) => ({ tool: entry.tool, result: { ...entry.result } })) } : {}) }, controller.signal);
        if (controller.signal.aborted || requestId !== this.requestId) return { kind: "stopped", reason: "cancelled", audits };
        if (decision.kind === "final") return { kind: "final", final: decision, toolResults: results, audits };
        if (decision.kind === "activate_skill") {
          if (active.includes(decision.skill)) return { kind: "stopped", reason: "no_progress", audits };
          const next = activeChefSkills([...active, decision.skill]);
          if (!next || next.length > CHEF_RUNTIME_LIMITS_V1.maxActiveSkills) { emit("maxActiveSkills", next?.length ?? active.length + 1, "fallback", step); return { kind: "stopped", reason: "catalog_mismatch", audits }; }
          active.splice(0, active.length, ...next); continue;
        }
        if (!allowedChefTools(active).includes(decision.tool as ChefMcpToolNameV1) || !validateChefCatalogToolValue(decision.tool, "input", decision.input)) return { kind: "stopped", reason: "invalid_tool", audits };
        let result: Record<string, unknown>;
        try { result = await this.dependencies.execute(decision.tool, decision.input, controller.signal); }
        catch { return controller.signal.aborted || requestId !== this.requestId ? { kind: "stopped", reason: "cancelled", audits } : { kind: "stopped", reason: "tool_error", audits }; }
        if (controller.signal.aborted || requestId !== this.requestId) return { kind: "stopped", reason: "cancelled", audits };
        if (!isChefCatalogSafeJson(result) || !validateChefCatalogToolValue(decision.tool, "result", result)) return { kind: "stopped", reason: "invalid_tool", audits };
        const text = JSON.stringify(result);
        if (text.length > CHEF_RUNTIME_LIMITS_V1.maxResultChars) { emit("maxResultChars", text.length, "fallback", step); return { kind: "stopped", reason: "invalid_tool", audits }; }
        totalResultChars += text.length;
        if (totalResultChars > CHEF_RUNTIME_LIMITS_V1.maxTotalResultChars) { emit("maxTotalResultChars", totalResultChars, "fallback", step); return { kind: "stopped", reason: "invalid_tool", audits }; }
        if (totalResultChars >= Math.ceil(CHEF_RUNTIME_LIMITS_V1.maxTotalResultChars * CHEF_RUNTIME_LIMITS_V1.highWaterRatio)) emit("maxTotalResultChars", totalResultChars, "observe", step);
        results.push({ tool: decision.tool, result });
        // `assistant-advice` est déjà une sortie utilisateur validée et sans
        // effet durable. Reconsulter le raisonneur pour lui faire annoncer une
        // finale ajoute un appel distant sans nouvelle capacité ni décision.
        if (decision.tool === "assistant-advice" && typeof result.text === "string") {
          return { kind: "final", final: { kind: "final", output: "advice", text: result.text }, toolResults: results, audits };
        }
      }
      emit("maxSteps", CHEF_RUNTIME_LIMITS_V1.maxSteps + 1, "fallback", CHEF_RUNTIME_LIMITS_V1.maxSteps - 1);
      return { kind: "stopped", reason: "no_progress", audits };
    } finally { parentSignal?.removeEventListener("abort", abort); if (requestId === this.requestId) this.controller = null; }
  }
}
