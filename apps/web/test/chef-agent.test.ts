import assert from "node:assert/strict";
import test from "node:test";
import { ChefAgent, ChefRuntimeV2 } from "../src/utils/chef-agent.ts";

test("ChefAgent poursuit un outil local autorisé puis finalise sans écriture", async () => {
  let calls = 0;
  const agent = new ChefAgent({
    decide: async () => ++calls === 1
      ? { kind: "tool", tool: "get-recipe-context", input: { referenceTitle: "Blanquette" } }
      : { kind: "final", output: "advice", text: "Cuisez sous pression." },
    execute: async () => ({ recipe: { title: "Blanquette", ingredients: ["veau"], steps: ["Mijoter"] } })
  });
  const result = await agent.run("Au Cookeo, sans crème");
  assert.equal(result.kind, "final");
  assert.equal(calls, 2);
  assert.equal(result.kind === "final" && result.toolResults.length, 1);
});

test("ChefAgent transmet la continuité minimale à chaque décision", async () => {
  const requests: Array<{ context?: unknown }> = [];
  let calls = 0;
  const agent = new ChefAgent({
    decide: async (request) => {
      requests.push(request);
      return ++calls === 1
        ? { kind: "tool", tool: "get-recipe-context", input: { referenceTitle: "Soupe de cèpes" } }
        : { kind: "final", output: "advice" };
    },
    execute: async () => ({ recipe: { title: "Soupe de cèpes", ingredients: ["cèpes"], steps: ["Cuire"] } })
  });
  await agent.run("Au Cookeo et sans crème", ["chef-core", "adapter-une-recette"], undefined, {
    objective: "Des cèpes",
    constraints: ["au Cookeo", "sans crème"],
    clarification: "Quel appareil utilisez-vous ?",
    reference: { title: "Soupe de cèpes" }
  });
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(({ context }) => context), [
    { objective: "Des cèpes", constraints: ["au Cookeo", "sans crème"], clarification: "Quel appareil utilisez-vous ?", reference: { title: "Soupe de cèpes" } },
    { objective: "Des cèpes", constraints: ["au Cookeo", "sans crème"], clarification: "Quel appareil utilisez-vous ?", reference: { title: "Soupe de cèpes" } }
  ]);
  assert.equal(JSON.stringify(requests).includes("recipeId"), false);
});

test("ChefAgent poursuit une relance sans recette locale vers le conseil", async () => {
  let step = 0;
  const calls: string[] = [];
  const agent = new ChefAgent({
    decide: async () => {
      step += 1;
      return step === 1
        ? { kind: "tool", tool: "get-recipe-context", input: {} }
        : step === 2
          ? { kind: "tool", tool: "assistant-advice", input: { request: "une tomate" } }
          : { kind: "final", output: "advice" };
    },
    execute: async (tool) => {
      calls.push(tool);
      return tool === "get-recipe-context"
        ? { text: "Aucune recette locale n’est disponible pour cette relance." }
        : { text: "Oui, ajoutez la tomate en fin de cuisson." };
    }
  });
  const result = await agent.run("une tomate", ["chef-core", "adapter-une-recette"]);
  assert.equal(result.kind, "final");
  assert.deepEqual(calls, ["get-recipe-context", "assistant-advice"]);
});

test("ChefAgent peut enchaîner plus de deux tools quand chacun fait progresser la demande", async () => {
  let calls = 0;
  const agent = new ChefAgent({
    decide: async () => {
      calls += 1;
      if (calls === 1) return { kind: "tool", tool: "classify-turn", input: { message: "Adapte" } } as const;
      if (calls === 2) return { kind: "tool", tool: "search-notebook", input: { query: "blanquette" } } as const;
      if (calls === 3) return { kind: "tool", tool: "assistant-advice", input: { request: "Adapte" } } as const;
      return { kind: "final", output: "advice" } as const;
    },
    execute: async (tool) => tool === "classify-turn"
      ? { intent: "adapt", constraints: ["sans crème"] }
      : tool === "search-notebook"
        ? { titles: ["Blanquette"] }
        : { text: "Remplacez la crème par du yaourt." }
  });
  const result = await agent.run("Adapte");
  assert.equal(result.kind, "final");
  assert.equal(result.kind === "final" && result.toolResults.length, 3);
});

test("ChefAgent arrête une boucle sans progrès", async () => {
  const agent = new ChefAgent({
    decide: async () => ({ kind: "tool", tool: "get-recipe-context", input: {} }),
    execute: async () => ({ recipe: { title: "X", ingredients: [], steps: [] } })
  });
  const result = await agent.run("Adapte");
  assert.deepEqual(result, { kind: "stopped", reason: "no_progress" });
});

