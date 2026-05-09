import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { RECIPE_BOOK_FORMAT, RecipeBookImportError } from "../services/recipe-book-transfer-core";

/** Nom de l’entrée JSON à l’intérieur du ZIP exporté (convention produit). */
export const RECIPE_BOOK_ZIP_ENTRY = "recipe-book.json";

function zipBasename(path: string): string {
  const norm = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = norm.split("/");
  return parts[parts.length - 1] ?? norm;
}

function looksLikeRecipeBookJson(text: string): boolean {
  return text.includes(RECIPE_BOOK_FORMAT) && text.includes('"recipes"');
}

/** Compresse le JSON du cahier en archive ZIP (une seule entrée). */
export function zipRecipeBookJson(jsonUtf8: string): Uint8Array {
  return zipSync({ [RECIPE_BOOK_ZIP_ENTRY]: strToU8(jsonUtf8) }, { level: 6 });
}

/**
 * Extrait le JSON du cahier depuis les octets d’un ZIP.
 * Cherche d’abord `recipe-book.json` (éventuellement dans un sous-dossier),
 * sinon la première entrée `.json` qui ressemble à une archive Cookies & Coquillettes.
 */
export function unzipRecipeBookJson(zipBytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(zipBytes);
  } catch {
    throw new RecipeBookImportError("Le fichier ZIP est illisible ou corrompu.");
  }
  const names = Object.keys(files);
  if (names.length === 0) {
    throw new RecipeBookImportError("L’archive ZIP est vide.");
  }

  for (const name of names) {
    if (zipBasename(name) === RECIPE_BOOK_ZIP_ENTRY) {
      return strFromU8(files[name]!);
    }
  }

  for (const name of names) {
    if (!zipBasename(name).toLowerCase().endsWith(".json")) continue;
    const text = strFromU8(files[name]!);
    if (looksLikeRecipeBookJson(text)) {
      return text;
    }
  }

  throw new RecipeBookImportError(
    `Archive ZIP : aucun fichier « ${RECIPE_BOOK_ZIP_ENTRY} » ni JSON de cahier reconnu.`
  );
}
