# Images des ingrédients — Slides de développement

## Slide 1 — Contexte

- Améliorer l'UX des recettes avec des visuels d'ingrédients.
- Style : photoréaliste, atelier de cuisine, lisible en petit.

## Slide 2 — Où afficher

- **Liste ingrédients** (écran détail) : grille de cartes avec image par ingrédient.
- **Zone Préparation** (écran détail) : icônes des ingrédients mentionnés en bout de chaque ligne d'étape.
- **Cartes accueil** : icônes des ingrédients à côté du compteur « X ingrédient(s) ».

## Slide 3 — Source des images

- Cache local en priorité.
- Génération IA à la demande (lazy) si absent.
- Mutualisation par ingrédient normalisé (ex. « farine » → une image pour toutes les recettes).

## Slide 4 — Contraintes techniques

- Stockage local (IndexedDB).
- BFF ou API externe pour génération IA.
- Format petit (ex. 64×64 ou 96×96 px) pour lisibilité.

## Slide 5 — Impacts

- **DOMAIN** : `IngredientLine.imageId` ou entité `IngredientImage`.
- **ARCH** : `ingredient-image-service`, composant `IngredientImage`, endpoint BFF.
- **SPEC** : nouvelle capacité « Images des ingrédients ».
