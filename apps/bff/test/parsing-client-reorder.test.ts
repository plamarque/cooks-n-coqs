import assert from "node:assert/strict";
import test from "node:test";
import {
  extractStepNumberFromText,
  rematchReorderedSteps,
  reorderStepsByRecipeLogic,
  stepsHaveChronoConnectors,
  tryLightFirstStepReorder
} from "../src/parsing-client.js";
import type { ParsedInstructionStep } from "../src/types.js";

function step(
  id: string,
  order: number,
  text: string,
  media?: ParsedInstructionStep["media"]
): ParsedInstructionStep {
  return { id, order, text, ...(media ? { media } : {}) };
}

test("extractStepNumberFromText: motifs courants", () => {
  assert.equal(extractStepNumberFromText("3. Cuire"), 3);
  assert.equal(extractStepNumberFromText("1) Mélanger"), 1);
  assert.equal(extractStepNumberFromText("Étape 11 : égaliser"), 11);
  assert.equal(extractStepNumberFromText("Mélanger sans numéro"), undefined);
});

test("extractStepNumberFromText: espaces en tête", () => {
  assert.equal(extractStepNumberFromText("  1. Mélanger"), 1);
  assert.equal(extractStepNumberFromText("\t2) Cuire"), 2);
  assert.equal(extractStepNumberFromText("  Étape 3 : dresser"), 3);
});

test("extractStepNumberFromText: null/undefined et faux positifs quantité/durée", () => {
  assert.equal(extractStepNumberFromText(null), undefined);
  assert.equal(extractStepNumberFromText(undefined), undefined);
  assert.equal(extractStepNumberFromText("15 minutes de cuisson"), undefined);
  assert.equal(extractStepNumberFromText("3 œufs battus"), undefined);
  assert.equal(extractStepNumberFromText("1 Mélanger sans délimiteur"), undefined);
});

test("tryLightFirstStepReorder: numéros cohérents désordonnés → tri, confiant", () => {
  const input = [
    step("a", 1, "3. Cuire"),
    step("b", 2, "1. Mélanger"),
    step("c", 3, "2. Reposer")
  ];
  const result = tryLightFirstStepReorder(input);
  assert.equal(result.confident, true);
  assert.deepEqual(
    result.steps.map((s) => s.text),
    ["1. Mélanger", "2. Reposer", "3. Cuire"]
  );
  assert.deepEqual(
    result.steps.map((s) => s.id),
    ["b", "c", "a"]
  );
  assert.deepEqual(
    result.steps.map((s) => s.order),
    [1, 2, 3]
  );
});

test("rematchReorderedSteps: conserve ingredientIds", () => {
  const source: ParsedInstructionStep[] = [
    {
      id: "c",
      order: 1,
      text: "Cuire le tout",
      ingredientIds: ["ing-c"]
    },
    {
      id: "a",
      order: 2,
      text: "Mélanger",
      ingredientIds: ["ing-a", "ing-b"]
    },
    { id: "b", order: 3, text: "Reposer" }
  ];
  const out = rematchReorderedSteps(source, [
    { text: "Mélanger" },
    { text: "Reposer" },
    { text: "Cuire le tout" }
  ]);
  assert.deepEqual(
    out.map((s) => s.id),
    ["a", "b", "c"]
  );
  assert.deepEqual(out[0]?.ingredientIds, ["ing-a", "ing-b"]);
  assert.equal(out[1]?.ingredientIds, undefined);
  assert.deepEqual(out[2]?.ingredientIds, ["ing-c"]);
});

test("tryLightFirstStepReorder: confiant préserve ingredientIds", () => {
  const input: ParsedInstructionStep[] = [
    { id: "a", order: 1, text: "3. Cuire", ingredientIds: ["ing-x"] },
    { id: "b", order: 2, text: "1. Mélanger", ingredientIds: ["ing-y"] },
    { id: "c", order: 3, text: "2. Reposer" }
  ];
  const result = tryLightFirstStepReorder(input);
  assert.equal(result.confident, true);
  assert.deepEqual(result.steps[0]?.ingredientIds, ["ing-y"]);
  assert.equal(result.steps[1]?.ingredientIds, undefined);
  assert.deepEqual(result.steps[2]?.ingredientIds, ["ing-x"]);
});

