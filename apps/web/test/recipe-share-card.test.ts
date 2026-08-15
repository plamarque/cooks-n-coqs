import assert from "node:assert/strict";
import test from "node:test";
import type { Recipe } from "@cookies-et-coquilettes/domain";
import {
  RECIPE_SHARE_CARD_COLORS,
  RECIPE_SHARE_CARD_CTA_LABEL,
  RECIPE_SHARE_CARD_SIZE,
  buildRecipeShareCardFile,
  formatShareCardServings,
  layoutContainsForbiddenChrome,
  planRecipeShareCardLayout
} from "../src/utils/recipe-share-card";

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id: "r1",
    title: "Tiramisu",
    category: "SUCRE",
    favorite: false,
    servingsBase: 6,
    ingredients: [
      {
        id: "i1",
        order: 1,
        label: "mascarpone",
        quantity: 500,
        quantityBase: 500,
        unit: "g",
        isScalable: true
      },
      {
        id: "i2",
        order: 2,
        label: "œufs",
        quantity: 4,
        quantityBase: 4,
        unit: "",
        isScalable: true,
        rawText: "4 œufs"
      }
    ],
    steps: [{ id: "s1", order: 1, text: "Séparer les blancs des jaunes." }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

test("formatShareCardServings omits when absent", () => {
  assert.equal(formatShareCardServings(undefined), null);
  assert.equal(formatShareCardServings(null), null);
  assert.equal(formatShareCardServings(0), null);
  assert.equal(formatShareCardServings(0.4), "0,4 portions");
  assert.equal(formatShareCardServings(6), "6 portions");
  assert.equal(formatShareCardServings(1), "1 portion");
  assert.equal(formatShareCardServings(6.5), "6,5 portions");
});

test("planRecipeShareCardLayout: full-bleed photo, CTA band, logo top-right, no fiche", () => {
  const layout = planRecipeShareCardLayout(baseRecipe({ imageId: "img1" }), {
    hasPhoto: true
  });
  assert.equal(layout.size, RECIPE_SHARE_CARD_SIZE);
  assert.equal(layout.photoHeight, RECIPE_SHARE_CARD_SIZE);
  assert.equal(layout.cta.label, RECIPE_SHARE_CARD_CTA_LABEL);
  assert.ok(layout.cta.y + layout.cta.height === layout.size);
  assert.equal(layout.hasPhoto, true);
  assert.ok(layout.logo.x > layout.size / 2);
  assert.ok(layout.logo.y < layout.size / 4);
  assert.equal(layoutContainsForbiddenChrome(layout), false);
  assert.ok(!/cuisiner|retour/i.test(layout.cta.label));
});

test("planRecipeShareCardLayout without photo", () => {
  const layout = planRecipeShareCardLayout(
    baseRecipe({ imageId: undefined, servingsBase: undefined }),
    { hasPhoto: false }
  );
  assert.equal(layout.hasPhoto, false);
  assert.equal(layout.cta.label, RECIPE_SHARE_CARD_CTA_LABEL);
});

test("buildRecipeShareCardFile exports PNG — photo/placeholder + CTA + logo, pas de fiche", async () => {
  const draws: string[] = [];
  const fakeCanvas = {
    width: 0,
    height: 0
  } as unknown as HTMLCanvasElement;

  const file = await buildRecipeShareCardFile(
    baseRecipe(),
    { imageBlob: null, faviconUrl: "/favicon.svg" },
    {
      createCanvas: (w, h) => {
        assert.equal(w, RECIPE_SHARE_CARD_SIZE);
        assert.equal(h, RECIPE_SHARE_CARD_SIZE);
        const ctx = {
          fillStyle: "",
          font: "",
          textBaseline: "top",
          globalAlpha: 1,
          shadowColor: "",
          shadowBlur: 0,
          shadowOffsetY: 0,
          fillRect() {
            draws.push("fillRect");
          },
          beginPath() {},
          arc() {
            draws.push("placeholder-arc");
          },
          fill() {},
          fillText(text: string) {
            draws.push(`text:${text}`);
          },
          measureText(text: string) {
            return { width: text.length * 10 };
          },
          drawImage() {
            draws.push("drawImage");
          },
          save() {},
          restore() {},
          moveTo() {},
          arcTo() {},
          closePath() {}
        } as unknown as CanvasRenderingContext2D;
        return { canvas: fakeCanvas, ctx };
      },
      loadImage: async () => {
        draws.push("logo");
        return {} as CanvasImageSource;
      },
      toBlob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
    }
  );

  assert.ok(file);
  assert.equal(file!.type, "image/png");
  assert.ok(file!.name.endsWith("-share.png"));
  assert.ok(draws.includes("placeholder-arc"), "placeholder sage sans photo");
  assert.ok(draws.includes("logo"));
  assert.ok(draws.some((d) => d === `text:${RECIPE_SHARE_CARD_CTA_LABEL}`));
  assert.ok(!draws.some((d) => /https?:/i.test(d)), "CTA image sans URL");
  assert.ok(!/https?:/i.test(RECIPE_SHARE_CARD_CTA_LABEL));
  assert.ok(!draws.some((d) => d.startsWith("text:Tiramisu")), "pas de titre sur l’image");
  assert.ok(!draws.some((d) => d.includes("6 portions")), "pas de portions sur l’image");
  assert.ok(!draws.some((d) => /mascarpone|œufs/i.test(d)), "pas d’ingrédients sur l’image");
  assert.ok(!draws.some((d) => /cuisiner|retour|♥/i.test(d)));
  assert.equal(RECIPE_SHARE_CARD_COLORS.primary, "#1f4f46");
});

test("buildRecipeShareCardFile closes ImageBitmap even when drawCover throws", async () => {
  const draws: string[] = [];
  const fakeCanvas = {} as HTMLCanvasElement;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  (globalThis as { createImageBitmap: unknown }).createImageBitmap = async () => ({
    width: 200,
    height: 200,
    close() {
      draws.push("bitmap-close");
    }
  });

  try {
    const file = await buildRecipeShareCardFile(
      baseRecipe(),
      { imageBlob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) },
      {
        createCanvas: () => {
          const ctx = {
            fillStyle: "",
            font: "",
            textBaseline: "top",
            globalAlpha: 1,
            shadowColor: "",
            shadowBlur: 0,
            shadowOffsetY: 0,
            drawImage() {
              throw new Error("draw boom");
            },
            save() {},
            restore() {
              draws.push("restore");
            },
            beginPath() {},
            rect() {},
            clip() {},
            moveTo() {},
            arcTo() {},
            closePath() {},
            arc() {
              draws.push("placeholder-arc");
            },
            fill() {},
            fillRect() {},
            fillText() {},
            measureText: () => ({ width: 10 })
          } as unknown as CanvasRenderingContext2D;
          return { canvas: fakeCanvas, ctx };
        },
        loadImage: async () => ({}) as CanvasImageSource,
        toBlob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
      }
    );
    assert.ok(file);
    assert.ok(draws.includes("bitmap-close"));
    assert.ok(draws.includes("placeholder-arc"));
  } finally {
    if (originalCreateImageBitmap) {
      globalThis.createImageBitmap = originalCreateImageBitmap;
    } else {
      delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
    }
  }
});

