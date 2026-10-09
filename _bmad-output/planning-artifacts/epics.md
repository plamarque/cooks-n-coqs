---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
updated: '2026-10-04'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-cooks-n-coqs-2026-10-01/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-cooks-n-coqs-2026-10-01/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-cooks-n-coqs-2026-10-01/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-cooks-n-coqs-2026-10-01/EXPERIENCE.md
  - _bmad-output/planning-artifacts/architecture/architecture-cooks-n-coqs-2026-10-04/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-cooks-n-coqs-2026-10-04/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-cooks-n-coqs-2026-10-04/EXPERIENCE.md
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

### Chef C&C — Functional Requirements

Chef-FR-1: Offrir au Chef une identité incarnée accessible et des surfaces cohérentes : accueil/import, Cahier, fiche recette et mode cuisine, avec retour immédiat au contexte hôte et alternative texte complète à la voix.

Chef-FR-2: Conduire une conversation culinaire continue, chaleureuse et orientée : recommandation principale motivée, au plus une seconde piste pour une demande vague, clarification ou photo seulement si indispensable, sans exposer de raisonnement interne.

Chef-FR-3: Créer ou adapter avec le contexte utile : variante, substitution, portions, correction et rattrapage ; toute recette ou modification durable est prévisualisée puis confirmée.

Chef-FR-4: Exploiter localement préférences, foyer, goûts, retours, contexte de séance et garde-manger probable, avec intention présente prioritaire, confiance explicite, contrôle et absence d'enfermement dans les habitudes.

Chef-FR-5: Accéder au contexte affiché et au Cahier uniquement par des outils client-médiés, minimisés et contrôlés ; ne jamais envoyer par défaut Cahier complet, audio brut, historique intégral ou profil personnel au BFF.

Chef-FR-6: Distinguer actions réversibles de séance et écritures durables confirmées ; rendre les opérations longues annulables, préserver l'entrée et éviter tout résultat tardif ou faux succès.

Chef-FR-7: Ne déclencher découverte proactive ou notification qu'après activation explicite d'un rituel ; traiter la livraison comme best-effort et toujours révocable.

### Chef C&C — NonFunctional Requirements

Chef-NFR-1: Maintenir recettes, profil et journal de conversations local-first, visibles, corrigibles, supprimables et réduits au contexte strictement nécessaire hors appareil.

Chef-NFR-2: Garder toutes les surfaces du Chef utilisables au clavier et au toucher, avec texte alternatif à la voix, mouvement réduit, et sans masquer durablement l'étape, le minuteur ou l'action principale hôte.

Chef-NFR-3: Distinguer certitude, hypothèse et donnée à vérifier ; ne pas prétendre connaître un ingrédient, un stock ou une préférence non reçue ou insuffisamment établie, et ne pas donner de conseil médical.

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
- Chef-FR-1 : Epics 4, 5 et 6 — conversation, identité incarnée et surfaces contextuelles.
- Chef-FR-2 : Epics 1, 2 et 4 — routage existant, fil continu et contrat de conseil orienté.
- Chef-FR-3 : Epics 1, 2 et 6 — prévisualisation, sauvegarde explicite et dépannage contextualisé.
- Chef-FR-4 : Epic 7 — profil local nuancé, gestion, outils et portabilité.
- Chef-FR-5 : Epics 6 et 7 — contexte minimal et outils client-médiés.
- Chef-FR-6 : Epics 4, 6 et 7 — annulation, actions de séance et mutations confirmées.
- Chef-FR-7 : Epic 8 — rituels opt-in et livraison best-effort.
- Chef-NFR-1 : Epics 4, 6, 7 et 8 — données, journal et décisions locaux.
- Chef-NFR-2 : Epics 4, 5 et 6 — accessibilité, mouvement réduit et cohabitation avec l'hôte.
- Chef-NFR-3 : Epics 4, 6 et 7 — conseil honnête, hypothèses et contrôle.

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

### Epic 4: Rendre la conversation Assistant claire et continue

L'utilisateur peut commencer, clôturer ou reprendre une conversation Assistant locale, relire ses cartes recette et images jointes, sans fil éternel ni mémoire personnelle implicite.

**Exigences Chef couvertes:** composant conversationnel plein écran, journal local, Nouvelle conversation, reprise du dernier fil, cartes recette interactives et pièces jointes persistantes.

**FRs Chef couverts:** Chef-FR-1, Chef-FR-2, Chef-FR-6, Chef-NFR-1, Chef-NFR-2, Chef-NFR-3.

**Garde-fous:** journal supprimable et rétention/limite à décider ; hors ligne et annulation conservent la saisie ; aucune mémoire Chef ni mutation personnelle n'est activée dans cet epic.

### Story 4.1: Démarrer et clôturer une conversation Assistant

En tant que personne qui cherche une idée de repas,
je veux démarrer une conversation depuis l'accueil Assistant et en commencer explicitement une nouvelle,
afin que chaque intention culinaire ait un début clair sans effacer silencieusement mon échange précédent.

**Critères d'acceptation:**