test("ChefAgent ignore une finale tardive après annulation", async () => {
  let resolve!: (value: { kind: "final"; output: "advice" }) => void;
  const agent = new ChefAgent({ decide: () => new Promise((done) => { resolve = done; }), execute: async () => ({ text: "non" }) });
  const pending = agent.run("Conseil");
  agent.cancel(); resolve({ kind: "final", output: "advice" });
  assert.deepEqual(await pending, { kind: "stopped", reason: "cancelled" });
});

test("ChefAgent propage l'annulation du tour Assistant à sa décision en cours", async () => {
  let resolve!: (value: { kind: "final"; output: "advice" }) => void;
  let receivedSignal: AbortSignal | undefined;
  const controller = new AbortController();
  const agent = new ChefAgent({
    decide: (_request, signal) => {
      receivedSignal = signal;
      return new Promise((done) => { resolve = done; });
    },
    execute: async () => ({ text: "non" })
  });
  const pending = agent.run("Conseil", ["chef-core", "adapter-une-recette"], controller.signal);
  controller.abort();
  assert.equal(receivedSignal?.aborted, true);
  resolve({ kind: "final", output: "advice" });
  assert.deepEqual(await pending, { kind: "stopped", reason: "cancelled" });
});

test("ChefRuntimeV2 active le registre compilé, conserve le nonce et audite un dépassement", async () => {
  const wires: Array<{ nonce: string; step: number; activeSkills: string[] }> = [];
  const audits: string[] = [];
  let calls = 0;
  const runtime = new ChefRuntimeV2({
    decide: async (wire) => { wires.push(wire); return ++calls === 1 ? { kind: "tool", tool: "search-notebook", input: { query: "soupe" } } : { kind: "final", output: "advice" }; },
    execute: async () => ({ titles: ["Soupe"] }),
    audit: (audit) => audits.push(audit.outcome)
  });
  const result = await runtime.run("Une soupe");
  assert.equal(result.kind, "final");
  assert.equal(wires.length, 2);
  assert.equal(wires[0]?.nonce, wires[1]?.nonce);
  assert.deepEqual(wires[0]?.activeSkills, ["chef-core"]);
  assert.deepEqual(audits, []);
});

test("ChefRuntimeV2 rend l'activation compilée atteignable avant tout outil associé", async () => {
  const wires: Array<{ activeSkills: string[] }> = [];
  let step = 0;
  const runtime = new ChefRuntimeV2({
    decide: async (wire) => {
      wires.push(wire);
      step += 1;
      return step === 1
        ? { kind: "activate_skill", skill: "adapter-une-recette" } as const
        : step === 2
          ? { kind: "tool", tool: "get-recipe-context", input: {} } as const
          : { kind: "final", output: "advice" } as const;
    },
    execute: async () => ({ text: "Aucune recette locale n’est disponible." })
  });
  const result = await runtime.run("Adapte cette recette");
  assert.equal(result.kind, "final");
  assert.deepEqual(wires[0]?.activeSkills, ["chef-core"]);
  assert.deepEqual(wires[1]?.activeSkills, ["adapter-une-recette", "chef-core"]);
});

test("ChefRuntimeV2 refuse un résultat d'outil hors schéma ou non sérialisable", async () => {
  const invalidSchema = new ChefRuntimeV2({
    decide: async () => ({ kind: "tool", tool: "search-notebook", input: { query: "soupe" } }),
    execute: async () => ({ titles: ["Soupe"], extra: "interdit" })
  });
  assert.deepEqual(await invalidSchema.run("Une soupe"), { kind: "stopped", reason: "invalid_tool", audits: [] });
  const emptyRecipeContext = new ChefRuntimeV2({
    decide: async () => ({ kind: "tool", tool: "get-recipe-context", input: {} }),
    execute: async () => ({})
  });
  assert.deepEqual(await emptyRecipeContext.run("Une soupe"), { kind: "stopped", reason: "invalid_tool", audits: [] });
  const nonSerializable = new ChefRuntimeV2({
    decide: async () => ({ kind: "tool", tool: "assistant-advice", input: { request: "Conseil" } }),
    execute: async () => ({ text: "ok", nested: () => "non" } as unknown as Record<string, unknown>)
  });
  assert.deepEqual(await nonSerializable.run("Conseil"), { kind: "stopped", reason: "invalid_tool", audits: [] });
});

