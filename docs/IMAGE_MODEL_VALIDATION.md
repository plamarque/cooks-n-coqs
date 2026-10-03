# Validation locale des modèles d'images

Ce document est le rapport versionné de décision humaine pour les modèles
d'images. Il ne contient pas de résultat prérempli : les preuves brutes restent
dans le dossier local de benchmark, ignoré par Git. Une recommandation ne peut
être conclue qu'après une exécution identifiée et une revue humaine complète.

## Règles de décision

- Comparer par usage, jamais sur le seul prix ou tarif.
- Distinguer les **mesures API relevées** des **appréciations humaines**.
- Distinguer tokens API, estimation standard et facture réelle : l'estimation suit la table datée et la formule du manifeste, est explicitement non facturée. Sans tokens requis, noter `indisponible`, jamais zéro.
- Conserver les échecs (`status: failed`) et leur erreur ; ils ne deviennent ni
  un succès implicite ni une donnée de coût.
- Cette validation ne modifie ni `.env`, ni `ai-config.ts`, ni les modèles par
  défaut, ni Render, cache BFF, R2 ou les images existantes. Les images,
  `manifest.json` et `review.html` restent locaux, hors cache et hors services
  distants.

## Identité obligatoire de l'exécution

À renseigner par l'opérateur après l'exécution locale, avant toute revue.

| Champ | Valeur relevée |
| --- | --- |
| Statut du rapport | `awaiting-operator` |
| Dossier local des artefacts | À compléter |
| Chemin de `manifest.json` | À compléter |
| Chemin de `review.html` | À compléter |
| Date et heure de début / fin (`startedAt` / `finishedAt`) | À compléter |
| Hash SHA-256 du corpus (`corpusSha256`) | À compléter |
| Modèle courant déclaré (`--current-model`) | À compléter |
| Modèles comparés (`--models`) | À compléter |
| Commande exacte exécutée | À compléter |
| Opérateur | À compléter |
| Réviseur humain et date | À compléter |

Le manifeste doit correspondre au corpus versionné de neuf cas : trois
`recipe`, trois `ingredient` et trois `cooking_step`. Joindre les chemins
locaux, pas les contenus ni une copie des artefacts au dépôt.

## Consolidation des mesures API relevées

Recopier ces données depuis `manifest.json`, sans les compléter par
interprétation. Créer une ligne par couple cas-modèle, y compris un échec.

Avant toute validation, vérifier que le manifeste contient exactement
**21 tentatives** : 18 couples production (neuf cas × Mini/Flare) et trois ingrédients Flare `ingredient-816`. Documenter toute absence de couple
attendu dans la colonne erreur et rechercher sa cause. Une tentative `failed`
est bien une tentative à conserver, avec son erreur ; en revanche, si un
couple cas-modèle manque du manifeste, aucune décision par usage ne peut être
validée tant que cette absence n'est pas documentée et résolue par une
exécution identifiée.

| Cas | Usage | Modèle / profil | Statut | Qualité demandée | Dimensions demandées / reçues | Latence (ms) | Tokens API normalisés | Disponibilité usage API | Coût standard estimé non facturé | Erreur |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |
| À compléter | À compléter | À compléter | À compléter | À compléter | À compléter | À compléter | À compléter | `available` / `unavailable` | À compléter ou `indisponible` | À compléter |

Si `apiUsageAvailability` est `unavailable`, inscrire `indisponible` dans les
colonnes usage et coût, sans calcul ni approximation. Si une tentative échoue,
conserver `failed`, `latencyMs` et `error`; les autres tentatives peuvent tout
de même être évaluées.

## Grille d'appréciation humaine par cas

Ouvrir le `review.html` local et renseigner **une ligne par tentative**. Répéter les neuf lignes ci-dessous pour Mini et Flare, puis les trois ingrédients Flare `ingredient-816`,
(et ajouter les répétitions nécessaires) : un même cas doit donc apparaître
une fois pour chacun de ces modèles. Ces colonnes expriment un jugement visuel
et ne sont pas des mesures API ; elles ne doivent pas être recopiées dans le
manifeste.

