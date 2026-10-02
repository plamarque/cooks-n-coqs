import assert from "node:assert/strict";
import test from "node:test";
import { compressImageForTransfer, ImageTransferPreparationError } from "../src/services/import-service";
import { AssistantImageRequestError, prepareAssistantImages } from "../src/services/assistant-service";

function installCanvas(sizes: number[], options: { bitmapFails?: boolean; imageFails?: boolean; canvasFails?: boolean; blobFails?: boolean } = {}) {
  const previousBitmap = globalThis.createImageBitmap;
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const previousUrl = globalThis.URL.createObjectURL;
  const previousRevoke = globalThis.URL.revokeObjectURL;
  let closed = 0;
  let active = 0;
  let maximumActive = 0;
  let calls = 0;
  const encodes: Array<{ width: number; height: number; quality: number }> = [];
  globalThis.createImageBitmap = (async () => {
    if (options.bitmapFails) throw new Error("bitmap unavailable");
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    return { width: 3000, height: 2000, close: () => { closed += 1; active -= 1; } } as ImageBitmap;
  }) as typeof createImageBitmap;
  globalThis.document = { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => options.canvasFails ? null : { drawImage: () => undefined }, toBlob: (resolve: (blob: Blob | null) => void, _type: string, quality: number) => {
      encodes.push({ width: canvas.width, height: canvas.height, quality });
      resolve(options.blobFails ? null : new Blob([new Uint8Array(sizes[Math.min(calls++, sizes.length - 1)])], { type: "image/jpeg" }));
    } };
    return canvas;
  } } as unknown as Document;
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = () => undefined;
  globalThis.Image = class { src = ""; naturalWidth = 3000; naturalHeight = 2000; async decode() { if (options.imageFails) throw new Error("invalid image"); } } as unknown as typeof Image;
  return { encodes, get closed() { return closed; }, get maximumActive() { return maximumActive; }, get calls() { return calls; }, restore() { globalThis.createImageBitmap = previousBitmap; globalThis.document = previousDocument; globalThis.Image = previousImage; URL.createObjectURL = previousUrl; URL.revokeObjectURL = previousRevoke; } };
}

test("compression bornée : réduit dimensions et qualité jusqu'au plafond, puis libère le bitmap", async () => {
  const mock = installCanvas([5_000_000, 4_500_000, 4_100_000, 4_050_000, 3_900_000]);
  try {
    const file = new File([new Uint8Array(5_000_000)], "recette.png", { type: "image/png" });
    const result = await compressImageForTransfer(file, 4 * 1024 * 1024);
    assert.ok(result.size <= 4 * 1024 * 1024);
    assert.equal(result.type, "image/jpeg");
    assert.equal(mock.calls, 3);
    assert.deepEqual(mock.encodes, [
      { width: 1600, height: 1067, quality: 0.82 },
      { width: 1600, height: 1067, quality: 0.68 },
      { width: 1600, height: 1067, quality: 0.55 }
    ]);
    assert.equal(mock.closed, 1);
  } finally { mock.restore(); }
});

test("compression bornée : un petit fichier est transmis sans dégradation", async () => {
  const mock = installCanvas([1000]);
  const original = new File(["pixels"], "petite.png", { type: "image/png" });
  try { assert.equal(await compressImageForTransfer(original, 4 * 1024 * 1024), original); assert.equal(mock.closed, 1); assert.equal(mock.calls, 0); }
  finally { mock.restore(); }
});

test("compression bornée : petit PNG corrompu refusé et HEIC décodable normalisé en JPEG", async () => {
  const corrupt = installCanvas([1000], { bitmapFails: true, imageFails: true });
  try { await assert.rejects(compressImageForTransfer(new File(["bad"], "bad.png", { type: "image/png" }), 4 * 1024 * 1024), (error: unknown) => error instanceof ImageTransferPreparationError && error.reason === "conversion"); }
  finally { corrupt.restore(); }
  const heic = installCanvas([1000]);
  try {
    const result = await compressImageForTransfer(new File(["heic"], "plat.heic", { type: "image/heic" }), 4 * 1024 * 1024);
    assert.equal(result.type, "image/jpeg");
    assert.equal(result.size, 1000);
    assert.equal(heic.calls, 1);
  } finally { heic.restore(); }
  const withoutType = installCanvas([1000]);
  try {
    const result = await compressImageForTransfer(new File(["image"], "photo", { type: "" }), 4 * 1024 * 1024);
    assert.equal(result.type, "image/jpeg");
    assert.equal(withoutType.calls, 1);
  } finally { withoutType.restore(); }
});