test("ChefRuntimeV2 audite le seuil de projection sans journaliser le contenu", async () => {
  const audits: unknown[] = [];
  const runtime = new ChefRuntimeV2({
    decide: async () => ({ kind: "final", output: "advice" }),
    execute: async () => ({}),
    audit: (event) => audits.push(event)
  });
  const result = await runtime.run("x".repeat(2_000));
  assert.equal(result.kind, "final");
  assert.deepEqual(audits.map((event) => ({ ...(event as Record<string, unknown>), catalogRevision: "revision-opaque" })), [{ catalogRevision: "revision-opaque", step: 0, key: "maxProjectionChars", configured: 2400, observed: 2000, action: "observe", outcome: "limit_high_water" }]);
  assert.equal(JSON.stringify(audits).includes("x".repeat(50)), false);
});

test("ChefRuntimeV2 ferme une activation inconnue avant tout exécuteur", async () => {
  let executed = false;
  const runtime = new ChefRuntimeV2({
    decide: async () => ({ kind: "activate_skill", skill: "inconnu" }),
    execute: async () => { executed = true; return {}; }
  });
  assert.deepEqual(await runtime.run("Conseil"), { kind: "stopped", reason: "catalog_mismatch", audits: [] });
  assert.equal(executed, false);
});

test("ChefRuntimeV2 ignore une finale tardive sans audit ni mutation", async () => {
  let resolve!: (value: { kind: "final"; output: "advice" }) => void;
  const runtime = new ChefRuntimeV2({ decide: () => new Promise((done) => { resolve = done; }), execute: async () => ({}) });
  const pending = runtime.run("Conseil"); runtime.cancel(); resolve({ kind: "final", output: "advice" });
  assert.deepEqual(await pending, { kind: "stopped", reason: "cancelled", audits: [] });
});

test("ChefRuntimeV2 accepte un conseil maximal et un contexte recette normal", async () => {
  let adviceStep = 0;
  const advice = new ChefRuntimeV2({
    decide: async () => ++adviceStep === 1
      ? { kind: "tool", tool: "assistant-advice", input: { request: "Conseil" } }
      : { kind: "final", output: "advice" },
    execute: async () => ({ text: "x".repeat(600) })
  });
  assert.equal((await advice.run("Conseil")).kind, "final");

  let recipeStep = 0;
  const recipe = new ChefRuntimeV2({
    decide: async () => ++recipeStep === 1
      ? { kind: "activate_skill", skill: "adapter-une-recette" }
      : recipeStep === 2
        ? { kind: "tool", tool: "get-recipe-context", input: { referenceTitle: "Soupe" } }
        : { kind: "final", output: "advice" },
    execute: async () => ({ recipe: { title: "Soupe", ingredients: ["carotte", "eau"], steps: ["Cuire doucement"] } })
  });
  assert.equal((await recipe.run("Adapte la soupe")).kind, "final");
});

test("ChefRuntimeV2 finalise localement après un conseil déjà validé", async () => {
  let decisions = 0;
  const runtime = new ChefRuntimeV2({
    decide: async () => {
      decisions += 1;
      return { kind: "tool", tool: "assistant-advice", input: { request: "Sans parmesan" } };
    },
    execute: async () => ({ text: "Ajoutez du citron à la place." })
  });
  const result = await runtime.run("Sans parmesan");
  assert.equal(result.kind, "final");
  assert.equal(result.kind === "final" && result.final.text, "Ajoutez du citron à la place.");
  assert.equal(decisions, 1);
});

test("ChefRuntimeV2 contrôle le volume brut des skills avant déduplication", async () => {
  const runtime = new ChefRuntimeV2({
    decide: async () => ({ kind: "final", output: "advice" }),
    execute: async () => ({})
  });
  const result = await runtime.run("Conseil", Array(5).fill("chef-core"));
  assert.equal(result.kind, "stopped");
  assert.equal(result.reason, "catalog_mismatch");
  assert.deepEqual(result.audits.map(({ catalogRevision: _revision, ...audit }) => audit), [{ step: 0, key: "maxActiveSkills", configured: 4, observed: 5, action: "fallback", outcome: "limit_enforced" }]);
});

test("ChefRuntimeV2 propage l'annulation parente à la décision en cours", async () => {
  let resolve!: (value: { kind: "final"; output: "advice" }) => void;
  let receivedSignal: AbortSignal | undefined;
  const controller = new AbortController();
  const runtime = new ChefRuntimeV2({
    decide: (_wire, signal) => {
      receivedSignal = signal;
      return new Promise((done) => { resolve = done; });
    },
    execute: async () => ({})
  });
  const pending = runtime.run("Conseil", ["chef-core"], undefined, controller.signal);
  controller.abort();
  assert.equal(receivedSignal?.aborted, true);
  resolve({ kind: "final", output: "advice" });
  assert.deepEqual(await pending, { kind: "stopped", reason: "cancelled", audits: [] });
});