| Cas corpus | Usage et gabarit réel | Modèle | Qualité visuelle et adéquation culinaire | Lisibilité au gabarit | Artefacts / défauts visibles | Verdict humain et notes |
| --- | --- | --- | --- | --- | --- | --- |
| `tarte-tomates` | `recipe` — carte recette 320 × 320 | À compléter | À compléter | À compléter | À compléter | À compléter |
| `curry-pois-chiches` | `recipe` — carte recette 320 × 320 | À compléter | À compléter | À compléter | À compléter | À compléter |
| `crumble-pommes` | `recipe` — carte recette 320 × 320 | À compléter | À compléter | À compléter | À compléter | À compléter |
| `pois-chiche` | `ingredient` — icône ingrédient 64 × 64 | À compléter | À compléter | À compléter | À compléter | À compléter |
| `basilic` | `ingredient` — icône ingrédient 64 × 64 | À compléter | À compléter | À compléter | À compléter | À compléter |
| `citron` | `ingredient` — icône ingrédient 64 × 64 | À compléter | À compléter | À compléter | À compléter | À compléter |
| `saisir-saumon` | `cooking_step` — média d'étape 480 × 270 | À compléter | À compléter | À compléter | À compléter | À compléter |
| `fouetter-creme` | `cooking_step` — média d'étape 480 × 270 | À compléter | À compléter | À compléter | À compléter | À compléter |
| `raper-legumes` | `cooking_step` — média d'étape 480 × 270 | À compléter | À compléter | À compléter | À compléter | À compléter |

## Décision par usage

Ne renseigner « retenu » ou « rejeté » qu'après avoir rempli la consolidation
API et toutes les lignes humaines concernées. Une décision doit citer les cas
observés, la qualité, lisibilité, artefacts, latence, erreurs et le coût/usage
API disponible. Le coût seul ne justifie jamais une décision.

| Usage | Cas observés | Modèle retenu / rejeté | Preuves synthétiques (qualité, lisibilité, artefacts) | Mesures API (latence, erreurs, usage / coût disponible) | Configuration cible proposée | Repli proposé | Décision et validation humaine |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `recipe` | `tarte-tomates`, `curry-pois-chiches`, `crumble-pommes` | À compléter | À compléter | À compléter | `AI_IMAGE_MODEL_RECIPE` + `AI_IMAGE_QUALITY_RECIPE` : à compléter | modèle + qualité : à compléter | `awaiting-operator` |
| `ingredient` | `pois-chiche`, `basilic`, `citron` | À compléter | À compléter | À compléter | `AI_IMAGE_MODEL_INGREDIENT` + `AI_IMAGE_QUALITY_INGREDIENT` : à compléter | modèle + qualité : à compléter | `awaiting-operator` |
| `cooking_step` | `saisir-saumon`, `fouetter-creme`, `raper-legumes` | À compléter | À compléter | À compléter | `AI_IMAGE_MODEL_COOKING_STEP` + `AI_IMAGE_QUALITY_COOKING_STEP` : à compléter | modèle + qualité : à compléter | `awaiting-operator` |

Les noms de variables ci-dessus sont des propositions de configuration à
valider, pas des instructions de changement. Les valeurs actuelles et les
variables Render restent inchangées tant qu'un opérateur n'a pas validé ce
rapport et décidé une bascule distincte.

## Validation humaine finale

- [ ] Le manifeste identifié est complet et son hash de corpus est consigné.
- [ ] Le manifeste contient exactement `21`
      tentatives ; tout couple absent est documenté et bloque la décision.
- [ ] Chaque couple cas-modèle a ses mesures API ou son indisponibilité/erreur.
- [ ] Les neuf cas ont une appréciation humaine au gabarit de revue réel.
- [ ] Chaque usage a une décision appuyée par les cas, le jugement humain, la
      latence, les erreurs et le coût/usage disponible.
- [ ] Chaque proposition cible a un repli explicite.
- [ ] Aucune conclusion ne dépend du seul coût/tarif.
- [ ] Aucune configuration de production n'a été modifiée dans cette étape.

**Décision finale :** `awaiting-operator`  
**Nom, date et accord de l'opérateur :** À compléter

## Passage opérateur après validation

1. Exécuter le benchmark local Mini ↔ Flare avec une clé API fournie par l'opérateur ; ne pas modifier les modèles, tailles ou variables de production.
2. Consigner l'identité du manifeste et revoir `review.html` localement.
3. Compléter les mesures puis la grille humaine et valider les décisions par
   usage dans ce document.
4. Si une bascule est approuvée séparément, appliquer la configuration cible et
   le repli dans Render au cours d'une opération humaine distincte, puis
   vérifier le déploiement. Ne jamais importer les artefacts de benchmark dans
   Render, R2 ou le cache BFF.
