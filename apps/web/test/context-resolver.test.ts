import assert from "node:assert/strict";
import test from "node:test";
import { ContextResolver } from "../src/utils/context-resolver.ts";

test("ContextResolver sépare le contexte utilisateur borné du tour courant et exclut Chef", () => {
  const result = new ContextResolver().resolve({ currentMessage: "Au Cookeo", recentThread: [{ role: "user", text: "Je voudrais adapter une soupe" }, { role: "assistant", text: "Ingrédients: recette entière à ne pas projeter" }] });
  assert.deepEqual(result, { kind: "resolved", recentExcerpt: "Je voudrais adapter une soupe" });
});

test("ContextResolver refuse un fil clos avant toute lecture et les données interdites", () => {
  const resolver = new ContextResolver();
  assert.deepEqual(resolver.resolve({ closed: true, currentMessage: "secret", recentThread: [] }), { kind: "refused", reason: "closed_thread" });
  assert.deepEqual(resolver.resolve({ currentMessage: "blob:https://local/image", recentThread: [] }), { kind: "refused", reason: "forbidden_data" });
});