test("compression bornée : réduit les dimensions après trois qualités encore trop lourdes", async () => {
  const mock = installCanvas([5_000_000, 5_000_000, 5_000_000, 3_900_000]);
  try {
    const file = new File([new Uint8Array(5_000_000)], "recette.jpg", { type: "image/jpeg" });
    const result = await compressImageForTransfer(file, 4 * 1024 * 1024);
    assert.equal(result.size, 3_900_000);
    assert.equal(mock.calls, 4);
    assert.deepEqual(mock.encodes, [
      { width: 1600, height: 1067, quality: 0.82 },
      { width: 1600, height: 1067, quality: 0.68 },
      { width: 1600, height: 1067, quality: 0.55 },
      { width: 1400, height: 933, quality: 0.82 }
    ]);
    assert.equal(mock.closed, 1);
  } finally { mock.restore(); }
});

test("compression bornée : repli navigateur si createImageBitmap échoue", async () => {
  const mock = installCanvas([1000], { bitmapFails: true });
  try {
    const result = await compressImageForTransfer(new File([new Uint8Array(5_000_000)], "recette.png", { type: "image/png" }), 4 * 1024 * 1024);
    assert.equal(result.size, 1000);
  } finally { mock.restore(); }
});

test("compression bornée : une conversion impossible et un résultat trop lourd sont typés", async () => {
  const file = new File([new Uint8Array(5_000_000)], "recette.png", { type: "image/png" });
  const failedCanvas = installCanvas([1000], { canvasFails: true });
  try { await assert.rejects(compressImageForTransfer(file, 4 * 1024 * 1024), (error: unknown) => error instanceof ImageTransferPreparationError && error.reason === "conversion"); }
  finally { failedCanvas.restore(); }
  const heavy = installCanvas([5_000_000]);
  try {
    await assert.rejects(compressImageForTransfer(file, 4 * 1024 * 1024), (error: unknown) => error instanceof ImageTransferPreparationError && error.reason === "size" && error.resultBytes === 5_000_000);
    assert.equal(heavy.closed, 1);
    assert.equal(heavy.encodes.length, 9);
    assert.equal(heavy.encodes.at(-1)?.width, 1200);
  }
  finally { heavy.restore(); }
  const failedBlob = installCanvas([1000], { blobFails: true });
  try { await assert.rejects(compressImageForTransfer(file, 4 * 1024 * 1024), (error: unknown) => error instanceof ImageTransferPreparationError && error.reason === "conversion"); assert.equal(failedBlob.closed, 1); }
  finally { failedBlob.restore(); }
});

test("préparation Assistant : quatre photos séquentielles, arrêt avant réseau en cas d'échec", async () => {
  const mock = installCanvas([1000]);
  try {
    const files = Array.from({ length: 4 }, (_, index) => new File([new Uint8Array(5_000_000)], `photo-${index}.png`, { type: "image/png" }));
    const result = await prepareAssistantImages(files, () => true);
    assert.deepEqual(result?.map((file) => file.size), [1000, 1000, 1000, 1000]);
    assert.equal(mock.maximumActive, 1);
  } finally { mock.restore(); }
  const failed = installCanvas([1000], { canvasFails: true });
  try {
    await assert.rejects(prepareAssistantImages([new File([new Uint8Array(5_000_000)], "bad.png", { type: "image/png" })], () => true), (error: unknown) => error instanceof AssistantImageRequestError && error.preparationReason === "conversion" && error.imageIndex === 1);
  } finally { failed.restore(); }
});

test("préparation Assistant : la photo 2 en échec arrête le lot ; six fichiers sont refusés avant décodage", async () => {
  const mock = installCanvas([1000, 5_000_000]);
  const files = Array.from({ length: 3 }, (_, index) => new File([new Uint8Array(5_000_000)], `photo-${index}.png`, { type: "image/png" }));
  try {
    await assert.rejects(prepareAssistantImages(files, () => true), (error: unknown) => error instanceof AssistantImageRequestError && error.preparationReason === "size" && error.imageIndex === 2);
    assert.equal(mock.closed, 2);
    const callsBefore = mock.calls;
    await assert.rejects(prepareAssistantImages([...files, ...files], () => true), (error: unknown) => error instanceof AssistantImageRequestError && error.preparationReason === "count");
    assert.equal(mock.calls, callsBefore);
  } finally { mock.restore(); }
});

test("préparation Assistant : annulation pendant le deuxième encodage ignore le résultat tardif", async () => {
  const mock = installCanvas([1000]);
  let current = true;
  let checks = 0;
  try {
    const files = Array.from({ length: 4 }, (_, index) => new File([new Uint8Array(5_000_000)], `photo-${index}.png`, { type: "image/png" }));
    const result = await prepareAssistantImages(files, () => { checks += 1; if (checks === 4) current = false; return current; });
    assert.equal(result, null);
    assert.equal(mock.closed, 2);
  } finally { mock.restore(); }
});
