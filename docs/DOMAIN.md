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
- `imageId` (optionnel)
- `source: ImportSource` (optionnel)
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