test("buildRecipeShareCardFile with imageBlob draws photo not placeholder", async () => {
  const draws: string[] = [];
  const fakeCanvas = {} as HTMLCanvasElement;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  (globalThis as { createImageBitmap: unknown }).createImageBitmap = async () => ({
    width: 200,
    height: 200,
    close() {
      draws.push("bitmap-close");
    }
  });

  try {
    const file = await buildRecipeShareCardFile(
      baseRecipe(),
      { imageBlob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }) },
      {
        createCanvas: () => {
          const ctx = {
            fillStyle: "",
            font: "",
            textBaseline: "top",
            globalAlpha: 1,
            shadowColor: "",
            shadowBlur: 0,
            shadowOffsetY: 0,
            drawImage() {
              draws.push("drawImage-photo");
            },
            save() {
              draws.push("save");
            },
            restore() {
              draws.push("restore");
            },
            beginPath() {},
            rect() {
              draws.push("clip-rect");
            },
            clip() {
              draws.push("clip");
            },
            moveTo() {},
            arcTo() {},
            closePath() {},
            arc() {
              draws.push("placeholder-arc");
            },
            fill() {},
            fillRect() {
              draws.push("fillRect");
            },
            fillText(text: string) {
              draws.push(`text:${text}`);
            },
            measureText(text: string) {
              return { width: text.length * 10 };
            }
          } as unknown as CanvasRenderingContext2D;
          return { canvas: fakeCanvas, ctx };
        },
        loadImage: async () => {
          draws.push("logo");
          return {} as CanvasImageSource;
        },
        toBlob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
      }
    );

    assert.ok(file);
    assert.ok(draws.includes("drawImage-photo"));
    assert.ok(draws.includes("clip"));
    assert.ok(draws.includes("clip-rect"));
    assert.ok(!draws.includes("placeholder-arc"));
    assert.ok(draws.some((d) => d === `text:${RECIPE_SHARE_CARD_CTA_LABEL}`));
    assert.ok(!draws.some((d) => /https?:/i.test(d)), "CTA image sans URL");
    assert.equal(file!.type, "image/png");
  } finally {
    if (originalCreateImageBitmap) {
      globalThis.createImageBitmap = originalCreateImageBitmap;
    } else {
      delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
    }
  }
});

