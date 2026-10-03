---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
updated: '2026-10-03'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-cooks-n-coqs-2026-10-01/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-cooks-n-coqs-2026-10-01/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-cooks-n-coqs-2026-10-01/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-cooks-n-coqs-2026-10-01/EXPERIENCE.md
---

# cooks-n-coqs - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for cooks-n-coqs, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR-1: Fournir un Compositeur unique permettant la saisie et l'édition de texte, le collage d'URL ou de recette, l'ajout/retrait d'image et la dictée facultative transcrite au curseur et modifiable avant envoi ; un envoi vide explique les formats acceptés et seul un traitement en cours désactive l'envoi.

FR-2: Router chaque envoi de façon prioritaire et explicable : image vers import image, URL HTTP(S) vers import URL, recette structurée/F2/partage vers import approprié, sinon recherche Cahier puis proposition sur mesure ; toute ambiguïté recette/demande propose « Importer cette recette » ou « Chercher une idée » sans décision silencieuse.

FR-3: Rechercher d'abord une recette approximativement pertinente dans le Cahier à partir du titre, ingrédients et durée ; sur une demande explicite de 1 200 caractères maximum, envoyer un snapshot minimisé de 60 recettes au plus, puis présenter jusqu'à trois recettes qualifiées ou une prévisualisation sur mesure seulement si aucune candidate utile ne subsiste. Jev `jev-1.13.0` est primaire ; Luna `gpt-5.6-luna` avec effort `none` est l'unique fallback technique ; le seuil est p >= 0,5 et les contraintes littérales sont vérifiées localement.

FR-4: Afficher durant l'import, la recherche ou la création un statut court, localisé et compréhensible, sans chaîne de pensée, prompt ni score, et permettre l'annulation en préservant texte et image ; les erreurs d'import conservent les fallbacks v1 et un brouillon éditable lorsque disponible.

FR-5: Présenter tout résultat comme une carte activable au clavier et au toucher ; ouvrir une recette Cahier existante en détail ou un import/une création en prévisualisation détaillée ; ne persister cette dernière qu'après Sauvegarder explicite selon les validations v1, et abandonner sans écriture une prévisualisation fermée.

FR-6: Garantir des actions nommées et utilisables au clavier, une alternative texte complète à la voix, des états compréhensibles sans animation et respectueux du mouvement réduit, un accueil mobile sans défilement horizontal et des actions principales atteignables.

FR-7: Préserver, par des actions explicites adaptées, les parcours v1 de création manuelle, import `.zip`, édition de recette et partage système, sans les faire absorber par le routage Assistant.

FR-M1: Constituer un corpus représentatif de recettes, ingrédients et étapes, avec prompts et réglages identiques, afin de comparer le modèle actuel et les candidats.

FR-M2: Exécuter l'évaluation de manière reproductible et conserver, pour chaque rendu, modèle, usage, qualité, dimensions, durée, coût API et résultat de contrôle visuel.

FR-M3: Définir des critères de décision explicites par usage : fidélité au prompt, lisibilité à la taille affichée, absence d'artefacts, taux de régénération, latence et coût.

FR-M4: Migrer avant le 1er décembre 2026 la configuration qui utilise `gpt-image-1-mini`, sans modifier rétrospectivement les images déjà mises en cache.

FR-M5: Pouvoir activer le modèle retenu par usage (`recipe`, `ingredient`, `cooking_step`) et revenir à la configuration précédente pendant la validation.

### NonFunctional Requirements

NFR-1: Ne stocker ni n'envoyer d'audio brut, conserver les recettes local-first et préserver la provenance des imports selon `ImportSource`.

NFR-2: Dégrader progressivement : sans BFF ou analyse distante, conserver les drafts d'import minimaux éditables ; sans microphone/reconnaissance vocale, informer sans bloquer le Compositeur texte ; ne pas dépendre d'une animation pour l'accueil ou les actions locales essentielles.

NFR-3: Limiter les diagnostics au type de voie et à l'issue générale ; ne pas journaliser audio, contenu complet, chaîne de pensée, prompt ni score sans décision de confidentialité distincte.

NFR-M1: Les clés restent exclusivement dans le BFF ; le corpus ne contient aucune donnée utilisateur ni secret.