**Étant donné** que l'accueil Assistant est affiché sans fil actif,
**quand** je saisis une demande, un starter ou une pièce jointe puis l'envoie,
**alors** l'interface bascule vers un fil de conversation local structuré,
**et** le Chef, les messages utilisateur et les réponses sont rendus dans l'ordre du fil.

**Étant donné** qu'un fil Assistant est actif,
**quand** je choisis « Nouvelle conversation »,
**alors** le fil courant est clôturé et archivé localement sans être effacé,
**et** l'accueil d'inspiration réapparaît avec un Compositeur vide prêt à une nouvelle intention.

**Étant donné** que je n'ai encore envoyé aucune demande dans le nouveau fil,
**quand** je reviens au Cahier ou ferme l'écran Assistant,
**alors** aucun fil vide n'est créé,
**et** le focus revient au déclencheur d'origine.

### Story 4.2: Retrouver le dernier échange Assistant

En tant que personne qui revient dans l'Assistant,
je veux pouvoir reprendre mon dernier échange pertinent,
afin de continuer une idée ou une recette sans devoir repartir de zéro.

**Critères d'acceptation:**

**Étant donné** qu'au moins un fil local clôturé ou interrompu existe,
**quand** j'ouvre l'écran Assistant depuis le Cahier,
**alors** l'accueil propose clairement « Reprendre » le dernier fil pertinent et « Nouvelle conversation »,
**et** aucun fil supplémentaire n'est créé par cette simple ouverture.

**Étant donné** que je choisis « Reprendre »,
**quand** le fil est chargé,
**alors** ses messages, cartes recette et pièces jointes déjà disponibles localement sont restaurés dans leur ordre,
**et** le Compositeur permet de poursuivre cet échange.

**Étant donné** qu'aucun fil n'existe ou que le dernier a été supprimé,
**quand** j'ouvre l'Assistant,
**alors** l'accueil d'inspiration est affiché sans action de reprise inactive.

**Étant donné** que le stockage local est indisponible ou qu'un fil est illisible,
**quand** je tente de le reprendre,
**alors** l'application l'explique brièvement et propose une nouvelle conversation sans perdre une saisie en cours.

### Story 4.3: Garder les messages riches dans le fil

En tant que personne qui échange avec le Chef,
je veux retrouver les recettes et images envoyées directement dans la conversation,
afin de revenir sur une proposition sans perdre son contexte.

**Critères d'acceptation:**

**Étant donné** qu'une recette du Cahier est trouvée ou qu'une recette est générée,
**quand** le Chef la présente dans le fil,
**alors** elle apparaît comme une carte persistante avec vignette, statut et action d'ouverture,
**et** l'ouverture mène au détail ou à la prévisualisation appropriée sans altérer le fil.

**Étant donné** que j'envoie une ou plusieurs images avec une demande,
**quand** le message est accepté,
**alors** les images restent attachées à ce message dans le fil, dans leur ordre,
**et** elles sont retirées du Compositeur afin que celui-ci soit prêt pour le tour suivant.

**Étant donné** que le fil est repris localement,
**quand** ses messages sont rendus,
**alors** les tours utilisateur et Chef sont visuellement et sémantiquement distincts,
**et** l'ordre, les pièces jointes et les cartes disponibles sont préservés.

**Étant donné** que l'une de ces ressources est indisponible localement,
**quand** le fil est rendu,
**alors** le message reste lisible avec un état de ressource indisponible,
**et** l'application ne réenvoie pas silencieusement de donnée utilisateur au BFF.

### Story 4.4: Préserver le fil en cas d'interruption

En tant que personne qui utilise l'Assistant dans des conditions imparfaites,
je veux que mon fil et ma saisie restent cohérents si j'annule, perds le réseau ou quitte l'écran,
afin de ne pas perdre mon intention ni recevoir une réponse hors contexte.

**Critères d'acceptation:**

**Étant donné** qu'une demande distante est en cours,
**quand** je l'annule, commence une nouvelle conversation ou quitte le fil,
**alors** les réponses tardives de cette demande sont ignorées,
**et** mon texte non envoyé et mes pièces jointes restent disponibles dans le contexte actif.

**Étant donné** que le BFF est indisponible ou que l'appareil est hors ligne,
**quand** j'envoie un message nécessitant une capacité distante,
**alors** le message est conservé dans le fil avec un état explicite et actionnable,
**et** le Cahier, les fils existants et les cartes locales restent consultables.

**Étant donné** qu'un fil est supprimé,
**quand** la suppression est confirmée,
**alors** ses données locales ne sont plus proposées à la reprise,
**et** une recette déjà sauvegardée dans le Cahier n'est jamais supprimée avec le fil.

**Étant donné** que la politique de rétention atteint une limite définie,
**quand** un nouveau fil doit être archivé,
**alors** l'application applique une règle locale prévisible sans persister de contenu au BFF,
**et** informe l'utilisateur seulement si son action immédiate est concernée.

**Étant donné** que le mouvement est réduit ou indisponible,
**quand** l'accueil bascule vers le fil,
**alors** le changement reste compréhensible sans animation, annoncé sobrement et utilisable au clavier/toucher.

