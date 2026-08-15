import assert from "node:assert/strict";
import test from "node:test";
import {
  CLIPBOARD_EMPTY_MESSAGE,
  CLIPBOARD_UNSUPPORTED_MESSAGE,
  resolveClipboardImport,
  type ClipboardItemLike,
  type ClipboardReader
} from "../src/utils/clipboard-import";

function item(types: string[], payloads: Record<string, Blob | string>): ClipboardItemLike {
  return {
    types,
    async getType(type: string): Promise<Blob> {
      const payload = payloads[type];
      if (payload === undefined) {
        throw new Error(`type manquant: ${type}`);
      }
      return typeof payload === "string" ? new Blob([payload], { type }) : payload;
    }
  };
}

test("resolveClipboardImport: image seule → kind image", async () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
  const clipboard: ClipboardReader = {
    read: async () => [item(["image/png"], { "image/png": png })]
  };

  const result = await resolveClipboardImport(clipboard);
  assert.equal(result.kind, "image");
  if (result.kind !== "image") return;
  assert.equal(result.file.type, "image/png");
  assert.equal(result.file.name, "clipboard.png");
});

test("resolveClipboardImport: texte seul via readText → kind text", async () => {
  const clipboard: ClipboardReader = {
    readText: async () => "  Ma recette F2  "
  };

  const result = await resolveClipboardImport(clipboard);
  assert.deepEqual(result, { kind: "text", text: "Ma recette F2" });
});

test("resolveClipboardImport: texte seul via read items → kind text", async () => {
  const clipboard: ClipboardReader = {
    read: async () => [item(["text/plain"], { "text/plain": "Titre\nIngrédients" })]
  };

  const result = await resolveClipboardImport(clipboard);
  assert.deepEqual(result, { kind: "text", text: "Titre\nIngrédients" });
});

test("resolveClipboardImport: image + texte → priorité image", async () => {
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8])], { type: "image/jpeg" });
  let readTextCalled = false;
  const clipboard: ClipboardReader = {
    read: async () => [
      item(["image/jpeg", "text/plain"], {
        "image/jpeg": jpeg,
        "text/plain": "ne pas parser"
      })
    ],
    readText: async () => {
      readTextCalled = true;
      return "ne pas parser";
    }
  };

  const result = await resolveClipboardImport(clipboard);
  assert.equal(result.kind, "image");
  if (result.kind !== "image") return;
  assert.equal(result.file.type, "image/jpeg");
  assert.equal(result.file.name, "clipboard.jpg");
  assert.equal(readTextCalled, false);
});

test("resolveClipboardImport: plusieurs types image → premier utilisable", async () => {
  const png = new Blob([new Uint8Array([1])], { type: "image/png" });
  const webp = new Blob([new Uint8Array([2])], { type: "image/webp" });
  const clipboard: ClipboardReader = {
    read: async () => [
      item(["image/png", "image/webp"], {
        "image/png": png,
        "image/webp": webp
      })
    ]
  };

  const result = await resolveClipboardImport(clipboard);
  assert.equal(result.kind, "image");
  if (result.kind !== "image") return;
  assert.equal(result.file.type, "image/png");
});

test("resolveClipboardImport: vide → erreur presse-papiers vide", async () => {
  const clipboard: ClipboardReader = {
    read: async () => [],
    readText: async () => "   "
  };

  await assert.rejects(() => resolveClipboardImport(clipboard), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.message, CLIPBOARD_EMPTY_MESSAGE);
    return true;
  });
});

test("resolveClipboardImport: API absente → erreur collage manuel", async () => {
  await assert.rejects(() => resolveClipboardImport({}), (err: unknown) => {
    assert.ok(err instanceof Error);
    assert.equal(err.message, CLIPBOARD_UNSUPPORTED_MESSAGE);
    return true;
  });
});

test("resolveClipboardImport: NotAllowedError sur read est propagée", async () => {
  const denied = new DOMException("Permission denied", "NotAllowedError");
  const clipboard: ClipboardReader = {
    read: async () => {
      throw denied;
    },
    readText: async () => "fallback texte"
  };

  await assert.rejects(() => resolveClipboardImport(clipboard), (err: unknown) => {
    assert.equal(err, denied);
    return true;
  });
});

test("resolveClipboardImport: read indisponible, readText OK → texte (CAP-5)", async () => {
  const clipboard: ClipboardReader = {
    readText: async () => "recette collée"
  };

  const result = await resolveClipboardImport(clipboard);
  assert.deepEqual(result, { kind: "text", text: "recette collée" });
});

test("resolveClipboardImport: MIME image en majuscules → kind image", async () => {
  const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "IMAGE/PNG" });
  const clipboard: ClipboardReader = {
    read: async () => [item(["IMAGE/PNG"], { "IMAGE/PNG": png })]
  };

  const result = await resolveClipboardImport(clipboard);
  assert.equal(result.kind, "image");
  if (result.kind !== "image") return;
  assert.equal(result.file.type, "image/png");
  assert.equal(result.file.name, "clipboard.png");
});

test("resolveClipboardImport: blob image taille 0 → skip puis texte", async () => {
  const emptyPng = new Blob([], { type: "image/png" });
  const clipboard: ClipboardReader = {
    read: async () => [
      item(["image/png", "text/plain"], {
        "image/png": emptyPng,
        "text/plain": "fallback après image vide"
      })
    ]
  };

  const result = await resolveClipboardImport(clipboard);
  assert.deepEqual(result, { kind: "text", text: "fallback après image vide" });
});

test("resolveClipboardImport: getType image échoue → fallback texte", async () => {
  const clipboard: ClipboardReader = {
    read: async () => [
      {
        types: ["image/png", "text/plain"],
        async getType(type: string): Promise<Blob> {
          if (type === "image/png") {
            throw new Error("getType image indisponible");
          }
          return new Blob(["recette après échec image"], { type: "text/plain" });
        }
      }
    ]
  };

  const result = await resolveClipboardImport(clipboard);
  assert.deepEqual(result, { kind: "text", text: "recette après échec image" });
});

test("resolveClipboardImport: read [] puis readText avec contenu → texte", async () => {
  const clipboard: ClipboardReader = {
    read: async () => [],
    readText: async () => "  contenu via readText  "
  };

  const result = await resolveClipboardImport(clipboard);
  assert.deepEqual(result, { kind: "text", text: "contenu via readText" });
});

test("resolveClipboardImport: read non itérable → vide contrôlé puis readText", async () => {
  const clipboard: ClipboardReader = {
    // @ts-expect-error — mock navigateur défectueux
    read: async () => ({ not: "iterable" }),
    readText: async () => "secours texte"
  };

  const result = await resolveClipboardImport(clipboard);
  assert.deepEqual(result, { kind: "text", text: "secours texte" });
});
