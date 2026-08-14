import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, test } from "node:test";
import { app } from "../src/server.js";

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

async function readResponse(res: Response): Promise<{ text: string; json: unknown }> {
  const text = await res.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

test("POST /api/proximity-drop → 404 Express (pas de 201 ni { id, expiresAt })", async () => {
  const res = await fetch(`${baseUrl}/api/proximity-drop`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Tiramisu", category: "SUCRE" })
  });

  assert.equal(res.status, 404);
  assert.doesNotMatch(res.headers.get("content-type") ?? "", /application\/json/i);
  const { json } = await readResponse(res);
  assert.equal(json, null);
});

test("GET /api/proximity-drop/:id → 404 Express (pas de payload recette ni 410 métier)", async () => {
  const res = await fetch(`${baseUrl}/api/proximity-drop/ticket-inexistant`);

  assert.equal(res.status, 404);
  assert.doesNotMatch(res.headers.get("content-type") ?? "", /application\/json/i);
  const { json } = await readResponse(res);
  assert.equal(json, null);
});