test("tryLightFirstStepReorder: confiant préserve media", () => {
  const input = [
    step("a", 1, "3. Cuire", [{ type: "image", imageUrl: "https://ex/a.jpg" }]),
    step("b", 2, "1. Mélanger", [{ type: "video", url: "https://ex/b.mp4" }]),
    step("c", 3, "2. Reposer")
  ];
  const result = tryLightFirstStepReorder(input);
  assert.equal(result.confident, true);
  assert.deepEqual(
    result.steps.map((s) => s.id),
    ["b", "c", "a"]
  );
  assert.deepEqual(result.steps[0].media, [{ type: "video", url: "https://ex/b.mp4" }]);
  assert.equal(result.steps[1].media, undefined);
  assert.deepEqual(result.steps[2].media, [{ type: "image", imageUrl: "https://ex/a.jpg" }]);
});

test("tryLightFirstStepReorder: déjà dans l’ordre numéroté → identité confiante", () => {
  const input = [
    step("a", 1, "1. Mélanger"),
    step("b", 2, "2. Reposer"),
    step("c", 3, "3. Cuire")
  ];
  const result = tryLightFirstStepReorder(input);
  assert.equal(result.confident, true);
  assert.deepEqual(
    result.steps.map((s) => s.text),
    ["1. Mélanger", "2. Reposer", "3. Cuire"]
  );
  assert.deepEqual(
    result.steps.map((s) => s.order),
    [1, 2, 3]
  );
});

test("tryLightFirstStepReorder: doublons de numéros → non confiant", () => {
  const input = [
    step("a", 1, "1. A"),
    step("b", 2, "1. B"),
    step("c", 3, "2. C")
  ];
  const result = tryLightFirstStepReorder(input);
  assert.equal(result.confident, false);
  assert.equal(result.steps, input);
});

test("tryLightFirstStepReorder: mix numéroté / non → non confiant", () => {
  const input = [
    step("a", 1, "1. Mélanger"),
    step("b", 2, "Cuire sans numéro"),
    step("c", 3, "3. Servir")
  ];
  const result = tryLightFirstStepReorder(input);
  assert.equal(result.confident, false);
  assert.equal(result.steps, input);
});

test("tryLightFirstStepReorder: aucun numéro → non confiant (connecteurs n’inventent pas)", () => {
  const input = [
    step("a", 1, "Mélanger la farine"),
    step("b", 2, "Puis ajouter l’eau"),
    step("c", 3, "Enfin réserver au frais")
  ];
  assert.equal(stepsHaveChronoConnectors(input), true);
  const result = tryLightFirstStepReorder(input);
  assert.equal(result.confident, false);
  assert.equal(result.steps, input);
});

test("reorderStepsByRecipeLogic: ≤1 étape → inchangé, pas d’appel", async () => {
  let called = 0;
  const one = [step("a", 1, "Mélanger")];
  const out = await reorderStepsByRecipeLogic(one, async () => {
    called += 1;
    return [];
  });
  assert.equal(out, one);
  assert.equal(called, 0);
  assert.deepEqual(await reorderStepsByRecipeLogic([]), []);
});

