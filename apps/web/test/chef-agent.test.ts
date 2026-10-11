import assert from "node:assert/strict";
import test from "node:test";
import { ChefAgent } from "../src/utils/chef-agent.ts";

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
