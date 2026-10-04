import assert from "node:assert/strict";
import test from "node:test";
import { ChefSession } from "../src/utils/chef-session";

test("ChefSession ne crée un fil qu'au premier envoi et le clôture sans l'effacer", () => {
  const session = new ChefSession();
  assert.equal(session.active, null);
  const active = session.begin([{ role: "user", text: "Une soupe" }], new Date("2026-10-04T10:00:00Z"));
  assert.equal(active.turns[0].text, "Une soupe");
  const closed = session.close(new Date("2026-10-04T10:01:00Z"));
  assert.equal(closed?.closedAt, "2026-10-04T10:01:00.000Z");
  assert.equal(closed?.turns.length, 1);
  assert.equal(session.active, null);
});

test("ChefSession conserve l'ordre des tours sans créer un second fil", () => {
  const session = new ChefSession();
  const first = session.begin([{ role: "user", text: "Bonjour" }]);
  const updated = session.sync([{ role: "user", text: "Bonjour" }, { role: "assistant", text: "Que cuisine-t-on ?" }]);
  assert.equal(updated?.id, first.id);
  assert.deepEqual(updated?.turns.map(({ role }) => role), ["user", "assistant"]);
});