NFR-M2: L'évaluation ne remplace pas la génération de production tant qu'une décision humaine n'a pas validé les résultats.

NFR-M3: La bascule documente la configuration Render, les contrôles post-déploiement et le plan de repli.

### Additional Requirements

- Avant toute implémentation, réconcilier les changements de comportement dans `docs/SPEC.md`, `docs/DOMAIN.md` et `docs/ARCH.md`; conserver `PLAN.md` et `ISSUES.md` factuels.
- Respecter l'architecture local-first : le Cahier et les médias utilisateur restent dans IndexedDB ; le client est la source de vérité ; `web` dépend de `domain` et n'accède au BFF que par HTTP ; secrets et appels cloud restent dans le BFF.
- Réutiliser les règles de validation, normalisation, portions et déduplication de `packages/domain`, sans les réimplémenter ; garder les jumeaux TypeScript/JavaScript alignés pour les nouvelles règles partagées.
- Implémenter un routeur Assistant déterministe qui reçoit une commande immuable et choisit exactement une voie ; les starters préremplissent uniquement le Compositeur.
- Isoler `assistant-session` comme propriétaire unique des états `idle | routing | searching | importing | creating | ready | error`, avec `requestId` monotone et `AbortController`; propager `signal`, repropager `AbortError`, contrôler les résultats tardifs et garantir la disparition UI après annulation.
- Modéliser toute prévisualisation comme une session éphémère `AssistantPreview`, jamais comme une `Recipe`, une ligne Dexie, une donnée restaurée, une clé d'URL ou une donnée de `sessionStorage`.
- Conserver `ImportSource` et les fichiers transitoires pour les imports Assistant ; adapter `ImportService` plutôt que créer un second parseur ; garder les autres entrées v1 sur `parse → create → détail` jusqu'à une migration explicitement décidée.
- Exposer `POST /api/assistant/recipe`, accepté seulement avec un texte UTF-8 non vide de 12 000 caractères maximum et répondant exclusivement par `AssistantDraftWireV1` ou les codes `INVALID_INPUT`, `INPUT_TOO_LARGE`, `UPSTREAM_UNAVAILABLE`, `NO_RECIPE`; aucun serveur ne persiste recette, conversation ou audio.
- Implémenter la sélection Cahier en lecture seule via `RecipeService.listRecipes`, avec snapshot immuable trié `favorite DESC`, `updatedAt DESC`, `id ASC`, plafonné à 60; mapper les identifiants locaux vers des `candidateRef` opaques, session-only.
- Valider dans `packages/domain` les wires V1 : `NotebookSelectionRequestV1` (query et candidats minimisés) et `NotebookSelectionWireV1` (outcome, 1 à 3 refs au maximum, `reasonCode` fermé) ; BFF et web doivent valider et rejeter les formes/références périmées.
- Pour la sélection, déclencher Luna une seule fois seulement après timeout, 429/5xx ou réponse Jev invalide ; une annulation ne déclenche aucun fallback ; les échecs des deux fournisseurs donnent `selectionUnavailable`/erreur, jamais une création sur mesure.
- Appliquer après sélection les contraintes littérales vérifiables localement (ingrédient obligatoire/interdit, durée connue) ; seules des refs rejetées peuvent devenir un `noCandidate` valide, lequel seul autorise la création BFF.
- Rendre une raison utilisateur courte depuis le `reasonCode` sans divulguer score ni raisonnement ; ne journaliser que `route`, `phase`, `outcome`, classe HTTP et `requestId` opaque.
- Conserver texte et image sur erreur ou annulation ; distinguer un fallback draft import d'une erreur sans draft, et ne jamais transformer une annulation en fallback.
- Faire passer la sauvegarde de prévisualisation par un unique `preview-save-service` : projection/validation domaine, transaction Dexie atomique pour fichiers source et recette, puis uniquement `RecipeService.create`; aucun échec ne laisse de recette ou blob orphelin.
- Désactiver Sauvegarder pendant sa seule transaction ; après succès, garder le détail lisible via un override même si le rafraîchissement échoue ou que des filtres excluent la recette ; après échec, conserver prévisualisation et modifications.
- Isoler la reconnaissance vocale comme adaptateur navigateur optionnel et local ; elle n'insère qu'une transcription acceptée au curseur, sans blob, persistance ou envoi audio.
- Préserver navigation et accessibilité : les parcours v1 restent hors session Assistant ; `Esc` ferme le détail ou annule l'écoute sans effacer de saisie ; le retour restaure le déclencheur approprié.
- Conserver les contrats de déploiement existants : PWA GitHub Pages, BFF Render Node 20, `VITE_BFF_URL` et `CORS_ORIGIN`.
- Couvrir par tests Node/tsx les règles de routage, la machine d'état, annulation/fallback, la sélection Jev→Luna→indisponible, seuil/ordre/cap/longueur/références/contraintes, partage F2, la sauvegarde transactionnelle et le détail hors filtre ; couvrir côté BFF wires, limites, codes et redaction.
- L'évaluation et la migration image respectent la centralisation actuelle de la sélection par `AI_IMAGE_MODEL_RECIPE`, `AI_IMAGE_MODEL_INGREDIENT` et `AI_IMAGE_MODEL_COOKING_STEP` dans le BFF ; aucune clé ne va dans le front.
- `gpt-image-1-mini` est annoncé en retrait d'API le 1er décembre 2026 ; la migration doit être validée avant cette date sans écraser les objets de cache existants.

