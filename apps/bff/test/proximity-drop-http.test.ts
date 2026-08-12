import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { app, proximityDropStore } from "../src/server.js";

let server: Server;
let baseUrl = "";

before(async () => {
  await new Promise<void>((resolve, reject) => {
    server = app.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("adresse serveur invalide"));
        return;
      }
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
    server.on("error", reject);
  });
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

const draft = {
  title: "Tiramisu",
  category: "SUCRE",
  ingredients: [],
  steps: []
};

test("POST /api/proximity-drop valide → 201 + Cache-Control no-store", async () => {
  const res = await fetch(`${baseUrl}/api/proximity-drop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft)
  });

  assert.equal(res.status, 201);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/i);
  const body = (await res.json()) as { id: string; expiresAt: string };
  assert.match(body.id, /^[A-Za-z0-9_-]+$/);
  assert.ok(Number.isFinite(Date.parse(body.expiresAt)));
});

test("POST /api/proximity-drop sans title → 400", async () => {
  const res = await fetch(`${baseUrl}/api/proximity-drop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category: "SUCRE" })
  });

  assert.equal(res.status, 400);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/i);
  const body = (await res.json()) as { error: string };
  assert.ok(body.error);
});

test("GET après create → 200 payload ; 2ᵉ GET → 410 consumed", async () => {
  const createdRes = await fetch(`${baseUrl}/api/proximity-drop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft)
  });
  assert.equal(createdRes.status, 201);
  const { id } = (await createdRes.json()) as { id: string };

  const first = await fetch(`${baseUrl}/api/proximity-drop/${id}`);
  assert.equal(first.status, 200);
  assert.match(first.headers.get("cache-control") ?? "", /no-store/i);
  assert.deepEqual(await first.json(), draft);

  const second = await fetch(`${baseUrl}/api/proximity-drop/${id}`);
  assert.equal(second.status, 410);
  assert.match(second.headers.get("cache-control") ?? "", /no-store/i);
  const err = (await second.json()) as { reason: string };
  assert.equal(err.reason, "consumed");
});

test("GET id inconnu → 404 not_found", async () => {
  const res = await fetch(`${baseUrl}/api/proximity-drop/ticket-inexistant`);
  assert.equal(res.status, 404);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/i);
  const body = (await res.json()) as { reason: string };
  assert.equal(body.reason, "not_found");
});

test("GET ticket expiré → 410 expired", async () => {
  const createdRes = await fetch(`${baseUrl}/api/proximity-drop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft)
  });
  assert.equal(createdRes.status, 201);
  const { id } = (await createdRes.json()) as { id: string };
  assert.equal(proximityDropStore.forceExpire(id), true);

  const res = await fetch(`${baseUrl}/api/proximity-drop/${id}`);
  assert.equal(res.status, 410);
  assert.match(res.headers.get("cache-control") ?? "", /no-store/i);
  const body = (await res.json()) as { reason: string; error?: string };
  assert.equal(body.reason, "expired");
  assert.ok(body.error);
});