### Story 4.5: Donner un conseil culinaire orienté et honnête

En tant que personne qui demande de l'aide au Chef,
je veux recevoir un conseil clair adapté à ce que je sais réellement,
afin d'avancer avec confiance sans être noyée sous les options ni induite en erreur.

**Critères d'acceptation:**

**Étant donné** qu'une demande est suffisamment qualifiée,
**quand** le Chef répond dans le fil,
**alors** il formule une recommandation principale avec une raison courte, chaleureuse et concrète,
**et** il ne demande pas de précision superflue.

**Étant donné** qu'une demande reste vague ou incertaine,
**quand** plusieurs voies sont utiles,
**alors** le Chef propose au plus une seconde piste concrète en plus de sa recommandation,
**et** il ne transforme pas son aide en liste vague ou anxiogène.

**Étant donné** qu'une information indispensable manque ou qu'une hypothèse doit être vérifiée,
**quand** le Chef ne peut pas conseiller fiablement,
**alors** il pose une question ciblée ou demande une photo sans faire sentir la personne incapable,
**et** il distingue simplement ce qu'il sait, ce qu'il suppose et ce qui reste à vérifier.

**Étant donné** que le Chef explique son conseil,
**quand** il formule sa réponse,
**alors** il reste concis, non jugeant et centré sur la cuisine,
**et** il n'expose ni chaîne de pensée, score, prompt ni jargon technique.

### Epic 5: Donner corps au Chef C&C

L'utilisateur retrouve un Chef visuellement cohérent et vivant dans l'écran Assistant, dont les mouvements soutiennent la conversation sans attirer inutilement l'attention.

**Exigences Chef couvertes:** asset transparent en calques, personnage incarné et six états locaux accessibles, réduits si nécessaire.

**FRs Chef couverts:** Chef-FR-1, Chef-NFR-2.

**Garde-fous:** l'asset de production remplace les storyboards aplatis ; l'animation est interrompable, jamais nécessaire à la compréhension et respecte mouvement réduit.

### Story 5.1: Intégrer l'asset de production du Chef

En tant que personne qui ouvre l'Assistant,
je veux reconnaître immédiatement le même Chef C&C dans les tailles et contextes utiles,
afin de construire une relation visuelle cohérente sans gêner la cuisine.

**Critères d'acceptation:**

**Étant donné** que l'asset de production du Chef est disponible,
**quand** il est rendu dans le foyer Assistant ou un contexte compact,
**alors** il conserve visage doré, enveloppe vert profond, toque crème, tablier ivoire et cuillère,
**et** aucune partie du personnage, notamment tablier et pieds, n'est recadrée.

**Étant donné** que l'asset est utilisé par l'interface,
**quand** la taille, la densité ou le viewport varient,
**alors** il conserve ses proportions, ses zones de débordement et sa lisibilité,
**et** l'interface fournit une pose statique fiable si l'asset animé ne peut pas être chargé.

**Étant donné** que le Chef est présent sur l'accueil Assistant,
**quand** aucun échange n'est actif,
**alors** il peut habiter le foyer visuel sans masquer le Compositeur, les starters ou l'accès au Cahier,
**et** aucune version réduite en pictogramme ne remplace son identité incarnée.

**Étant donné** que le Chef est rendu avec les préférences d'accessibilité actives,
**quand** le mouvement réduit est demandé,
**alors** l'asset reste lisible dans une pose fixe,
**et** l'état fonctionnel reste communiqué par le texte et l'interface.

### Story 5.2: Rendre les six états du Chef localement

En tant que personne qui échange avec le Chef,
je veux que sa présence reflète sobrement ce qui se passe,
afin de sentir qu'il m'accompagne sans être distrait par une animation permanente.

**Critères d'acceptation:**

**Étant donné** que le Chef est visible et que l'interface entre dans un état fonctionnel,
**quand** cet état change,
**alors** le client peut rendre localement les états Repos, Écoute, Réflexion, Proposition, Réussite et Question,
**et** le texte et l'interface restent la source principale de compréhension.

**Étant donné** que le Chef est au repos,
**quand** il reste visible sans sollicitation,
**alors** son cycle irrégulier dure entre 9 et 14 secondes avec 80 à 90 % d'immobilité,
**et** il ne fait qu'un clignement rare ou une respiration de 1 % au plus, jamais les deux ensemble.

**Étant donné** qu'un message ou une photo vient d'être envoyé, qu'une analyse réelle est courte, qu'une réponse actionnable arrive, qu'une action a été confirmée ou qu'une précision est indispensable,
**quand** le cycle d'échange le justifie,
**alors** le client déclenche respectivement Écoute, Réflexion, Proposition, Réussite ou Question,
**et** Écoute ne démarre jamais pendant la saisie, Réflexion ne sert jamais d'attente réseau indéfinie, Réussite ne survient qu'après confirmation et Question n'apparaît que pour une demande réellement nécessaire.