### UX Design Requirements

UX-DR1: Étendre l'identité PrimeVue Aura existante sans créer de design system, avec une expérience chaleureuse, calme et orientée action culinaire plutôt qu'une console d'IA.

UX-DR2: Conserver Manrope et appliquer les rôles typographiques définis : grand titre pour « On mange quoi ? », titre pour résultats, corps pour recette/explication et méta pour statuts.

UX-DR3: Utiliser les tokens de couleur et de forme de la spine : Compositeur vert primaire, fond chaud, surfaces élevées, jaune réservé à l'envoi, rouge réservé aux erreurs, rayons et espacement définis.

UX-DR4: Construire une surface mobile-first en colonne, shell de 720 px maximum, gouttières mobiles définies et sans défilement horizontal de viewport ; seul le carrousel peut défiler horizontalement.

UX-DR5: Mettre le Compositeur comme foyer visuel, avec zone d'écriture généreuse, micro, pièce jointe et envoi à taille tactile ; son traitement remplace son contenu sans panneau concurrent.

UX-DR6: Fournir des starters secondaires qui préremplissent et focalisent le Compositeur, sans lancer de traitement, ainsi qu'un carrousel de découverte Cahier distinct des résultats de recherche.

UX-DR7: Permettre `Cmd/Ctrl+Entrée` pour envoyer ; pour une saisie vide sans image, afficher une erreur courte puis restaurer le focus texte.

UX-DR8: Rendre l'image jointe nommée et retirable ; l'image reste prioritaire au routage et le texte l'accompagne.

UX-DR9: Afficher pendant un traitement une progression qui désactive les entrées concurrentes, focalise Annuler et annonce les changements, avec un message humain court et jamais de jargon, score ou raisonnement.

UX-DR10: Afficher le choix explicite d'ambiguïté « Importer cette recette » ou « Chercher une idée » et ne jamais résoudre cette situation silencieusement.

UX-DR11: Construire des cartes de résultat entièrement activables par toucher, Entrée et Espace ; elles affichent statut, titre, méta et affordance d'ouverture mais ne sauvegardent jamais directement.

UX-DR12: Distinguer visuellement la recette Cahier et la prévisualisation : le détail de prévisualisation expose provenance, contenu éditable, Sauvegarder et fermeture sans écriture ; le détail Cahier ne montre pas de fausse sauvegarde et ne mute rien à la fermeture.

UX-DR13: Afficher une confirmation courte et annoncée après sauvegarde ; ne pas réutiliser le jaune d'envoi comme code de succès.

UX-DR14: Présenter les états d'accueil froid, saisie vide, routage clair/ambigu, recherche, aucun résultat, import/création prêt, annulation, erreur, hors ligne, micro indisponible et sauvegarde réussie avec le comportement et la tonalité prescrits.

