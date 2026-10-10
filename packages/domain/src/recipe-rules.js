function roundQuantity(quantity, unit) {
  const normalizedUnit = unit?.toLowerCase() ?? "";
  const isIntegerUnit =
    normalizedUnit.includes("oeuf") ||
    normalizedUnit.includes("œuf") ||
    normalizedUnit.includes("pièce") ||
    normalizedUnit.includes("piece") ||
    normalizedUnit.includes("unité") ||
    normalizedUnit.includes("unite");

  if (isIntegerUnit) {
    return Math.max(1, Math.round(quantity));
  }

  if (quantity >= 100) {
    return Math.round(quantity);
  }

  return Math.round(quantity * 10) / 10;
}

export function normalizeIngredient(ingredient) {
  if (!ingredient.isScalable) {
    return ingredient;
  }

  if (ingredient.quantityBase !== undefined) {
    return ingredient;
  }

  if (ingredient.quantity === undefined) {
    return ingredient;
  }

  return {
    ...ingredient,
    quantityBase: ingredient.quantity
  };
}

export function normalizeRecipeForSave(recipe) {
  const categories = Array.from(new Map((recipe.personalCategories ?? []).map((value) => { const label = value.trim().replace(/\s+/g, " "); return [label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr"), label]; }).filter(([, label]) => label)).values());
  return {
    ...recipe,
    ingredients: recipe.ingredients.map(normalizeIngredient),
    ...(categories.length ? { personalCategories: categories } : {})
  };
}

export function isRecipeValidForSave(recipe) {
  const title = recipe.title.trim();
  if (!title) {
    return false;
  }

  return recipe.ingredients.length > 0 || recipe.steps.length > 0;
}

export function assertRecipeValidForSave(recipe) {
  if (!recipe.title.trim()) {
    throw new Error("title is required");
  }

  if (recipe.ingredients.length === 0 && recipe.steps.length === 0) {
    throw new Error("recipe needs at least one ingredient or one step");
  }
}

export function scaleIngredientsFromBase(ingredients, servingsTarget, servingsBase) {
  if (servingsTarget <= 0 || servingsBase <= 0) {
    throw new Error("servings must be > 0");
  }

  const coefficient = servingsTarget / servingsBase;

  return ingredients.map((ingredient) => {
    if (!ingredient.isScalable) {
      return ingredient;
    }

    const quantityBase = ingredient.quantityBase ?? ingredient.quantity;
    if (quantityBase === undefined) {
      return ingredient;
    }

    return {
      ...ingredient,
      quantityBase,
      quantity: roundQuantity(quantityBase * coefficient, ingredient.unit)
    };
  });
}
/** Décode le wire fermé de création Assistant avant toute prévisualisation. */
export function decodeAssistantDraftWireV1(value) {
  if (!value || typeof value !== "object") return null;
  const draft = value;
  const allowed = new Set(["title", "category", "ingredients", "steps", "prepTimeMin", "cookTimeMin", "restTimeMin"]);
  if (Object.keys(draft).some((key) => !allowed.has(key))) return null;
  if (typeof draft.title !== "string" || !draft.title.trim() || draft.title.length > 180 || (draft.category !== "SUCRE" && draft.category !== "SALE")) return null;
  const minute = (item) => item === undefined || Number.isInteger(item) && item >= 0 && item <= 1440;
  if (!minute(draft.prepTimeMin) || !minute(draft.cookTimeMin) || !minute(draft.restTimeMin) || !Array.isArray(draft.ingredients) || !Array.isArray(draft.steps) || !draft.ingredients.length || !draft.steps.length || draft.ingredients.length > 80 || draft.steps.length > 80) return null;
  const ingredients = draft.ingredients.every((item, index) => !!item && typeof item === "object" && Object.keys(item).every((key) => key === "id" || key === "label" || key === "isScalable") && typeof item.id === "string" && item.id === `ingredient-${index + 1}` && typeof item.label === "string" && !!item.label.trim() && item.label.length <= 180 && typeof item.isScalable === "boolean");
  const steps = draft.steps.every((item, index) => !!item && typeof item === "object" && Object.keys(item).every((key) => key === "id" || key === "order" || key === "text") && typeof item.id === "string" && item.id === `step-${index + 1}` && item.order === index + 1 && typeof item.text === "string" && !!item.text.trim() && item.text.length <= 2000);
  if (!ingredients || !steps) return null;
  return { title: draft.title.trim(), category: draft.category, ingredients: draft.ingredients, steps: draft.steps, ...(draft.prepTimeMin === undefined ? {} : { prepTimeMin: draft.prepTimeMin }), ...(draft.cookTimeMin === undefined ? {} : { cookTimeMin: draft.cookTimeMin }), ...(draft.restTimeMin === undefined ? {} : { restTimeMin: draft.restTimeMin }) };
}
