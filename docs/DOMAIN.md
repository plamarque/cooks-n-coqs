# Modèle de domaine v1

## Objectif

Définir le vocabulaire métier et les règles de gestion pour la centralisation, la consultation et l’adaptation de recettes.

## Valeurs et énumérations

- `RecipeCategory = SUCRE | SALE`
- `ImportType = MANUAL | SHARE | URL | SCREENSHOT | TEXT`

## Entités

### Recipe

Recette utilisateur persistée localement.

Attributs principaux :
- `id`
- `title`
- `category`
- `favorite`
- `servingsBase` (optionnel)
- `servingsCurrent` (optionnel)
- `ingredients: IngredientLine[]`
- `steps: InstructionStep[]`
- `prepTimeMin` (optionnel)
- `cookTimeMin` (optionnel)
- `restTimeMin` (optionnel)
- `imageId` (optionnel)
- `source: ImportSource` (optionnel)
- `pendingBookMediaHydration` (optionnel, booléen) — import cahier sans images embarquées : indique que la complétion des visuels (cache BFF / IA) peut être tentée à l’ouverture détail ; retiré après une première tentative (best-effort). Non sérialisé dans le fichier d’export cahier.
- `importSourceStableKey` (optionnel, chaîne opaque) — empreinte stable dérivée de `source.url` lorsqu’elle existe (ex. SHA-256 hex après normalisation d’URL), pour le **dédoublonnage** à l’import cahier ; inclus dans le JSON d’export lorsque calculable.
- `createdAt`
- `updatedAt`

### IngredientLine

Ligne d’ingrédient affichée et exploitable pour le recalcul des portions.

Attributs principaux :
- `id`
- `order` (optionnel, ordre d'affichage ; à défaut, l'ordre du tableau fait foi)
- `label` (nom lisible)
- `quantity` (optionnelle, valeur affichée courante)
- `quantityBase` (optionnelle, référence immuable pour scaling)
- `unit` (optionnelle)
- `isScalable` (booléen)
- `rawText` (optionnel, garde la forme source)
- `imageId` (optionnel, référence vers une IngredientImage ; résolu via label normalisé si absent)

### InstructionStep

Étape ordonnée de préparation.

Attributs :
- `id`
- `order`
- `text`
- `media` (optionnel) : liste ordonnée de médias d’étape — image (`RecipeImage` via `imageId` dans IndexedDB) ou vidéo (URL absolue `http(s)` uniquement, non téléchargée).
- `ingredientIds` (optionnel) : ids des `IngredientLine` de la recette mentionnés dans l’étape, calculés **une fois à l’import** côté BFF (heuristique tokens puis filet LLM `extract` si besoin). Absent ou vide → l’UI mode cuisine / préparation retombe sur le matching tokens live. Pas de backfill Dexie des recettes anciennes (v1).

Types de médias : `StepMedium` = entrée `{ type: 'image', imageId }` ou `{ type: 'video', url }`.

### ParsedInstructionStep (brouillon d’import)

Même structure qu’une étape pour le flux BFF → client avant persistance : les images sont des URL distantes (`imageUrl`) dans le brouillon, converties en `imageId` local après téléchargement. Peut porter `ingredientIds` enrichis par le BFF.

### RecipeImage

Image de recette associée à une vignette et/ou à un détail.

Attributs :
- `id`
- `mimeType`
- `width`
- `height`
- `sizeBytes`
- `createdAt`

### IngredientImage

Image d'ingrédient partagée entre recettes, identifiée par une clé normalisée dérivée du label (ex. « farine » → une image pour toutes les occurrences).

Attributs :
- `id` (clé normalisée du label : lowercase, sans accents, etc.)
- `mimeType`
- `width`
- `height`
- `sizeBytes`
- `createdAt`

### ImportSource

Trace de provenance d’une recette importée.

Attributs :
- `type: ImportType`
- `url` (optionnel)
- `capturedAt`

## Relations

