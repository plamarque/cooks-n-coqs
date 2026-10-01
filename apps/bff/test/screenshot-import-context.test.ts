import assert from "node:assert/strict";
import test from "node:test";
import { screenshotParseInput } from "../src/server";

test("import screenshot : contextText multipart devient text pour parseRecipeWithCloud", () => {
  const input = screenshotParseInput(
    { buffer: Buffer.from("image"), mimetype: "image/png" },
    "notes déjà présentes"
  );
  assert.deepEqual(input, {
    sourceType: "SCREENSHOT",
    text: "notes déjà présentes",
    screenshotBase64: Buffer.from("image").toString("base64"),
    screenshotMimeType: "image/png"
  });
});

test("import screenshot : contextText absent ne devient pas une chaîne artificielle", () => {
  assert.equal(screenshotParseInput({ buffer: Buffer.from("x"), mimetype: "image/jpeg" }, undefined).text, undefined);
});
