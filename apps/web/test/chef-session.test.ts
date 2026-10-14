import assert from "node:assert/strict";
import test from "node:test";
import { ChefConversationPersistenceCoordinator, ChefSession } from "../src/utils/chef-session";
import { restoreAssistantPreview, snapshotAssistantPreview } from "../src/utils/assistant-session";
import { db, deleteChefConversation, getChefConversationAttachmentFiles, selectLastResumableChefConversation } from "../src/storage/db";

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

test("ChefSession refuse un journal clos et hydrate un journal ouvert sans le muter", () => {
  const session = new ChefSession();
  const source = { id: "chef-1", createdAt: "2026-10-04T10:00:00.000Z", turns: [{ role: "user" as const, text: "Bonjour" }, { role: "assistant" as const, text: "Bonjour !" }] };
  const hydrated = session.hydrate(source);
  assert.deepEqual(hydrated?.turns, source.turns);
  assert.notEqual(hydrated?.turns, source.turns);
  assert.equal(hydrated?.closedAt, undefined);
  assert.equal(session.sync([...source.turns, { role: "user", text: "Encore" }])?.id, source.id);
  assert.equal(session.hydrate({ ...source, closedAt: "2026-10-04T10:01:00.000Z" }), null);
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

test("la reprise refuse un journal clos même s'il est le plus récent", () => {
  const closed = { id: "closed", createdAt: "2026-10-08T10:00:00.000Z", closedAt: "2026-10-08T10:01:00.000Z", turns: [{ role: "user" as const, text: "Clos" }] };
  assert.deepEqual(selectLastResumableChefConversation([closed]), { kind: "unavailable" });
});

test("la suppression transactionnelle ne touche que le fil Chef et ses assets", async () => {
  const originalTransaction = db.transaction;
  const originalConversationDelete = db.chefConversations.delete;
  const originalAssetWhere = db.chefConversationAssets.where;
  const calls: string[] = [];
  db.transaction = (async (_mode: unknown, ...args: unknown[]) => {
    const tables = args.slice(0, -1);
    assert.deepEqual(tables, [db.chefConversations, db.chefConversationAssets]);
    await (args.at(-1) as () => Promise<void>)();
  }) as typeof db.transaction;
  db.chefConversations.delete = (async (id: string) => { calls.push(`conversation:${id}`); return 1; }) as typeof db.chefConversations.delete;
  db.chefConversationAssets.where = ((key: string) => {
    assert.equal(key, "conversationId");
    return { equals: (id: string) => ({ delete: async () => { calls.push(`assets:${id}`); return 1; } }) };
  }) as typeof db.chefConversationAssets.where;
  try {
    await deleteChefConversation("chef-1");
    assert.deepEqual(calls, ["assets:chef-1", "conversation:chef-1"]);
  } finally {
    db.transaction = originalTransaction;
    db.chefConversations.delete = originalConversationDelete;
    db.chefConversationAssets.where = originalAssetWhere;
  }
});

test("le coordinateur réel laisse finir l'écriture antérieure puis bloque les snapshots périmés", async () => {
  const coordinator = new ChefConversationPersistenceCoordinator();
  const written: string[] = [];
  let release!: () => void;
  const first = coordinator.enqueue(() => new Promise<void>((resolve) => { release = () => { written.push("open"); resolve(); }; }));
  await Promise.resolve();
  assert.equal(coordinator.beginTransition(), true);
  assert.equal(coordinator.beginTransition(), false, "nouvelle conversation et suppression sont mutuellement exclusives");
  const stale = coordinator.enqueue(async () => { written.push("resurrected"); });
  const close = coordinator.transition(async () => { written.push("closed"); });
  release();
  await Promise.all([first, stale, close]);
  assert.deepEqual(written, ["open", "closed"]);
  assert.equal(coordinator.transitioning, false);
});

test("ChefSession hydrate un checkpoint photo sans réinterpréter ses références locales", () => {
  const session = new ChefSession();
  const source = {
    id: "photo-checkpoint", createdAt: "2026-10-10T10:00:00.000Z",
    turns: [{ id: "turn-photo", role: "user" as const, text: "Image jointe à analyser", attachments: [{ assetId: "asset-photo", order: 0, name: "plat.jpg", mimeType: "image/jpeg" }] }]
  };
  const hydrated = session.hydrate(source);
  assert.deepEqual(hydrated?.turns[0]?.attachments, source.turns[0]?.attachments);
  assert.notEqual(hydrated?.turns[0]?.attachments, source.turns[0]?.attachments);
});

test("le retry recompose les fichiers checkpointés dans leur ordre", async () => {
  const originalGet = db.chefConversationAssets.get.bind(db.chefConversationAssets);
  const rows = new Map([
    ["asset-1", { id: "asset-1", name: "premiere.jpg", mimeType: "image/jpeg", blob: new Blob(["one"], { type: "image/jpeg" }) }],
    ["asset-2", { id: "asset-2", name: "seconde.png", mimeType: "image/png", blob: new Blob(["two"], { type: "image/png" }) }]
  ]);
  db.chefConversationAssets.get = (async (id: string) => rows.get(id)) as typeof db.chefConversationAssets.get;
  try {
    const files = await getChefConversationAttachmentFiles([
      { assetId: "asset-2", order: 1, mimeType: "image/png" },
      { assetId: "asset-1", order: 0, mimeType: "image/jpeg" }
    ]);
    assert.deepEqual(files?.map((file) => file.name), ["premiere.jpg", "seconde.png"]);
  } finally {
    db.chefConversationAssets.get = originalGet;
  }
});

test("la reprise refuse une preview riche dont le draft ne peut pas être ouvert", () => {
  const malformed = {
    id: "broken-preview", createdAt: "2026-10-05T10:00:00.000Z", turns: [{
      role: "assistant" as const, text: "Voici une recette.",
      cards: [{ kind: "preview" as const, preview: { draft: { title: "Sans ingrédients", category: "SALE" } } }]
    }]
  };
  assert.equal(new ChefSession().hydrate(malformed), null);
});

test("un fil riche conserve les références dans leur ordre sans sérialiser les File", () => {
  const preview = {
    requestId: 8,
    draft: { title: "Soupe", category: "SALE" as const, ingredients: [], steps: [] },
    source: undefined,
    sourceFiles: [{} as File]
  };
  const snapshot = snapshotAssistantPreview(preview);
  const source = {
    id: "chef-rich", createdAt: "2026-10-05T10:00:00.000Z", turns: [{
      id: "turn-1", role: "user" as const, text: "Avec ces photos",
      attachments: [{ assetId: "asset-2", order: 1, mimeType: "image/jpeg" }, { assetId: "asset-1", order: 0, mimeType: "image/jpeg" }],
      cards: [{ kind: "preview" as const, preview: snapshot }, { kind: "candidate" as const, recipeId: "recipe-1" }]
    }]
  };
  const hydrated = new ChefSession().hydrate(source);
  assert.deepEqual(hydrated?.turns[0].attachments?.map(({ assetId }) => assetId), ["asset-2", "asset-1"]);
  assert.equal(hydrated?.turns[0].cards?.[1].kind, "candidate");
  if (hydrated?.turns[0].cards?.[0]?.kind === "preview") hydrated.turns[0].cards[0].preview.draft.title = "Modifiée";
  assert.equal(snapshot.draft.title, "Soupe");
  const restored = restoreAssistantPreview(snapshot, 9);
  assert.equal(restored.draft.title, "Soupe");
  assert.deepEqual(restored.sourceFiles, []);
  assert.equal("sourceFiles" in snapshot, false);
});
