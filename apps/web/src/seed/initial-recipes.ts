import type { Recipe } from "@cookies-et-coquilettes/domain";

function seedId(prefix: string, suffix: string): string {
  return `seed-${prefix}-${suffix}`;
}

export function getInitialRecipes(): Recipe[] {
  const now = new Date().toISOString();

  const coquillettes: Recipe = {
    id: seedId("coquillettes", "001"),
    title: "Coquillettes au jambon de Juan Arbelaez",
    category: "SALE",
    favorite: true,
    servingsBase: 4,
    servingsCurrent: 4,
    prepTimeMin: 25,
    cookTimeMin: 10,
    ingredients: [
      { id: seedId("coq", "ing-1"), label: "Eau", quantity: 2, unit: "L", isScalable: true },
      { id: seedId("coq", "ing-2"), label: "Gros sel", quantity: 3, unit: "c. à s.", isScalable: true },
      { id: seedId("coq", "ing-3"), label: "Coquillettes", quantity: 400, unit: "g", isScalable: true },
      { id: seedId("coq", "ing-4"), label: "Jambon taillé en dés", quantity: 1, unit: "tranche", isScalable: true },
      { id: seedId("coq", "ing-5"), label: "Crème", quantity: 250, unit: "ml", isScalable: true },
      { id: seedId("coq", "ing-6"), label: "Parmesan râpé (ou Grana Padano)", quantity: 50, unit: "g", isScalable: true },
      { id: seedId("coq", "ing-7"), label: "Sauce soja", quantity: 1, unit: "c. à s.", isScalable: true },
      { id: seedId("coq", "ing-8"), label: "Sel", quantity: 1, unit: "pincée", isScalable: false },
      { id: seedId("coq", "ing-9"), label: "Poivre à moulin", quantity: 1, unit: "tour", isScalable: false },
      { id: seedId("coq", "ing-10"), label: "Copeaux de parmesan", isScalable: false }
    ],
    steps: [
      { id: seedId("coq", "step-1"), order: 1, text: "Dans une casserole, faites chauffer à feu doux votre crème puis ajoutez le parmesan râpé et la sauce soja, le jambon, assaisonnez de sel si nécessaire." },
      { id: seedId("coq", "step-2"), order: 2, text: "Faites cuire les coquillettes dans l'eau bouillante salée pendant 4 minutes puis égouttez-les. Ajoutez-les dans la crème au parmesan puis finissez la cuisson pendant 4 minutes supplémentaires à feu doux en mélangeant gentiment." },
      { id: seedId("coq", "step-3"), order: 3, text: "Poivrez bien le tout puis ajoutez quelques copeaux de parmesan par-dessus." }
    ],
    source: {
      type: "URL",
      url: "https://cuisine.journaldesfemmes.fr/recette/3090629-coquillettes-au-jambon-de-juan-arbelaez",
      capturedAt: now
    },
    createdAt: now,
    updatedAt: now
  };

  const cookies: Recipe = {
    id: seedId("cookies", "001"),
    title: "Cookies aux pépites de chocolat",
    category: "SUCRE",
    favorite: true,
    servingsBase: 6,
    servingsCurrent: 6,
    prepTimeMin: 15,
    cookTimeMin: 14,
    ingredients: [
      { id: seedId("cook", "ing-1"), label: "Œuf", quantity: 1, unit: "unité", isScalable: true },
      { id: seedId("cook", "ing-2"), label: "Farine", quantity: 250, unit: "g", isScalable: true },
      { id: seedId("cook", "ing-3"), label: "Beurre", quantity: 125, unit: "g", isScalable: true },
      { id: seedId("cook", "ing-4"), label: "Sucre roux ou vergeoise", quantity: 125, unit: "g", isScalable: true },
      { id: seedId("cook", "ing-5"), label: "Sucre fin blanc", quantity: 50, unit: "g", isScalable: true },
      { id: seedId("cook", "ing-6"), label: "Gousse de vanille (ou 1 cc de poudre)", quantity: 1, unit: "unité", isScalable: true },
      { id: seedId("cook", "ing-7"), label: "Levure", quantity: 1, unit: "c. à c.", isScalable: true },
      { id: seedId("cook", "ing-8"), label: "Bicarbonate", quantity: 1, unit: "c. à c.", isScalable: true },
      { id: seedId("cook", "ing-9"), label: "Sel", quantity: 1, unit: "pincée", isScalable: false },
      { id: seedId("cook", "ing-10"), label: "Chocolat coupé en gros morceaux", quantity: 140, unit: "g", isScalable: true }
    ],
    steps: [
      { id: seedId("cook", "step-1"), order: 1, text: "Préchauffez votre four chaleur tournante haut bas à 190°." },
      { id: seedId("cook", "step-2"), order: 2, text: "Mélangez les deux sucres, puis ajoutez-y le beurre mou mais pas fondu." },
      { id: seedId("cook", "step-3"), order: 3, text: "Cassez un œuf, puis ajoutez votre vanille (facultative mais meilleur), mélangez bien." },
      { id: seedId("cook", "step-4"), order: 4, text: "Ajoutez la farine tamisée, la levure et la pincée de sel." },
      { id: seedId("cook", "step-5"), order: 5, text: "Mélangez bien le tout de façon homogène, ajoutez votre chocolat et formez une grosse boule." },
      { id: seedId("cook", "step-6"), order: 6, text: "Formez 6 boules bien hautes et pas du tout aplaties (c'est important pour un résultat tout chewy)." },
      { id: seedId("cook", "step-7"), order: 7, text: "Enfournez 14 minutes à 190°." },
      { id: seedId("cook", "step-8"), order: 8, text: "À la sortie du four, ils semblent crus et sont impossibles à manipuler facilement, c'est normal !" },
      { id: seedId("cook", "step-9"), order: 9, text: "Laissez-les refroidir une quinzaine de minutes et régalez-vous !" }
    ],
    source: {
      type: "MANUAL",
      capturedAt: now
    },
    createdAt: now,
    updatedAt: now
  };

  return [coquillettes, cookies];
}