**Étant donné** que le mouvement réduit est demandé,
**quand** l'un des six états est rendu,
**alors** le Chef présente une pose finale fixe avec ses signes illustratifs utiles,
**et** aucun mouvement continu n'est nécessaire pour comprendre l'état.

### Story 5.3: Lier les états du Chef au cycle de conversation

En tant que personne qui discute avec le Chef,
je veux que ses réactions correspondent aux moments réels de l'échange,
afin que sa présence soutienne la conversation sans simuler une compréhension qu'il n'a pas.

**Critères d'acceptation:**

**Étant donné** qu'un texte, une photo ou une dictée vient d'être envoyé,
**quand** le client engage le cycle de réponse,
**alors** il déclenche Écoute après l'envoi, puis revient à Repos ou passe à Réflexion uniquement lorsqu'un traitement réel commence,
**et** Écoute ne se déclenche jamais pendant la saisie.

**Étant donné** qu'une réponse utilisable est affichée,
**quand** elle devient actionnable,
**alors** le client déclenche Proposition puis revient au repos,
**et** l'animation ne bloque ni la lecture ni l'action.

**Étant donné** qu'une action soumise à confirmation est effectivement confirmée,
**quand** la confirmation est reçue localement,
**alors** le client déclenche une unique Réussite,
**et** une réponse textuelle seule ne constitue jamais une réussite.

**Étant donné** qu'il manque une information indispensable,
**quand** le Chef doit demander une précision ou une photo,
**alors** le client rend l'état Question avec une demande claire,
**et** il revient à Repos dès que la question est résolue ou abandonnée.

**Étant donné** qu'une erreur, une perte réseau ou une interruption survient,
**quand** la conversation ne peut pas continuer normalement,
**alors** le Chef ne feint ni réflexion ni succès,
**et** l'interface explique la situation tandis que le Chef revient à une présence neutre.

### Epic 6: Cuisiner avec le Chef à ses côtés

L'utilisateur peut appeler le Chef depuis une fiche ou une séance de cuisine, demander une aide contextualisée et poursuivre sa recette sans perdre l'étape en cours.

**Exigences Chef couvertes:** invocation contextuelle, panneau conversationnel, fil de séance, carrousel préservé, bande ingrédients remontée, redimensionnement, déplacement accessible, fermeture pour la séance et actions confirmées.

**FRs Chef couverts:** Chef-FR-1, Chef-FR-3, Chef-FR-5, Chef-FR-6, Chef-NFR-2, Chef-NFR-3.

**Garde-fous:** règles propres de focus, fermeture et annulation pour plein écran et panneau ; le contexte hôte reste prioritaire.

### Story 6.1: Appeler le Chef depuis une fiche recette

En tant que personne qui consulte une recette,
je veux pouvoir appeler le Chef sans quitter ma lecture,
afin d'obtenir une aide ciblée tout en gardant la recette à portée de main.

**Critères d'acceptation:**

**Étant donné** qu'une fiche recette est affichée,
**quand** je parcours son contenu,
**alors** elle affiche un point d'appel flottant et accessible du Chef sans masquer ses actions propres,
**et** son activation ouvre le composant de conversation commun dans un panneau venant du bas.

**Étant donné** que le panneau conversationnel est ouvert depuis une fiche,
**quand** le fil est affiché,
**alors** mes messages et ceux du Chef sont clairement différenciés,
**et** je peux le réduire puis le rouvrir sans modifier ni perdre la recette sous-jacente.

**Étant donné** que le Chef répond dans ce contexte,
**quand** il utilise la recette affichée,
**alors** il reçoit uniquement son contexte minimal à travers le protocole client-médié,
**et** aucune donnée utilisateur n'est transférée ou persistée côté BFF.

**Étant donné** qu'une réponse propose une recette, une variante ou une modification de la recette courante,
**quand** elle est affichée dans le fil,
**alors** sa carte reste interactive sans rompre la conversation ni remplacer la fiche sous-jacente,
**et** toute modification de recette ouvre une prévisualisation explicite suivie d'une confirmation avant toute écriture dans le Cahier.

**Étant donné** que le panneau est utilisé sur mobile avec clavier, lecteur d'écran ou mouvement réduit,
**quand** son état change,
**alors** il respecte safe areas, focus, annonce accessible et préférence de mouvement,
**et** le contenu de la recette reste récupérable sans piège de navigation.

### Story 6.2: Garder le Chef disponible pendant la cuisine

En tant que personne en séance de cuisine,
je veux appeler le Chef sans perdre l'étape ni gêner ma lecture,
afin de pouvoir être dépanné au moment précis où j'en ai besoin.

**Critères d'acceptation:**

**Étant donné** qu'une séance de cuisine est ouverte,
**quand** l'étape est affichée,
**alors** elle reste au centre de la surface, les commandes précédente et suivante deviennent des flèches discrètes liées à son texte et la bande d'ingrédients remonte sous l'en-tête,
**et** le carrousel d'étapes reste lisible et actionnable.