test("reorderStepsByRecipeLogic: numérotées cohérentes + clé → tri, 0 appel LLM", async () => {
  const saved = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  let called = 0;
  try {
    const input = [
      step("a", 1, "3. Cuire"),
      step("b", 2, "1. Mélanger"),
      step("c", 3, "2. Reposer")
    ];
    const out = await reorderStepsByRecipeLogic(input, async () => {
      called += 1;
      return [{ text: "should-not-run" }];
    });
    assert.equal(called, 0);
    assert.deepEqual(
      out.map((s) => s.text),
      ["1. Mélanger", "2. Reposer", "3. Cuire"]
    );
    assert.deepEqual(
      out.map((s) => s.order),
      [1, 2, 3]
    );
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("reorderStepsByRecipeLogic: déjà ordonnées + clé → identité, 0 appel", async () => {
  const saved = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  let called = 0;
  try {
    const input = [
      step("a", 1, "1. A"),
      step("b", 2, "2. B"),
      step("c", 3, "3. C")
    ];
    const out = await reorderStepsByRecipeLogic(input, async () => {
      called += 1;
      return null;
    });
    assert.equal(called, 0);
    assert.deepEqual(
      out.map((s) => s.id),
      ["a", "b", "c"]
    );
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("reorderStepsByRecipeLogic: ambigu + clé → 1 appel, rematch id/media", async () => {
  const saved = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  let called = 0;
  try {
    const input = [
      step("c", 1, "Cuire le tout", [{ type: "image", imageUrl: "https://ex/c.jpg" }]),
      step("a", 2, "Mélanger"),
      step("b", 3, "Reposer", [{ type: "video", url: "https://ex/b.mp4" }])
    ];
    const out = await reorderStepsByRecipeLogic(input, async (steps) => {
      called += 1;
      assert.equal(steps.length, 3);
      return [{ text: "Mélanger" }, { text: "Reposer" }, { text: "Cuire le tout" }];
    });
    assert.equal(called, 1);
    assert.deepEqual(
      out.map((s) => s.id),
      ["a", "b", "c"]
    );
    assert.deepEqual(out[1].media, [{ type: "video", url: "https://ex/b.mp4" }]);
    assert.deepEqual(out[2].media, [{ type: "image", imageUrl: "https://ex/c.jpg" }]);
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("reorderStepsByRecipeLogic: sans clé → pas d’appel, ordre source si non confiant", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const input = [
      step("a", 1, "Cuire"),
      step("b", 2, "Mélanger"),
      step("c", 3, "Reposer")
    ];
    // Sans reorderFn ni clé : aucun réseau
    const out = await reorderStepsByRecipeLogic(input);
    assert.deepEqual(
      out.map((s) => s.id),
      ["a", "b", "c"]
    );

    // Heuristique confiante sans clé : tri par numéros, toujours sans réseau
    const numbered = [step("a", 1, "2. B"), step("b", 2, "1. A")];
    const sorted = await reorderStepsByRecipeLogic(numbered);
    assert.deepEqual(
      sorted.map((s) => s.text),
      ["1. A", "2. B"]
    );
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("reorderStepsByRecipeLogic: reorderFn sans clé → injection utilisée", async () => {
  const saved = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let called = 0;
  try {
    const input = [
      step("a", 1, "Cuire"),
      step("b", 2, "Mélanger")
    ];
    const out = await reorderStepsByRecipeLogic(input, async (steps) => {
      called += 1;
      assert.deepEqual(
        steps.map((s) => s.id),
        ["a", "b"]
      );
      return [{ text: "Mélanger" }, { text: "Cuire" }];
    });
    assert.equal(called, 1);
    assert.deepEqual(
      out.map((s) => s.id),
      ["b", "a"]
    );
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("reorderStepsByRecipeLogic: soft-fail LLM → ordre source (non confiant)", async () => {
  const saved = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-key";
  try {
    const input = [
      step("a", 1, "Cuire"),
      step("b", 2, "Mélanger")
    ];
    const softNull = await reorderStepsByRecipeLogic(input, async () => null);
    assert.deepEqual(
      softNull.map((s) => s.id),
      ["a", "b"]
    );

    const softEmpty = await reorderStepsByRecipeLogic(input, async () => []);
    assert.deepEqual(
      softEmpty.map((s) => s.id),
      ["a", "b"]
    );

    const softThrow = await reorderStepsByRecipeLogic(input, async () => {
      throw new Error("API down");
    });
    assert.deepEqual(
      softThrow.map((s) => s.id),
      ["a", "b"]
    );
  } finally {
    if (saved === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved;
  }
});

test("rematchReorderedSteps: texte normalisé ignore préfixe numéro", () => {
  const source = [
    step("x", 1, "2. Bravo"),
    step("y", 2, "1. Alpha")
  ];
  const out = rematchReorderedSteps(source, [{ text: "1. Alpha" }, { text: "Bravo" }]);
  assert.deepEqual(
    out.map((s) => s.id),
    ["y", "x"]
  );
});