test("buildRecipeShareCardFile falls back to placeholder when photo decode fails", async () => {
  const draws: string[] = [];
  const fakeCanvas = {} as HTMLCanvasElement;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  (globalThis as { createImageBitmap?: unknown }).createImageBitmap = async () => {
    throw new Error("bad bitmap");
  };
  const originalImage = globalThis.Image;
  class FailingImage {
    onload: ((ev?: unknown) => void) | null = null;
    onerror: ((ev?: unknown) => void) | null = null;
    decoding = "";
    set src(_v: string) {
      queueMicrotask(() => this.onerror?.(new Error("fail")));
    }
  }
  (globalThis as { Image: unknown }).Image = FailingImage;

  try {
    const file = await buildRecipeShareCardFile(
      baseRecipe(),
      { imageBlob: new Blob([new Uint8Array([1])], { type: "image/png" }) },
      {
        createCanvas: () => {
          const ctx = {
            fillStyle: "",
            font: "",
            textBaseline: "top",
            globalAlpha: 1,
            shadowColor: "",
            shadowBlur: 0,
            shadowOffsetY: 0,
            fillRect() {},
            beginPath() {},
            arc() {
              draws.push("placeholder-arc");
            },
            fill() {},
            fillText() {},
            measureText: () => ({ width: 0 }),
            drawImage() {
              draws.push("drawImage");
            },
            save() {},
            restore() {},
            moveTo() {},
            arcTo() {},
            closePath() {}
          } as unknown as CanvasRenderingContext2D;
          return { canvas: fakeCanvas, ctx };
        },
        loadImage: async () => {
          draws.push("logo");
          return {} as CanvasImageSource;
        },
        toBlob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
      }
    );
    assert.ok(file);
    assert.ok(draws.includes("placeholder-arc"));
  } finally {
    if (originalCreateImageBitmap) {
      globalThis.createImageBitmap = originalCreateImageBitmap;
    } else {
      delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
    }
    (globalThis as { Image: unknown }).Image = originalImage;
  }
});

test("buildRecipeShareCardFile returns null when toBlob fails", async () => {
  const fakeCanvas = {} as HTMLCanvasElement;
  const file = await buildRecipeShareCardFile(
    baseRecipe(),
    {},
    {
      createCanvas: () => ({
        canvas: fakeCanvas,
        ctx: {
          fillStyle: "",
          font: "",
          textBaseline: "top",
          globalAlpha: 1,
          shadowColor: "",
          shadowBlur: 0,
          shadowOffsetY: 0,
          fillRect() {},
          beginPath() {},
          arc() {},
          fill() {},
          fillText() {},
          measureText: () => ({ width: 0 }),
          drawImage() {},
          save() {},
          restore() {},
          moveTo() {},
          arcTo() {},
          closePath() {},
          rect() {},
          clip() {}
        } as unknown as CanvasRenderingContext2D
      }),
      loadImage: async () => {
        throw new Error("no logo");
      },
      toBlob: async () => null
    }
  );
  assert.equal(file, null);
});

test("buildRecipeShareCardFile uses placeholder when photo is 0x0", async () => {
  const draws: string[] = [];
  const fakeCanvas = {} as HTMLCanvasElement;
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  globalThis.createImageBitmap = (async () => ({
    width: 0,
    height: 0,
    close() {}
  })) as typeof createImageBitmap;

  try {
    const file = await buildRecipeShareCardFile(
      baseRecipe(),
      { imageBlob: new Blob([new Uint8Array([1])], { type: "image/png" }) },
      {
        createCanvas: () => ({
          canvas: fakeCanvas,
          ctx: {
            fillStyle: "",
            font: "",
            textBaseline: "top",
            globalAlpha: 1,
            shadowColor: "",
            shadowBlur: 0,
            shadowOffsetY: 0,
            fillRect() {},
            beginPath() {},
            rect() {},
            clip() {},
            arc() {
              draws.push("placeholder-arc");
            },
            fill() {},
            fillText() {},
            measureText: () => ({ width: 10 }),
            drawImage() {
              draws.push("drawImage");
            },
            save() {},
            restore() {},
            moveTo() {},
            arcTo() {},
            closePath() {}
          } as unknown as CanvasRenderingContext2D
        }),
        loadImage: async () => ({}) as CanvasImageSource,
        toBlob: async () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })
      }
    );
    assert.ok(file);
    assert.ok(draws.includes("placeholder-arc"));
    assert.ok(!draws.includes("drawImage-photo"));
  } finally {
    globalThis.createImageBitmap = originalCreateImageBitmap;
  }
});
