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
17. **Compositeur Assistant local** : ce n’est ni une `Recipe`, ni une entité de persistance. Son texte non envoyé, ses images locales et sa transcription audio acceptée sont un état éphémère modifiable ; chaque élément est retirable. Aucun audio brut n'est stocké ou transmis. Une `AssistantPreview` reste distincte d’une `Recipe` jusqu’à une sauvegarde explicite.
18. **Fils Chef locaux** : un fil Chef est une donnée locale distincte des recettes et du Compositeur. Il peut conserver messages, cartes recette et pièces jointes utiles ; il est daté, contextualisable et supprimable. Un fil de séance cuisine est distinct d'un fil d'accueil. Le BFF n'en persiste aucune partie ; une simple ouverture de surface n'en crée aucun.
19. **Profil Chef local** : préférences explicites, inférences assorties d'une confiance, paramètres de foyer, goûts et retours vivent localement. Ils sont structurés, corrigeables et supprimables. Une contrainte ponctuelle reste dans la séance ; un garde-manger probable est une hypothèse à vérifier, jamais un stock certain. Une préférence explicite tournée vers l'avenir peut être retenue silencieusement ; une déduction commence à faible confiance.
20. **Outils et mutations Chef** : le client valide toute demande d'outil, transmet seulement le contexte nécessaire et exécute localement les écritures autorisées. Une action de séance réversible peut être appliquée immédiatement avec un retour clair ; toute mutation durable de recette, plan ou quantité est prévisualisée puis confirmée. Aucune donnée personnelle Chef n'est persistée côté BFF.
21. **AssistantPreview** : session strictement éphémère contenant un `ParsedRecipeDraft`, sa provenance et les `File` source en mémoire. Elle ne possède ni identifiant de recette ni représentation sérialisable ; sa fermeture ou son annulation l'abandonne sans écriture.
22. **Sélection Cahier 2.1** : la demande libre (2 600 caractères maximum) est confrontée à un instantané minimisé de 60 recettes au plus (titre, libellés d’ingrédients, durée, référence éphémère). Les wires fermés retournent une à trois références ou `noCandidate` / `selectionUnavailable`; chaque référence est revalidée contre le Cahier courant et contre les contraintes littérales vérifiables (sans/avec ingrédient, durée connue). Une candidate sous 0,5 est `noCandidate`; la sélection elle-même ne crée, ne modifie ni n’illustre une recette. Les traces BFF excluent tout contenu utilisateur.
23. **Continuité Assistant** : clarification, import et création sur mesure sont hors du contrat 2.1. Une création sur mesure ne peut être déclenchée que par un `noCandidate` validé localement après sélection ; elle reste une `AssistantPreview` sans écriture jusqu’à Sauvegarder. Elle ne peut pas être déclenchée par une annulation, une référence périmée, un 4xx ou `selectionUnavailable`.
24. **Résumé visuel Assistant** : texte temporaire borné dérivé du binaire image par le BFF pour guider Jev puis la génération finale. Avant l’envoi, le navigateur prépare séquentiellement jusqu’à cinq images dans leur ordre d’origine : un JPEG, PNG ou WebP valide sous 4 Mio reste intact ; les autres formats décodables sont convertis, et les images trop lourdes sont réduites sous 4 Mio ou le lot échoue localement sans envoi. Une conversion impossible et un résultat encore trop lourd ont des erreurs distinctes. Les originaux restent en mémoire au Compositeur pour retrait ou nouvel essai ; annuler invalide toute préparation tardive. Ce résumé n’est ni un tour, ni une entité, ni un diagnostic ; image et résumé ne sont pas persistés.
25. **Reprise vision Assistant** : les images d’un lot sont analysées séquentiellement, chacune dans sa propre requête temporaire ; chacune a au plus un second essai individuel après timeout, erreur réseau, 429 ou 5xx, séparé par une attente courte annulable. Un 4xx hors 429 est définitif et ne déclenche pas de seconde requête. Un résumé textuel trop long est borné sans invalider l’analyse. Un échec définitif annule le lot sans recette ni écriture ; les pièces jointes locales restent modifiables. Une référence de diagnostic, sans contenu utilisateur, corrèle le client et le BFF.
26. **Sauvegarde Assistant atomique** : l’URL générée pour une preview n’est pas un attribut de `Recipe`. La conversion explicite d’un `AssistantPreview` valide prépare l’illustration en mémoire puis écrit les `File` source, l’illustration disponible et la `Recipe` dans une seule transaction ; aucun de ces éléments ne survit à une erreur transactionnelle. Une indisponibilité de l’illustration ne bloque pas une recette valide. Une candidate Cahier est toujours ouverte en lecture seule : son ouverture ne peut ni écrire une image ni modifier la recette.