1. Une `Recipe` contient `N` `IngredientLine`.
2. Une `Recipe` contient `N` `InstructionStep`.
3. Une `Recipe` peut référencer `0..1` `RecipeImage`.
4. Une `Recipe` peut référencer `0..1` `ImportSource`.
5. Une `IngredientLine` peut référencer `0..1` `IngredientImage` (via `imageId` ou résolution par label normalisé).
6. Une `InstructionStep` peut référencer `0..N` images recette (`RecipeImage` / `db.images`) et `0..N` liens vidéo via `media`.
7. Une `InstructionStep` peut référencer `0..N` `IngredientLine` via `ingredientIds` (mentions enrichies à l’import).

## Règles du domaine

1. Une recette doit contenir un `title`.
2. Une recette doit contenir au moins un ingrédient ou au moins une étape.
3. Les étapes sont ordonnées strictement par `order`.
4. Les ingrédients non quantifiables sont conservés en texte libre (`rawText`/`label`) et peuvent être marqués `isScalable = false`.
5. Le recalcul des portions utilise un coefficient linéaire :
   - `coefficient = servingsTarget / servingsBase`.
   - la quantité recalculée doit toujours dériver de `quantityBase` si présent.
6. Les arrondis doivent rester culinaires et lisibles :
   - unités “œuf/oeuf/pièce/unité” arrondies à l’entier,
   - grammes/ml arrondis raisonnablement,
   - unités non numériques inchangées.
7. L’utilisateur peut revenir aux quantités de base via reset des portions.
8. “Sans changer les grammages” signifie : pas de transformation implicite de la recette importée sans action explicite.
9. Suppression d’une recette : définitive après confirmation utilisateur.
10. Import fallback : en cas d’échec parsing/BFF, un draft minimal éditable est créé avec `source`.
11. Image d'ingrédient : optionnelle ; l'identifiant peut être dérivé du label normalisé pour mutualiser entre recettes.
12. Les images d'ingrédients sont stockées localement (IndexedDB), comme les images de recette.
13. En sortie de mode cuisine, la mise à jour proposée de `prepTimeMin` se base sur une moyenne : `(prepTimeMin actuel + durée mesurée arrondie en minutes) / 2`.
14. **Import cahier** : si `importSourceStableKey` est défini sur une recette déjà en stock et qu’une recette du fichier partage la même clé, la recette du fichier n’est pas importée (comportement « ignorer »). À l’intérieur d’un même fichier, la **première** occurrence d’une clé l’emporte.
15. **Mentions étape↔ingrédient** : propriétaire unique = BFF à l’import (`ingredientIds` optionnels sur les steps du draft). Le web persiste via import → `RecipeService` ; s’il remint des ids ingredient/step, il remappe `ingredientIds` dans la même transaction. Édition manuelle du texte d’étape ou de l’ensemble d’ingrédients sans réimport → omettre / clear les `ingredientIds` des steps touchées (fallback tokens). Pas d’appel LLM live en navigation cuisine.
16. **Échange texte F2 (partage natif)** : format d’échange sortant / entrant en texte clair (pas d’entité persistée dédiée). **Émission** : titre nu en première ligne ; ligne optionnelle `N portions` où N = portions **affichées** sur le détail après scaling appliqué (`servingsCurrent` valide sinon `servingsBase`) ; quantités = celles visibles (pas le `rawText` de base s’il diverge) ; en-têtes `Ingrédients:` / `Étapes:` / `Source:` ; CTA install hors schéma d’en-têtes. Partager ne mute pas `servingsBase` / `quantityBase`. **Import** : même contrat **et** ancien wire `Titre:` / `Portions:` ; N + quantités du texte reçu deviennent la **base** de la fiche ; F2 reconnu → parse local sans BFF de structuration ; `Source:` http(s) → `source.url` sans re-fetch ; CTA (une ligne ou wrap question + URL Pages live/legacy) ignoré, jamais URL de recette ; image post-création async best-effort.
