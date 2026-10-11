import type { ChefAgentDecisionV1, ChefAgentFinalV1, ChefAgentRequestV1, ChefAgentToolInputV1, ChefAgentToolResultV1, ChefMcpToolNameV1, ChefSkillIdV1 } from "@cookies-et-coquilettes/domain";
import { CHEF_AGENT_MAX_STEPS, CHEF_AGENT_MAX_TOOLS, isChefAgentToolInputForTool } from "@cookies-et-coquilettes/domain";
import { allowedChefTools } from "./chef-skills";

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

  async run(message: string, skills: readonly ChefSkillIdV1[] = ["chef-core", "adapter-une-recette"], parentSignal?: AbortSignal): Promise<ChefAgentResult> {
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
        const decision = await this.dependencies.decide({ message, skills: [...skills], tools, ...(results.length ? { results } : {}) }, controller.signal);
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