**Étant donné** que le Chef est disponible pendant une séance,
**quand** la personne lit une étape,
**alors** son point d'appel compact est présent par défaut en bas à droite de la zone textuelle,
**et** il peut être déplacé au doigt ou au clavier vers une position qui ne masque pas la lecture.

**Étant donné** que le Chef est activé pendant une séance,
**quand** le panneau conversationnel s'ouvre,
**alors** il arrive depuis le bas avec la séance, la recette et l'étape courante comme contexte minimal,
**et** il peut être réduit, agrandi et redimensionné sans casser le carrousel, le minuteur, les médias, le clavier ni les safe areas.

**Étant donné** que la séance contient un minuteur ou un média d'étape,
**quand** le Chef est affiché ou déplacé,
**alors** le minuteur et les médias gardent leur zone d'illustration prioritaire,
**et** le fil de conversation reste scrollable indépendamment.

**Étant donné** que la personne ferme explicitement le Chef pour cette séance,
**quand** elle confirme cette fermeture,
**alors** son point d'appel et son panneau disparaissent définitivement jusqu'à la fin de la séance,
**et** cela ne modifie ni la recette ni les conversations précédentes.

### Story 6.3: Donner un fil propre à chaque séance de cuisine

En tant que personne qui cuisine avec le Chef,
je veux que ses échanges soient naturellement rattachés à ma séance,
afin de recevoir une aide contextualisée sans mélanger cette aide avec mes autres conversations.

**Critères d'acceptation:**

**Étant donné** qu'une séance de cuisine est ouverte,
**quand** son premier message réel est envoyé au Chef,
**alors** une conversation locale de cuisine distincte est ouverte,
**et** ouvrir puis fermer le panneau sans envoyer ne crée aucune conversation.

**Étant donné** que cette conversation existe,
**quand** elle est enregistrée localement,
**alors** elle est liée à la recette et à la séance,
**et** elle ne devient jamais la reprise automatique de la dernière conversation de l'accueil Assistant.

**Étant donné** qu'une demande est adressée au Chef pendant la séance,
**quand** son contexte est préparé,
**alors** il peut inclure la recette, l'étape visible et les seuls éléments explicitement nécessaires,
**et** il n'inclut ni inventaire implicite ni donnée personnelle non requise.

**Étant donné** que la personne change d'étape,
**quand** elle reprend le Chef plus tard,
**alors** le fil conserve la conversation et le Chef peut s'appuyer sur l'étape courante de la nouvelle demande,
**et** il n'interrompt ni ne commente spontanément la navigation.

**Étant donné** que la personne quitte, interrompt ou termine une séance,
**quand** un fil de cuisine existe,
**alors** il est préservé localement,
**et** aucun message automatique ni notification n'est émis.

### Story 6.4: Dépanner et adapter dans le contexte de cuisine

En tant que personne bloquée ou hésitante pendant une recette,
je veux obtenir une aide directement applicable à l'étape en cours,
afin de pouvoir poursuivre sans perdre le fil de ma cuisine.

**Critères d'acceptation:**

**Étant donné** qu'une recette ou une séance de cuisine fournit son contexte minimal,
**quand** je demande une variante, un remplacement d'ingrédient, un ajustement de portions, une correction ou une aide de rattrapage,
**alors** le Chef formule une action adaptée à la recette, à l'étape et aux portions visibles,
**et** il ne masque ni ne remplace l'étape source.

**Étant donné** qu'une adaptation fiable dépend d'une donnée inconnue, comme la consistance d'une sauce ou les ingrédients disponibles,
**quand** le Chef ne peut pas l'inférer avec confiance,
**alors** il demande une précision courte ou une photo,
**et** il ne prétend pas connaître un ingrédient ou un stock non fourni.

**Étant donné** que le Chef propose une adaptation temporaire ou une modification durable,
**quand** la personne choisit de l'appliquer,
**alors** une action de séance réversible peut être appliquée immédiatement avec un retour clair,
**et** toute écriture durable dans la recette ouvre une prévisualisation puis exige une confirmation explicite.

**Étant donné** que l'aide contextuelle ne peut pas être obtenue à distance,
**quand** le BFF ou l'analyse est indisponible,
**alors** l'entrée et le contexte de séance restent préservés,
**et** l'interface explique la limite sans confondre indisponibilité et absence de solution.

### Epic 7: Personnaliser le Chef avec maîtrise

L'utilisateur peut laisser le Chef apprendre ses préférences localement, les voir, les corriger et les transférer avec son Cahier.

**Exigences Chef couvertes:** profil, apprentissages confiancés, outils client-médiés, mutations typées, export/import et gestion des préférences.

**FRs Chef couverts:** Chef-FR-4, Chef-FR-5, Chef-FR-6, Chef-NFR-1, Chef-NFR-3.

**Garde-fous:** payloads fermés/refusables par le client ; explicite mémorisable silencieusement, déduction faible et réversible ; aucune donnée utilisateur persistée au BFF.

### Story 7.1: Faire apprendre le Chef localement et avec nuance

En tant que personne qui échange avec le Chef,
je veux qu'il adapte progressivement ses conseils à mes goûts et contraintes,
afin que ses propositions deviennent plus pertinentes sans me réduire à mes habitudes.