UX-DR15: Préserver texte et image à l'annulation, réactiver les contrôles et empêcher tout résultat différé ; en hors-ligne, conserver la demande et expliquer l'indisponibilité de sélection sans l'effacer.

UX-DR16: Assurer des cibles d'au moins 44 px, focus visible, ordre de tabulation logique et régions live sobres pour écoute, progression, erreur et sauvegarde.

UX-DR17: Gérer la restauration du focus à la carte ou au Compositeur après détail ; ne piéger le focus que si le détail est un dialogue modal ; `Esc` ferme détail ou annule la dictée sans supprimer la saisie.

UX-DR18: Respecter `prefers-reduced-motion` et garantir que tout état est compréhensible sans animation ni survol.

UX-DR19: Prévoir un texte alternatif utile pour chaque illustration et une alternative texte visible sans JavaScript, sans promettre l'audio ou l'analyse.

UX-DR20: Conserver le même ordre de lecture et les mêmes actions du téléphone au bureau, sans panneaux latéraux ; le carrousel répond aux flèches lorsqu'il a le focus.

### FR Coverage Map

- FR-1 : Epic 1 — Compositeur et entrées assistant.
- FR-2 : Epic 1 — Routage d'import explicable.
- FR-3 : Epic 2 — Sélection Cahier puis création contrôlée.
- FR-4 : Epic 1 — Progression, annulation et erreurs d'import.
- FR-5 : Epic 1 — Cartes, prévisualisation et sauvegarde.
- FR-6 : Epic 1 — Accessibilité et responsive.
- FR-7 : Epic 1 — Préservation des parcours v1.
- FR-M1 : Epic 3 — Corpus d'évaluation représentatif des usages image.
- FR-M2 : Epic 3 — Exécution reproductible et conservation des mesures.
- FR-M3 : Epic 3 — Décision fondée sur qualité, latence, coût et régénérations.
- FR-M4 : Epic 3 — Migration avant le retrait de `gpt-image-1-mini`.
- FR-M5 : Epic 3 — Configuration par usage et repli contrôlé.

## Epic List

### Epic 1: Importer et préparer une recette depuis l'Assistant

L'utilisateur peut démarrer depuis un accueil assistant-first, apporter une recette (URL, image, texte ou partage), l'importer dans un flux annulable, la relire en prévisualisation puis la sauvegarder explicitement, tout en conservant les parcours v1.

**FRs covered:** FR-1, FR-2, FR-4, FR-5, FR-6, FR-7.

### Epic 2: Trouver ou imaginer un repas à partir du Cahier

L'utilisateur peut formuler une envie libre ; l'Assistant consulte d'abord son Cahier, propose des recettes existantes pertinentes ou, seulement si aucune ne convient, prépare une recette sur mesure à sauvegarder explicitement.

**FRs covered:** FR-3.

### Epic 3: Conserver des visuels de recette fiables et pérennes

Les personnes utilisant Cooks-n-Coqs continuent à recevoir des photos de recettes, d'ingrédients et d'étapes de qualité cohérente après le retrait de `gpt-image-1-mini`, avec une décision de remplacement fondée sur une comparaison mesurée avec `gpt-image-2.5-flare`, plutôt que sur une estimation.

**FRs covered:** FR-M1, FR-M2, FR-M3, FR-M4, FR-M5.

## Epic 1: Importer et préparer une recette depuis l'Assistant

L'utilisateur peut démarrer depuis un accueil assistant-first, apporter une recette (URL, image, texte ou partage), l'importer dans un flux annulable, la relire en prévisualisation puis la sauvegarder explicitement, tout en conservant les parcours v1.

### Story 1.1: Accueil Assistant et Compositeur accessible

As a personne qui prépare un repas,
I want ouvrir l'application sur un accueil Assistant et exprimer ou préparer ma demande dans un Compositeur unique,
So that je peux démarrer par mon intention ou une recette apportée tout en retrouvant clairement les parcours v1.

**Acceptance Criteria:**

**Given** les documents normatifs de l'évolution sont réconciliés avant tout comportement applicatif,
**When** une personne ouvre l'application,
**Then** elle voit un accueil Assistant mobile-first avec le Compositeur au premier plan, des starters qui préremplissent puis focalisent le texte sans envoyer, et un accès explicite au Cahier, à la création manuelle, à l'import `.zip`, à l'édition et au partage v1,
**And** aucun parcours v1 n'est routé silencieusement dans l'Assistant.

