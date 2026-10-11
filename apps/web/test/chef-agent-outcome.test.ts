import assert from "node:assert/strict";
import test from "node:test";
import { preserveChef92Outcome, runChefAgentOutcome } from "../src/utils/chef-agent-outcome.ts";

test("une finale ideas de ChefAgent conserve le choix typé 9.2", () => {
  assert.deepEqual(preserveChef92Outcome({ kind: "final", output: "ideas", text: "Velouté" }), { kind: "final", output: "advice" });
  assert.deepEqual(preserveChef92Outcome({ kind: "final", output: "preview" }), { kind: "final", output: "preview" });
});

test("finales ChefAgent conservent les sorties visibles 9.2", async () => {
  const calls: string[] = [];
  const handlers = { ideas: async () => { calls.push("ideas"); return [{ title: "Tarte", description: "Pommes" }]; }, create: async () => { calls.push("create"); return "preview"; }, search: async () => { calls.push("search"); return "card"; }, advice: async () => { calls.push("advice"); }, clarify: async (text: string) => { calls.push(`clarify:${text}`); } };
  assert.equal((await runChefAgentOutcome({ kind: "final", output: "preview" }, handlers)).kind, "preview");
  assert.equal((await runChefAgentOutcome({ kind: "final", output: "search" }, handlers)).kind, "search");
  assert.equal((await runChefAgentOutcome({ kind: "final", output: "ideas" }, handlers)).kind, "ideas");
  assert.equal((await runChefAgentOutcome({ kind: "final", output: "advice" }, handlers)).kind, "advice");
  assert.equal((await runChefAgentOutcome({ kind: "final", output: "clarify", text: "Quel appareil ?" }, handlers)).kind, "clarify");
  assert.deepEqual(calls, ["create", "search", "ideas", "advice", "clarify:Quel appareil ?"]);
});