**Critères d'acceptation:**

**Étant donné** que le Chef enregistre ou consulte un profil,
**quand** une préférence, une habitude ou une composition de foyer est concernée,
**alors** la donnée vit uniquement sur l'appareil,
**et** le BFF ne conserve aucune donnée personnelle de ce type.

**Étant donné** qu'une préférence explicite et durable est formulée, comme « à l'avenir, choisis pour moi plutôt que me laisser huile ou beurre »,
**quand** elle est reconnue comme mémorisable,
**alors** le Chef peut la retenir silencieusement et l'appliquer dans les échanges suivants,
**et** elle reste modifiable ou supprimable localement.

**Étant donné** qu'une préférence est déduite d'un comportement,
**quand** le Chef l'enregistre,
**alors** elle reste locale avec une confiance faible au départ,
**et** elle ne contraint jamais une demande précise du moment.

**Étant donné** que la demande présente une intention claire ou, au contraire, reste vague ou incertaine,
**quand** le Chef prépare sa réponse,
**alors** il privilégie l'intention actuelle dans le premier cas et peut s'appuyer davantage sur le profil dans le second,
**et** un profil pauvre favorise la découverte plutôt que des présupposés génériques.

**Étant donné** que le profil contient des habitudes,
**quand** la personne demande à explorer ou à tester quelque chose de nouveau,
**alors** les habitudes ne l'en empêchent jamais,
**et** chaque donnée retenue porte son origine, son niveau de confiance et sa date de dernière confirmation afin de pouvoir être relue, corrigée ou supprimée ultérieurement.

**Étant donné** que le Chef exploite les catégories de profil disponibles,
**quand** il utilise un contexte de séance ou un garde-manger probable,
**alors** le contexte de séance reste limité à l'échange en cours et n'est pas promu en préférence durable sans règle d'apprentissage applicable,
**et** le garde-manger probable est présenté comme une hypothèse à vérifier, jamais comme un stock certain.

### Story 7.2: Rendre les préférences du Chef visibles et maîtrisables

En tant que personne qui utilise le Chef,
je veux consulter et corriger ce qu'il retient de moi,
afin de garder le contrôle sur les conseils qu'il personnalise.

**Critères d'acceptation:**

**Étant donné** que la personne ouvre l'écran Assistant,
**quand** elle souhaite gérer ce que le Chef retient,
**alors** elle accède à une zone « Mémoire et préférences » distincte du fil de conversation,
**et** chaque élément est présenté avec sa préférence, sa source explicite ou déduite, son niveau de confiance et sa dernière confirmation.

**Étant donné** qu'un élément de mémoire est affiché,
**quand** la personne le modifie ou le supprime,
**alors** le changement prend effet immédiatement dans les conseils suivants,
**et** aucune copie persistante de cet élément n'existe côté BFF.

**Étant donné** que la personne souhaite limiter l'apprentissage,
**quand** elle désactive les apprentissages déduits,
**alors** les préférences explicitement choisies restent disponibles,
**et** elle peut effacer l'ensemble du profil après une confirmation claire.

**Étant donné** qu'un conseil s'appuie sensiblement sur une préférence,
**quand** le Chef le formule,
**alors** il peut le faire comprendre avec discrétion,
**et** il n'expose ni raisonnement intime ni détail inutile de son profil.

**Étant donné** qu'aucun profil n'existe, qu'il est vide ou que les apprentissages sont désactivés,
**quand** une personne utilise le Chef,
**alors** celui-ci reste pleinement fonctionnel,
**et** l'interface n'invente aucune préférence à sa place.

### Story 7.3: Outiller le Chef sans lui abandonner les données

En tant que personne qui demande une aide contextualisée au Chef,
je veux qu'il puisse consulter ou proposer une action dans mon Cahier sans accéder librement à mes données,
afin de bénéficier d'un vrai assistant tout en gardant mes données sur mon appareil.

**Critères d'acceptation:**

**Étant donné** que le Chef a besoin d'agir ou de consulter un contexte,
**quand** il formule une demande d'outil,
**alors** celle-ci est typée et limitée, notamment pour rechercher dans le Cahier, demander le contexte minimal d'une recette ou proposer une écriture de préférence,
**et** elle est traitée par le protocole client-médié.

**Étant donné** qu'une demande d'outil est reçue,
**quand** le BFF la transmet au client,
**alors** le client valide son type, prépare le minimum nécessaire ou exécute localement l'action autorisée,
**et** le BFF ne lit ni n'écrit directement les données locales.

**Étant donné** qu'une demande est hors contrat, invalide, trop large ou refusée par le client,
**quand** elle est évaluée,
**alors** elle est rejetée sans fuite de donnée,
**et** le Chef reçoit un résultat exploitable mais non sensible.

**Étant donné** qu'une recherche dans le Cahier est autorisée,
**quand** son résultat revient au Chef,
**alors** elle ne contient que les résultats nécessaires à la réponse,
**et** elle ne retourne jamais l'intégralité du contenu local.

