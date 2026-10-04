import assert from "node:assert/strict";
import test from "node:test";
import { ChefSession } from "../src/utils/chef-session";
import { selectLastResumableChefConversation } from "../src/storage/db";

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

test("ChefSession hydrate strictement un journal texte sans le muter", () => {
  const session = new ChefSession();
  const source = { id: "chef-1", createdAt: "2026-10-04T10:00:00.000Z", closedAt: "2026-10-04T10:01:00.000Z", turns: [{ role: "user" as const, text: "Bonjour" }, { role: "assistant" as const, text: "Bonjour !" }] };
  const hydrated = session.hydrate(source);
  assert.deepEqual(hydrated?.turns, source.turns);
  assert.notEqual(hydrated?.turns, source.turns);
  assert.equal(hydrated?.closedAt, undefined);
  assert.equal(session.sync([...source.turns, { role: "user", text: "Encore" }])?.id, source.id);
  assert.equal(session.hydrate({ id: "broken", createdAt: "not-a-date", turns: [] }), null);
});

test("le dernier journal reprenable est le plus récent valide et les lignes invalides restent sans mutation", () => {
  const invalid = { id: "broken", createdAt: "2026-10-06T10:00:00.000Z", turns: [] };
  const oldest = { id: "old", createdAt: "2026-10-03T10:00:00.000Z", closedAt: "2026-10-03T10:01:00.000Z", turns: [{ role: "user" as const, text: "Ancien" }] };
  const newest = { id: "new", createdAt: "2026-10-04T10:00:00.000Z", turns: [{ role: "assistant" as const, text: "Récent" }] };
  const selected = selectLastResumableChefConversation([oldest, invalid, newest]);
  assert.equal(selected.kind, "available");
  assert.equal(selected.kind === "available" ? selected.conversation.id : null, "new");
  assert.deepEqual(invalid, { id: "broken", createdAt: "2026-10-06T10:00:00.000Z", turns: [] });
});

test("la reprise distingue aucun fil d'un journal illisible", () => {
  assert.deepEqual(selectLastResumableChefConversation([]), { kind: "none" });
  assert.deepEqual(selectLastResumableChefConversation([{ id: "broken", createdAt: "invalid", turns: [] }]), { kind: "unavailable" });
});