**Given** le Compositeur est disponible,
**When** la personne saisit ou colle du texte, une URL ou une recette, joint/colle une image, ou utilise une dictée prise en charge,
**Then** le texte demeure éditable, l'image est nommée et retirable, et la transcription acceptée est insérée au curseur sans audio brut stocké ou envoyé,
**And** la dictée indisponible, refusée ou échouée laisse le champ texte utilisable et intact.

**Given** le Compositeur ne contient ni texte ni image,
**When** la personne tente l'envoi,
**Then** une explication courte des formats acceptés est annoncée et le focus revient au texte,
**And** `Cmd/Ctrl+Entrée` peut envoyer lorsque la demande est valide.

**Given** l'accueil est utilisé au clavier, au toucher, sur mobile ou avec mouvement réduit,
**When** la personne navigue entre ses contrôles,
**Then** les actions ont un nom accessible, une cible d'au moins 44 px, un focus visible et un ordre logique,
**And** le viewport ne défile pas horizontalement, le carrousel est le seul élément horizontal et reste pilotable aux flèches lorsqu'il a le focus.

**Given** l'accueil Assistant est rendu sur téléphone, tablette ou bureau,
**When** ses surfaces et composants sont composés,
**Then** il étend PrimeVue Aura existant avec Manrope, un shell en colonne de 720 px maximum, le Compositeur vert, des surfaces chaudes, le jaune réservé à l'envoi et le rouge réservé à l'erreur,
**And** il conserve le même ordre de lecture sans panneau latéral, le Compositeur comme foyer visuel et les starters/carrousel comme éléments secondaires.

### Story 1.2: Importer une recette apportée en prévisualisation annulable

As a personne qui apporte une recette,
I want envoyer une URL, une image, une recette structurée ou un partage depuis le Compositeur et relire le résultat avant de le sauvegarder,
So that je peux importer sans perte de contenu ni écriture implicite dans mon Cahier.

**Acceptance Criteria:**

**Given** une commande Assistant est envoyée avec image, URL HTTP(S), recette structurée, texte F2 ou partage,
**When** le routage détermine sa voie selon les priorités définies,
**Then** il choisit exactement une voie d'import et réutilise un adaptateur annulable d'`ImportService` qui préserve `ImportSource` et les fichiers transitoires,
**And** une image transmet éventuellement son texte comme contexte d'import, sans lancer une recherche séparée.

**Given** un texte peut être à la fois une recette et une demande libre,
**When** le routage ne peut pas déterminer la voie de façon certaine,
**Then** il propose « Importer cette recette » ou « Chercher une idée »,
**And** il n'effectue aucun import ou recherche avant le choix explicite.

**Given** un import est en cours,
**When** la personne consulte l'interface ou annule,
**Then** une étape publique compréhensible est annoncée, Annuler reçoit le focus, les entrées concurrentes sont désactivées,
**And** l'annulation invalide les résultats tardifs, réactive le Compositeur et conserve texte, curseur et image, sans fallback ni brouillon inattendu.

**Given** l'import fournit un draft normal ou un fallback éditable v1,
**When** il se termine,
**Then** l'Assistant affiche une carte ouvrable au clavier et au toucher puis un Détail prévisualisé avec provenance et contenu éditable,
**And** la prévisualisation est une session éphémère, sans `Recipe`, écriture Dexie, URL ou `sessionStorage`.

**Given** l'import échoue sans draft,
**When** l'erreur est rendue,
**Then** la commande est conservée avec un message actionnable sans contenu sensible dans les diagnostics,
**And** les autres parcours v1 conservent leur contrat actuel `parse → create → détail`.

### Story 1.3: Sauvegarder atomiquement une prévisualisation

As a personne qui a relu une recette prévisualisée,
I want la sauvegarder explicitement dans mon Cahier,
So that elle devient une recette locale normale sans doublon ni données partielles.

**Acceptance Criteria:**

