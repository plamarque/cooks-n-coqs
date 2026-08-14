import assert from "node:assert/strict";
import test from "node:test";
import { shareRecipeTextNative } from "../src/services/recipe-native-share";

function pngFile(name = "card.png"): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });
}

test("shareRecipeTextNative uses navigator.share when available", async () => {
  const calls: ShareData[] = [];
  const result = await shareRecipeTextNative(
    { text: "Titre:\nTiramisu" },
    {
      canShare: () => true,
      share: async (data) => {
        calls.push(data);
      }
    }
  );
  assert.deepEqual(result, { ok: true, method: "share" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.text, "Titre:\nTiramisu");
  assert.equal(calls[0]?.title, undefined);
});

test("shareRecipeTextNative with files when canShare accepts files", async () => {
  const calls: ShareData[] = [];
  const file = pngFile();
  const result = await shareRecipeTextNative(
    { text: "Titre:\nTiramisu", file },
    {
      canShare: (data) => Boolean(data.files?.length),
      share: async (data) => {
        calls.push(data);
      }
    }
  );
  assert.deepEqual(result, { ok: true, method: "share" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.text, "Titre:\nTiramisu");
  assert.equal(calls[0]?.title, undefined);
  assert.equal(calls[0]?.url, undefined);
  assert.equal(calls[0]?.files?.length, 1);
  assert.equal(calls[0]?.files?.[0], file);
});

test("shareRecipeTextNative degrades to text-only when canShare rejects files", async () => {
  const calls: ShareData[] = [];
  const result = await shareRecipeTextNative(
    { text: "F2 body", file: pngFile() },
    {
      canShare: (data) => !data.files?.length,
      share: async (data) => {
        calls.push(data);
      }
    }
  );
  assert.deepEqual(result, { ok: true, method: "share" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.text, "F2 body");
  assert.equal(calls[0]?.files, undefined);
  assert.equal(calls[0]?.title, undefined);
});

test("shareRecipeTextNative degrades to text-only when share(files) throws non-abort", async () => {
  const calls: ShareData[] = [];
  const result = await shareRecipeTextNative(
    { text: "F2 body", file: pngFile() },
    {
      canShare: () => true,
      share: async (data) => {
        calls.push(data);
        if (data.files?.length) {
          throw new Error("files not supported");
        }
      }
    }
  );
  assert.deepEqual(result, { ok: true, method: "share" });
  assert.equal(calls.length, 2);
  assert.ok(calls[0]?.files?.length);
  assert.equal(calls[1]?.files, undefined);
  assert.equal(calls[1]?.text, "F2 body");
  assert.equal(calls[1]?.title, undefined);
});

test("shareRecipeTextNative files AbortError stays aborted (no clipboard)", async () => {
  let clipboardCalls = 0;
  const result = await shareRecipeTextNative(
    { text: "hello", file: pngFile() },
    {
      canShare: () => true,
      share: async () => {
        const err = new Error("user cancelled");
        err.name = "AbortError";
        throw err;
      },
      writeText: async () => {
        clipboardCalls += 1;
      },
      legacyCopy: () => {
        clipboardCalls += 1;
        return false;
      }
    }
  );
  assert.deepEqual(result, { ok: false, reason: "aborted" });
  assert.equal(clipboardCalls, 0);
});

test("shareRecipeTextNative treats AbortError as aborted (no clipboard)", async () => {
  let clipboardCalls = 0;
  const result = await shareRecipeTextNative(
    { text: "hello" },
    {
      canShare: () => true,
      share: async () => {
        const err = new Error("user cancelled");
        err.name = "AbortError";
        throw err;
      },
      writeText: async () => {
        clipboardCalls += 1;
      },
      legacyCopy: () => {
        clipboardCalls += 1;
        return false;
      }
    }
  );
  assert.deepEqual(result, { ok: false, reason: "aborted" });
  assert.equal(clipboardCalls, 0);
});

test("shareRecipeTextNative falls back to clipboard when share missing", async () => {
  let copied = "";
  const result = await shareRecipeTextNative(
    { text: "F2 body" },
    {
      writeText: async (text) => {
        copied = text;
      }
    }
  );
  assert.deepEqual(result, { ok: true, method: "clipboard" });
  assert.equal(copied, "F2 body");
});

test("shareRecipeTextNative falls back to clipboard when share throws non-abort", async () => {
  let copied = "";
  const result = await shareRecipeTextNative(
    { text: "F2 body" },
    {
      canShare: () => true,
      share: async () => {
        throw new Error("not allowed");
      },
      writeText: async (text) => {
        copied = text;
      }
    }
  );
  assert.deepEqual(result, { ok: true, method: "clipboard" });
  assert.equal(copied, "F2 body");
});

test("shareRecipeTextNative uses legacyCopy when clipboard API fails", async () => {
  let legacy = "";
  const result = await shareRecipeTextNative(
    { text: "legacy body" },
    {
      writeText: async () => {
        throw new Error("secure context required");
      },
      legacyCopy: (text) => {
        legacy = text;
        return true;
      }
    }
  );
  assert.deepEqual(result, { ok: true, method: "clipboard" });
  assert.equal(legacy, "legacy body");
});

test("shareRecipeTextNative returns needs-manual-copy with text when all copy paths fail", async () => {
  const result = await shareRecipeTextNative(
    { text: "manual F2" },
    {
      writeText: async () => {
        throw new Error("denied");
      },
      legacyCopy: () => false
    }
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "needs-manual-copy");
    assert.equal(result.text, "manual F2");
  }
});

test("shareRecipeTextNative returns error when empty text", async () => {
  const result = await shareRecipeTextNative({ text: "   " });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "error");
  }
});

test("shareRecipeTextNative without canShare skips files and shares text", async () => {
  const calls: ShareData[] = [];
  const result = await shareRecipeTextNative(
    { text: "F2 only", file: pngFile() },
    {
      share: async (data) => {
        calls.push(data);
      }
    }
  );
  assert.deepEqual(result, { ok: true, method: "share" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.files, undefined);
  assert.equal(calls[0]?.title, undefined);
});

test("shareRecipeTextNative degrades when canShare throws", async () => {
  let copied = "";
  const result = await shareRecipeTextNative(
    { text: "F2 body", file: pngFile() },
    {
      canShare: () => {
        throw new Error("canShare boom");
      },
      share: async () => {
        throw new Error("should not share");
      },
      writeText: async (text) => {
        copied = text;
      }
    }
  );
  assert.deepEqual(result, { ok: true, method: "clipboard" });
  assert.equal(copied, "F2 body");
});