**Étant donné** qu'une action proposée modifie une recette, une préférence ou un plan,
**quand** elle arrive dans l'interface,
**alors** elle est prévisualisée puis confirmée avant l'écriture locale,
**et** son annulation ne produit aucun effet.

**Étant donné** que l'appareil est hors ligne ou qu'un outil est indisponible,
**quand** le Chef ne peut pas obtenir le contexte attendu,
**alors** il explique simplement la limite,
**et** il peut continuer à aider sans simuler l'accès aux données.

### Story 7.4: Emporter le profil du Chef avec le Cahier

En tant que personne qui change d'appareil ou restaure son Cahier,
je veux pouvoir retrouver les données utiles du Chef,
afin de ne pas devoir reconstruire mes préférences à zéro.

**Critères d'acceptation:**

**Étant donné** que la personne exporte son Cahier,
**quand** l'archive est produite,
**alors** elle inclut une section versionnée du profil du Chef avec préférences explicites, inférences confiancées et métadonnées nécessaires,
**et** les conversations n'en font pas partie à ce stade, ce qui est clairement indiqué.

**Étant donné** qu'une archive contient un profil du Chef,
**quand** la personne l'importe,
**alors** l'application valide version et structure avant toute écriture locale,
**et** elle présente un aperçu des effets sur le profil avant de demander une confirmation explicite.

**Étant donné** que la personne annule l'import de profil,
**quand** l'annulation est confirmée,
**alors** ni le Cahier ni le profil existant ne sont modifiés,
**et** aucune écriture partielle n'est conservée.

**Étant donné** qu'une archive ancienne ne contient pas de profil du Chef,
**quand** elle est importée,
**alors** le Cahier reste importable normalement,
**et** l'absence de profil est traitée comme une compatibilité attendue.

**Étant donné** que le profil de l'archive est incompatible ou corrompu,
**quand** l'import est évalué,
**alors** le Cahier local existant est protégé,
**et** l'interface explique le problème sans importer partiellement le profil.

### Epic 8: Choisir les rendez-vous culinaires du Chef

L'utilisateur peut activer et arrêter des rituels culinaires facultatifs sans relance spontanée par défaut.

**Exigences Chef couvertes:** rituel local opt-in, notification locale/best effort et demande ponctuelle stateless au BFF.

**FRs Chef couverts:** Chef-FR-7, Chef-NFR-1.

### Story 8.1: Choisir les rituels culinaires du Chef

En tant que personne qui souhaite être inspirée à certains moments,
je veux activer et configurer les propositions proactives du Chef,
afin de recevoir des idées utiles sans être sollicitée par défaut.

**Critères d'acceptation:**

**Étant donné** qu'une personne n'a encore configuré aucun rendez-vous,
**quand** elle utilise le Chef,
**alors** aucun rituel ni aucune notification n'est actif par défaut,
**et** le Chef n'émet aucune sollicitation spontanée.

**Étant donné** que la personne ouvre l'écran Assistant,
**quand** elle choisit d'activer un rituel,
**alors** elle peut en configurer un objectif explicite, comme être inspirée de temps en temps, préparer les repas de la semaine ou anticiper une liste de courses,
**et** chaque rituel affiche son objectif, son rythme indicatif, les informations locales qu'il peut utiliser et son caractère désactivable.

**Étant donné** qu'un rituel est actif,
**quand** la personne le modifie, le suspend ou le supprime,
**alors** son choix prend effet localement,
**et** toute notification future associée cesse sans attendre une confirmation du BFF.

**Étant donné** qu'un rituel prépare une proposition,
**quand** il utilise l'intention exprimée ou le profil local,
**alors** il ne le fait que lorsque cela aide,
**et** il ne réduit jamais les suggestions aux recettes habituelles puisqu'il peut ouvrir une piste nouvelle.

**Étant donné** que la permission de notification est absente ou refusée,
**quand** un rituel est configuré,
**alors** il reste gérable dans l'application,
**et** l'interface n'affirme jamais qu'une alerte sera livrée.

### Story 8.2: Délivrer une proposition proactive sans promettre l'impossible

En tant que personne ayant activé un rituel,
je veux recevoir une proposition du Chef au bon moment quand mon appareil le permet,
afin de pouvoir anticiper sans subir une mécanique opaque ou intrusive.

**Critères d'acceptation:**

**Étant donné** qu'un rituel actif arrive à son échéance,
**quand** l'application locale ou son worker peut le traiter,
**alors** il tente de préparer une proposition et peut solliciter le BFF avec le seul contexte minimal autorisé,
**et** le BFF traite cette demande ponctuelle sans stocker le profil ni le résultat destiné à la personne.

**Étant donné** qu'une notification peut être délivrée,
**quand** une proposition pertinente est prête,
**alors** elle est locale, concise, liée au rituel choisi et ouvre une conversation ou une surface pertinente dans l'application,
**et** elle ne se déclenche que si le rituel est toujours actif et la proposition encore pertinente.