**Given** une prévisualisation d'import est ouverte et éditée,
**When** la personne sélectionne Sauvegarder,
**Then** un unique `preview-save-service` projette le draft édité, applique normalisation et validation dans `packages/domain`, puis utilise uniquement `RecipeService.create`,
**And** Sauvegarder reste désactivé pendant ce seul traitement.

**Given** la prévisualisation comporte des fichiers source nécessaires,
**When** la sauvegarde est exécutée,
**Then** les fichiers et la recette sont écrits dans une transaction Dexie unique,
**And** un échec ne laisse ni recette ni blob source orphelin.

**Given** la sauvegarde réussit,
**When** la recette normalisée est retournée,
**Then** une confirmation courte est annoncée et le détail persistant reste immédiatement affichable, même si le rafraîchissement échoue ou si un filtre l'exclut,
**And** favoris, portions, partage, édition et mode cuisine deviennent ensuite ceux d'une recette v1 ordinaire.

**Given** la sauvegarde échoue ou que la personne ferme la prévisualisation,
**When** l'action se termine,
**Then** l'échec laisse la prévisualisation et ses modifications ouvertes pour correction, ou la fermeture l'abandonne sans écriture et réinitialise l'accueil Assistant,
**And** fermer une recette existante du Cahier ne la modifie jamais.

## Epic 2: Trouver ou imaginer un repas à partir du Cahier

L'utilisateur peut formuler une envie libre ; l'Assistant consulte d'abord son Cahier, propose des recettes existantes pertinentes ou, seulement si aucune ne convient, prépare une recette sur mesure à sauvegarder explicitement.

### Story 2.1: Trouver une recette pertinente dans le Cahier

As a personne qui formule une envie de repas,
I want que l'Assistant consulte d'abord mon Cahier et me propose seulement des recettes pertinentes,
So that je retrouve une recette existante sans doublon ni exposition inutile de mes données.

**Acceptance Criteria:**

**Given** une demande libre explicite de 1 200 caractères ou moins est envoyée,
**When** l'Assistant commence la recherche,
**Then** `notebook-search` lit les recettes exclusivement via `RecipeService.listRecipes`, sans les modifier, et produit un snapshot immuable trié `favorite DESC`, `updatedAt DESC`, `id ASC`, limité aux 60 premières,
**And** chaque recette est représentée par un `candidateRef` opaque, éphémère et mappé localement à son identifiant durable.

**Given** le snapshot est prêt,
**When** le client appelle la sélection BFF,
**Then** il ne transmet que la requête, le titre, les libellés d'ingrédients, la durée et des `candidateRef`, via `NotebookSelectionRequestV1` validé dans les jumeaux TypeScript/JavaScript de `packages/domain`,
**And** il ne transmet ni identifiant durable, étapes, image, note, URL source ni payload persistant, sans opt-in ni interstitiel.

**Given** Jev est disponible et retourne une réponse valide,
**When** le BFF classe les candidates,
**Then** `jev-1.13.0` est l'unique fournisseur primaire et normalise les résultats dans `NotebookSelectionWireV1`,
**And** seules une à trois refs de pertinence `p ≥ 0,5` peuvent former l'outcome `candidate`, sinon l'outcome est `noCandidate`, sans raison libre.

**Given** Jev subit un timeout, un 429/5xx ou une réponse typée invalide,
**When** le BFF doit assurer la continuité,
**Then** il tente une seule fois `gpt-5.6-luna` avec `reasoning.effort: "none"` et applique le même seuil et plafond,
**And** ni annulation, ni réponse Jev valide sans candidate, ni autre condition ne déclenche Luna.

**Given** le client reçoit une sélection,
**When** il valide les refs et applique les contraintes littérales localement déterminables — ingrédient obligatoire/interdit et durée connue —,
**Then** seules des recettes encore valides sont présentées sous forme de cartes Cahier ouvrant leur détail persistant avec une raison courte orientée utilisateur,
**And** score, seuil, raisonnement, contenu complet, prompt et audio ne sont ni affichés ni journalisés.

**Given** la recherche est annulée, reçoit des refs périmées, ou ne peut pas aboutir après les deux fournisseurs,
**When** l'état se résout,
**Then** l'annulation conserve la commande et n'affiche aucun résultat tardif ; les refs invalides sont rejetées ; et `selectionUnavailable` devient une erreur actionnable sans déclencher de création,
**And** les tests couvrent ordre, plafond, limite de demande, payload, seuil commun, bascule Jev→Luna, indisponibilité, contraintes et confidentialité.

