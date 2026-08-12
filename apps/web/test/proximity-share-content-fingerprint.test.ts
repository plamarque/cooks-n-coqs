import assert from "node:assert/strict";
import test from "node:test";
import {
  proximityShareContentFingerprint,
  shouldCloseProximityShareForStaleContent,
  type ProximityShareFingerprintInput
} from "../src/utils/proximity-share-content-fingerprint";

function baseRecipe(
  overrides: Partial<ProximityShareFingerprintInput> = {}
): ProximityShareFingerprintInput {
  return {
    title: "Tarte",
    servingsBase: 4,
    source: { url: "https://example.com/tarte" },
    ingredients: [
      {
        id: "ing-1",
        order: 1,
        label: "Farine",
        quantity: 200,
        quantityBase: 200,
        unit: "g",
        isScalable: true,
        rawText: "200 g farine"
      }
    ],
    steps: [{ id: "step-1", order: 1, text: "Mélanger" }],
    ...overrides
  };
}

test("empreintes égales si contenu partageable inchangé (y compris ids différents)", () => {
  const a = baseRecipe();
  const b = baseRecipe({
    ingredients: [
      {
        id: "autre-id",
        order: 1,
        label: "Farine",
        quantity: 200,
        quantityBase: 200,
        unit: "g",
        isScalable: true,
        rawText: "200 g farine"
      }
    ],
    steps: [{ id: "autre-step", order: 1, text: "Mélanger" }]
  });
  assert.equal(
    proximityShareContentFingerprint(a),
    proximityShareContentFingerprint(b)
  );
});

test("divergence label / quantity / unit / order / isScalable / quantityBase / rawText d’un ingrédient", () => {
  const stable = proximityShareContentFingerprint(baseRecipe());

  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        ingredients: [
          {
            id: "ing-1",
            order: 1,
            label: "Sucre",
            quantity: 200,
            quantityBase: 200,
            unit: "g",
            isScalable: true,
            rawText: "200 g farine"
          }
        ]
      })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        ingredients: [
          {
            id: "ing-1",
            order: 1,
            label: "Farine",
            quantity: 250,
            quantityBase: 200,
            unit: "g",
            isScalable: true,
            rawText: "200 g farine"
          }
        ]
      })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        ingredients: [
          {
            id: "ing-1",
            order: 1,
            label: "Farine",
            quantity: 200,
            quantityBase: 200,
            unit: "kg",
            isScalable: true,
            rawText: "200 g farine"
          }
        ]
      })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        ingredients: [
          {
            id: "ing-1",
            order: 2,
            label: "Farine",
            quantity: 200,
            quantityBase: 200,
            unit: "g",
            isScalable: true,
            rawText: "200 g farine"
          }
        ]
      })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        ingredients: [
          {
            id: "ing-1",
            order: 1,
            label: "Farine",
            quantity: 200,
            quantityBase: 200,
            unit: "g",
            isScalable: false,
            rawText: "200 g farine"
          }
        ]
      })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        ingredients: [
          {
            id: "ing-1",
            order: 1,
            label: "Farine",
            quantity: 200,
            quantityBase: 180,
            unit: "g",
            isScalable: true,
            rawText: "200 g farine"
          }
        ]
      })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        ingredients: [
          {
            id: "ing-1",
            order: 1,
            label: "Farine",
            quantity: 200,
            quantityBase: 200,
            unit: "g",
            isScalable: true,
            rawText: "farine T45"
          }
        ]
      })
    )
  );
});

test("divergence ajout ou suppression d’un ingrédient / d’une étape", () => {
  const stable = proximityShareContentFingerprint(baseRecipe());

  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        ingredients: [
          ...(baseRecipe().ingredients ?? []),
          {
            id: "ing-2",
            order: 2,
            label: "Sucre",
            quantity: 50,
            unit: "g",
            isScalable: false,
            rawText: "50 g sucre"
          }
        ]
      })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(baseRecipe({ ingredients: [] }))
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        steps: [
          ...(baseRecipe().steps ?? []),
          { id: "step-2", order: 2, text: "Cuire" }
        ]
      })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(baseRecipe({ steps: [] }))
  );
});

test("divergence texte ou ordre d’une étape", () => {
  const stable = proximityShareContentFingerprint(baseRecipe());

  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        steps: [{ id: "step-1", order: 1, text: "Cuire" }]
      })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({
        steps: [{ id: "step-1", order: 2, text: "Mélanger" }]
      })
    )
  );
});

test("divergence servingsBase", () => {
  const a = proximityShareContentFingerprint(baseRecipe({ servingsBase: 4 }));
  const b = proximityShareContentFingerprint(baseRecipe({ servingsBase: 6 }));
  assert.notEqual(a, b);
});

test("divergence url source ou titre", () => {
  const stable = proximityShareContentFingerprint(baseRecipe());

  assert.notEqual(
    stable,
    proximityShareContentFingerprint(
      baseRecipe({ source: { url: "https://example.com/autre" } })
    )
  );
  assert.notEqual(
    stable,
    proximityShareContentFingerprint(baseRecipe({ title: "Autre titre" }))
  );
});

test("champ hors empreinte (favorite) n’affecte pas le fingerprint", () => {
  const a = {
    ...baseRecipe(),
    favorite: false
  } as ProximityShareFingerprintInput & { favorite: boolean };
  const b = {
    ...baseRecipe(),
    favorite: true
  } as ProximityShareFingerprintInput & { favorite: boolean };
  assert.equal(
    proximityShareContentFingerprint(a),
    proximityShareContentFingerprint(b)
  );
});

test("null / undefined → empreinte stable distincte d’une recette vide", () => {
  assert.equal(
    proximityShareContentFingerprint(null),
    proximityShareContentFingerprint(undefined)
  );
  assert.notEqual(
    proximityShareContentFingerprint(null),
    proximityShareContentFingerprint({
      title: "",
      ingredients: [],
      steps: []
    })
  );
});

test("watch — première eval (prev undefined) ne ferme pas", () => {
  assert.equal(
    shouldCloseProximityShareForStaleContent({
      overlayVisible: true,
      previousFingerprint: undefined,
      nextFingerprint: "fp-1"
    }),
    false
  );
});

test("watch — overlay ouvert + fingerprint inchangé → pas de fermeture", () => {
  assert.equal(
    shouldCloseProximityShareForStaleContent({
      overlayVisible: true,
      previousFingerprint: "fp-1",
      nextFingerprint: "fp-1"
    }),
    false
  );
});

test("watch — overlay ouvert + fingerprint divergent → fermeture", () => {
  assert.equal(
    shouldCloseProximityShareForStaleContent({
      overlayVisible: true,
      previousFingerprint: "fp-1",
      nextFingerprint: "fp-2"
    }),
    true
  );
});

test("watch — overlay fermé + fingerprint divergent → pas de fermeture", () => {
  assert.equal(
    shouldCloseProximityShareForStaleContent({
      overlayVisible: false,
      previousFingerprint: "fp-1",
      nextFingerprint: "fp-2"
    }),
    false
  );
});