**Étant donné** que l'application est arrêtée, hors ligne, que le worker est suspendu ou que le système refuse la livraison,
**quand** l'échéance ne peut pas produire de notification,
**alors** aucune fausse garantie n'est donnée,
**et** la personne peut retrouver ou relancer son rituel dans l'application.

**Étant donné** qu'une proposition proactive est affichée,
**quand** elle suggère de choisir, planifier, sauvegarder ou modifier quelque chose,
**alors** elle reste une suggestion,
**et** toute action durable requiert un geste explicite de la personne.

## Epic 9: Comprendre l’intention de chaque tour Chef

L’utilisateur peut exprimer une envie, une recherche, une création, une variante, une adaptation ou un problème culinaire sans connaître le bon écran ; le Chef route chaque tour vers un parcours unique, contextualisé et actionnable.

**Exigences Chef couvertes:** intention explicite à chaque tour, clarification seulement si indispensable, sorties typées, continuité sur la recette mentionnée ou la dernière vignette.

**Garde-fous:** l’intention explicite prime sur la mémoire et les habitudes ; une clarification unique n’est permise que si une donnée indispensable manque ; aucune écriture n’est implicite ; le BFF ne persiste ni fil ni profil.

### Story 9.1: Classer chaque tour Chef dans un contrat fermé

En tant que personne qui échange avec le Chef,
je veux que chaque message soit interprété selon une intention explicite, ses contraintes et son contexte utile,
afin de poursuivre mon objectif sans recommencer ni répondre à des questions redondantes.

**Critères d'acceptation:**

**Étant donné** qu’un message est envoyé au Chef,
**quand** son tour est préparé,
**alors** il est classé dans une intention fermée avec un niveau de confiance, des contraintes, une éventuelle recette de référence et l’unique information indispensable manquante,
**et** ce contrat est disponible à l’orchestrateur client avant de choisir la réponse.

**Étant donné** qu’une clarification précédente ou une recette est présente dans le fil,
**quand** la personne répond brièvement, par exemple « au Cookeo et sans crème »,
**alors** le Chef rattache la réponse à la clarification ouverte,
**ou**, à défaut, à la recette explicitement mentionnée puis à la dernière vignette pertinente,
**et** il ne redemande pas une information déjà fournie.

**Étant donné** qu’un tour est ambigu sans donnée indispensable,
**quand** plusieurs interprétations restent possibles,
**alors** le Chef pose une seule question courte et ciblée,
**et** il ne confond pas cette clarification avec une nouvelle intention.

### Story 9.2: Trouver une idée, retrouver au Cahier ou créer sur mesure

En tant que personne qui formule une envie culinaire,
je veux recevoir une sortie adaptée à mon intention,
afin de trouver une piste, une recette existante ou une nouvelle recette sans navigation imposée.

**Critères d'acceptation:**

**Étant donné** que la personne demande une idée,
**quand** le Chef répond,
**alors** il propose une à trois pistes temporaires adaptées aux contraintes connues,
**et** chacune peut devenir une recette uniquement par une action explicite.

**Étant donné** que la personne cherche une recette de son Cahier,
**quand** une correspondance locale existe,
**alors** le Chef présente la recette ou les correspondances pertinentes,
**et** il ne crée pas une nouvelle recette à la place.

**Étant donné** que la personne demande une recette sur mesure,
**quand** les informations indispensables sont connues,
**alors** le Chef produit une prévisualisation éditable,
**et** aucune recette n’est écrite avant confirmation explicite.

### Story 9.3: Adapter ou décliner une recette de référence

En tant que personne qui veut modifier une recette,
je veux que le Chef distingue une adaptation ponctuelle d’une variante durable,
afin d’obtenir immédiatement l’aide pertinente sans modifier la recette d’origine.

**Critères d'acceptation:**

**Étant donné** qu’une recette de référence et des contraintes sont identifiées,
**quand** la personne demande une adaptation, par exemple une cuisson Cookeo sans crème,
**alors** le Chef fournit un conseil temporaire appliqué à cette recette,
**et** il propose explicitement « Créer une variante » si la personne souhaite la conserver.

**Étant donné** que la personne demande une variante,
**quand** la recette de référence est disponible,
**alors** le Chef génère une prévisualisation distincte dérivée de l’original,
**et** cette prévisualisation reste sans effet persistant avant sauvegarde explicite.

### Story 9.4: Clarifier seulement quand nécessaire et préserver la reprise

En tant que personne qui affine sa demande,
je veux pouvoir reprendre exactement le même objectif après une clarification, une erreur ou une annulation,
afin de ne pas perdre mon temps ni ma saisie.

**Critères d'acceptation:**

**Étant donné** qu’une donnée réellement indispensable manque,
**quand** le Chef ne peut pas poursuivre de façon fiable,
**alors** il pose une seule question ciblée ou demande une photo seulement si elle est pertinente,
**et** il conserve le contexte nécessaire à la réponse suivante.

**Étant donné** qu’une requête échoue ou est annulée,
**quand** la personne revient au compositeur,
**alors** sa saisie est conservée,
**et** elle peut reprendre ou reformuler sans perdre le fil ni déclencher une écriture implicite.

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