### Story 2.2: Prévisualiser une recette sur mesure après absence de candidat

As a personne dont le Cahier ne contient pas de recette utile,
I want recevoir une proposition sur mesure à relire puis choisir explicitement de la sauvegarder,
So that je peux élargir mes idées sans créer de recette automatiquement.

**Acceptance Criteria:**

**Given** la sélection Cahier retourne un `noCandidate` valide après contrôle local des références et contraintes littérales,
**When** l'Assistant poursuit le flux,
**Then** il peut appeler `POST /api/assistant/recipe` avec la demande texte explicite,
**And** aucun autre outcome — notamment `selectionUnavailable`, annulation, refs périmées ou erreur de sélection — ne peut déclencher cette création.

**Given** le BFF reçoit une demande de création,
**When** le texte est vide, invalide ou dépasse 12 000 caractères,
**Then** il retourne respectivement le contrat d'erreur typé applicable (`INVALID_INPUT` ou `INPUT_TOO_LARGE`) sans appel amont,
**And** le BFF ne persiste ni recette, ni conversation, ni audio brut.

**Given** la création distante aboutit,
**When** le BFF retourne son résultat,
**Then** il normalise uniquement `AssistantDraftWireV1`, que le client décode et valide avant de construire une `AssistantPreview` d'origine `CUSTOM`,
**And** le résultat est présenté par une carte ouvrable et un Détail prévisualisé, puis n'est durable qu'à travers la sauvegarde explicite de la story 1.3.

**Given** l'amont est indisponible, répond sans recette, ou que la création est annulée,
**When** le flux se termine,
**Then** le Compositeur conserve la demande avec un message public actionnable et sans objet d'erreur brut,
**And** les diagnostics restent limités à route, phase, issue, classe HTTP et `requestId` opaque, sans contenu complet, prompt, pensée ni score.

**Given** la création sur mesure est en cours,
**When** son état change ou que la personne sélectionne Annuler,
**Then** l'interface annonce une étape publique compréhensible, reste lisible sans animation et respecte le mouvement réduit,
**And** Annuler conserve la demande, invalide tout résultat tardif et ne déclenche aucun fallback.

**Given** le flux création est testé,
**When** les tests BFF et web sont exécutés,
**Then** ils couvrent wire V1, limites, codes, absence de persistance, redaction, progression/annulation et l'interdiction de créer après une indisponibilité de sélection,
**And** la recette sur mesure sauvegardée rejoint ensuite le Cahier comme recette v1 normale.

## Epic 3: Conserver des visuels de recette fiables et pérennes

Les personnes utilisant Cooks-n-Coqs continuent à recevoir des photos de recettes, d'ingrédients et d'étapes de qualité cohérente après le retrait de `gpt-image-1-mini`, avec une décision de modèle fondée sur des résultats mesurés plutôt que sur une estimation.

### Story 3.1: Produire un benchmark représentatif des visuels

As a mainteneur de Cooks-n-Coqs,
I want générer de façon reproductible des visuels comparables pour les recettes, ingrédients et étapes,
So that je décide sur des exemples réels plutôt que sur les caractéristiques théoriques des modèles.

**Acceptance Criteria:**

**Given** un corpus versionné, non sensible, couvrant recettes, ingrédients isolés et étapes de cuisine,
**When** le benchmark est exécuté avec un même prompt, taille et qualité par cas,
**Then** il génère et conserve les rendus du modèle actuel et des candidats identifiés, avec leur usage et leurs paramètres,
**And** le corpus ne contient ni données utilisateur ni clé API.

**Given** une exécution du benchmark,
**When** chaque requête image se termine,
**Then** le relevé associe à chaque rendu le modèle, la qualité, les dimensions demandées et reçues quand disponibles, la latence, les tokens d'entrée et de sortie fournis par l'API, le statut d'erreur ou de succès et le coût API standard estimé,
**And** la table tarifaire utilisée, sa date de vérification et la formule sont versionnées avec le résultat ; une absence de données de tokens rend le coût indisponible, jamais nul,
**And** une erreur individuelle n'empêche pas la collecte des autres cas.

