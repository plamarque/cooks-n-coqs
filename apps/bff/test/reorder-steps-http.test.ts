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

test("POST /api/import/reorder-steps conserve ingredientIds (light-first)", async () => {
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const res = await fetch(`${baseUrl}/api/import/reorder-steps`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        steps: [
          {
            id: "a",
            order: 1,
            text: "3. Cuire au four.",
            ingredientIds: ["  ing-x  ", "ing-x"]
          },
          {
            id: "b",
            order: 2,
            text: "1. Mélanger la farine.",
            ingredientIds: ["ing-y"]
          },
          { id: "c", order: 3, text: "2. Reposer." }
        ]
      })
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      steps: Array<{ text: string; ingredientIds?: string[] }>;
    };
    assert.equal(body.steps.length, 3);
    assert.match(body.steps[0]?.text ?? "", /^1\./);
    assert.deepEqual(body.steps[0]?.ingredientIds, ["ing-y"]);
    assert.equal(body.steps[1]?.ingredientIds, undefined);
    assert.deepEqual(body.steps[2]?.ingredientIds, ["ing-x"]);
  } finally {
    if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedKey;
  }
});