**Given** le run de décision,
**When** il compare le modèle courant et son candidat de remplacement,
**Then** il exécute `gpt-image-1-mini` et `gpt-image-2.5-flare` avec les mêmes prompts, qualité `low` et paramètres de taille actuels,
**And** un second profil Flare compare pour les ingrédients `1024x1024` et `816x816`, puis les rend tous deux au format de lecture `64x64`,
**And** l'essai de taille ne modifie pas encore la taille de production et ne compare pas une taille non prise en charge par Mini.

**Given** les images de benchmark,
**When** elles sont examinées dans leur contexte d'usage,
**Then** les sorties permettent d'évaluer la fidélité au prompt, l'absence d'artefacts et la lisibilité à la taille réellement affichée dans l'application,
**And** la page de revue et le manifeste présentent les mesures par tentative et les agrégats par modèle et par usage, en distinguant valeurs API, coût estimé et appréciation humaine,
**And** le benchmark ne change ni les variables Render ni les objets déjà présents dans le cache de production.

### Story 3.2: Valider le modèle retenu par usage

As a mainteneur de Cooks-n-Coqs,
I want comparer et valider les résultats du benchmark selon des critères définis,
So that je retiens un modèle adapté pour chaque type de visuel sans dégrader l'expérience ni les coûts.

**Acceptance Criteria:**

**Given** un benchmark Mini ↔ Flare terminé et une évaluation humaine renseignée pour chaque usage,
**When** les résultats sont consolidés,
**Then** un rapport compare par usage `recipe`, `ingredient` et `cooking_step` la qualité observée, la lisibilité, les artefacts, la latence, les erreurs, les tokens API et le coût standard estimé,
**And** il distingue les mesures API des appréciations visuelles humaines.

**Given** les critères de décision convenus,
**When** un modèle est retenu ou rejeté pour un usage,
**Then** le rapport conclut par usage : conserver temporairement Mini pendant l'évaluation, retenir Flare à taille actuelle, retenir Flare avec la taille ingrédient optimisée, ou ne pas retenir Flare,
**And** il explicite la décision et les cas de corpus qui la justifient,
**And** pour les ingrédients, la décision exige une lisibilité équivalente à `64x64`, l'absence d'artefact et un gain mesuré ou une absence de régression acceptable sur coût et latence,
**And** il ne prétend pas comparer la facture réelle ; les taux de régénération sont marqués non mesurés s'ils n'ont pas fait l'objet d'essais.

**Given** une recommandation de migration,
**When** elle est préparée pour l'implémentation,
**Then** elle nomme une configuration cible par usage et une configuration de repli,
**And** elle ne modifie aucune variable de production sans validation humaine explicite.

### Story 3.3: Migrer les modèles image avec repli contrôlé

As a personne utilisant Cooks-n-Coqs,
I want que les visuels continuent d'être générés après le retrait de `gpt-image-1-mini`,
So that je ne perds pas les illustrations de recettes, d'ingrédients ou d'étapes.

**Acceptance Criteria:**

**Given** une recommandation Mini ↔ Flare explicitement validée par Patrice et, si une taille de production est retenue, la taille par usage explicitement validée,
**When** la configuration BFF est mise à jour avant le 1er décembre 2026,
**Then** `recipe`, `ingredient` et `cooking_step` résolvent les modèles explicitement retenus,
**And** la configuration est documentée pour Render sans exposer de secret au navigateur.

**Given** le déploiement de cette configuration,
**When** une photo de recette, un ingrédient et une étape sont générés en production,
**Then** chaque usage produit une image lisible et accessible via le cache existant,
**And** la migration modifie uniquement les modèles et, le cas échéant, les tailles explicitement validées,
**And** les images mises en cache avant la bascule restent lisibles et ne sont ni purgées ni régénérées par celle-ci.

**Given** une régression identifiée après déploiement,
**When** le mainteneur applique le repli documenté,
**Then** il peut restaurer le modèle et la taille précédents par usage sans changement de code ni purge du cache,
**And** le contrôle post-déploiement et son résultat sont consignés.
