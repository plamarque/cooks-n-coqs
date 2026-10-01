---
title: "Évolution PRD — Mode Assistant repas"
status: final
created: "2026-10-01"
updated: "2026-10-01"
source_of_truth_to_update: "docs/SPEC.md"
---

# Mode Assistant repas

## 0. Objet du document

Ce PRD brouillon sert à faire valider le comportement produit avant la mise à jour des sources normatives et avant toute implémentation. Il consolide la maquette interactive validée, ses tests et les règles v1 existantes ; il ne remplace pas encore `docs/SPEC.md`.

## Décision à valider

Faire de l'accueil de Cookies & Coquillettes une entrée **assistant-first** : l'utilisateur part de ce qu'il a, de ce qu'il veut manger ou d'une recette déjà rencontrée. Un unique compositeur reçoit un texte, une URL, une image ou une voix transcrite, puis conduit sans détour vers l'import, une recette pertinente du cahier, ou une proposition de recette à sauvegarder explicitement.

Ce document est une proposition d'évolution de `docs/SPEC.md`. Il n'autorise pas encore de changement de l'application, du BFF, des contrats de domaine, ni des documents normatifs.

## Contexte et problème

Le produit sait déjà centraliser, importer, consulter et modifier des recettes, mais son accueil demande aujourd'hui de choisir d'abord une opération. Le besoin validé par la maquette est de commencer par une intention naturelle : « qu'est-ce qu'on mange aujourd'hui ? », des ingrédients disponibles, un lien, une photo ou une recette dictée.

L'assistant doit rester un accélérateur du cahier local, pas une conversation opaque ni un nouvel espace de données. Les recettes existantes restent consultables et éditables selon les règles v1.

## Objectifs produit

1. Donner un point de départ unique et chaleureux pour importer, retrouver ou imaginer un repas.
2. Retrouver d'abord une recette suffisamment proche du cahier avant de proposer une création.
3. Respecter l'intention import : une URL, une image ou une recette structurée ne doivent pas être traitées comme une vague demande de repas.
4. Rendre l'avancement perceptible, annulable et rassurant sans afficher de raisonnement interne ni de score technique.
5. Préserver le contrôle utilisateur : une proposition sur mesure n'entre dans le cahier qu'après une sauvegarde explicite.

## Hors périmètre de cette évolution

- Conversation persistante, historique de chat ou profil de préférences implicites.
- Enregistrement ou envoi d'audio brut ; la voix sert uniquement à alimenter le texte du compositeur après consentement et transcription.
- Nouvelle synchronisation cloud ou modification du modèle de stockage local des recettes.
- Réécriture des règles v1 d'import, de provenance, de dédoublonnage, d'édition, de portions, de partage ou de mode cuisine.
- Promesse de disponibilité hors ligne pour les opérations qui nécessitent une analyse distante ; la consultation et l'édition locales conservent leurs garanties existantes.

## Utilisateur et parcours de référence

Camille ouvre l'application en fin de journée. Elle peut exprimer « il me reste des courgettes et j'ai envie de quelque chose de rapide », coller une URL, ajouter une photo, ou dicter puis corriger son texte. L'application l'informe brièvement de l'étape en cours. Elle ouvre une carte de recette proposée, consulte son détail, et choisit soit de revenir à l'accueil soit de sauvegarder la recette si elle est nouvelle.

### UJ-1 — Camille trouve une recette déjà dans son cahier

Camille décrit ce qu'elle a et le repas souhaité dans le Compositeur. L'Assistant repas recherche le Cahier, expose une Carte de résultat avec une raison courte, puis Camille ouvre le Détail de cette recette sans créer ni modifier de donnée.

### UJ-2 — Camille importe une recette qu'elle apporte

Camille colle une URL, un texte de recette, un partage F2 ou une image dans le Compositeur. Le Routage l'oriente vers l'import approprié, présente des étapes publiques d'avancement, puis ouvre le Détail de la prévisualisation selon la proposition de réconciliation à valider.

### UJ-3 — Camille accepte une recette sur mesure

Camille formule une envie pour laquelle le Cahier ne propose rien d'utile. L'Assistant repas présente une Carte de résultat ouvrable. Camille consulte le Détail, puis choisit explicitement de Sauvegarder ; la recette devient alors une recette locale normale.

## Glossaire

- **Assistant repas** — Expérience d'accueil qui interprète l'entrée du Compositeur et guide vers un import, le Cahier ou une proposition sur mesure.
- **Cahier** — Ensemble local des recettes persistées de l'utilisateur, consulté avant toute proposition sur mesure.
- **Compositeur** — Surface unique qui reçoit texte, URL, image et transcription vocale modifiable avant l'envoi.
- **Routage** — Sélection explicable de la voie import, recherche dans le Cahier ou proposition sur mesure à partir de l'entrée envoyée.
- **Carte de résultat** — Élément de résultat activable qui ouvre un Détail ; elle ne persiste rien elle-même.
- **Détail** — Vue de consultation d'une recette existante ou de prévisualisation d'une recette non sauvegardée.
- **Sauvegarde** — Action explicite qui persiste une prévisualisation validée dans le Cahier. Elle est distincte du favori.

## Expérience d'accueil

### Accueil assistant-first

- L'accueil met en premier plan la question du repas et le compositeur ; il maintient un accès clair au cahier existant.
- Des starters immédiatement utilisables sous le compositeur aident à formuler une envie, sans empêcher la saisie libre. Ils peuvent refléter le moment de la journée et la saison.
- Les suggestions de contexte sont des aides à l'inspiration, jamais des contraintes de filtrage ni des affirmations sur l'utilisateur.
- Le contexte « moment » est dérivé de l'heure locale courante ; la saison est dérivée de la date locale. Il n'est pas conservé comme donnée personnelle.

### FR-1 — Compositeur unique

Le compositeur permet, dans une même surface :

1. La saisie et l'édition de texte libre.
2. Le collage d'une URL ou d'un texte de recette.
3. L'ajout ou le collage d'une image.
4. La dictée facultative, avec une transcription insérée dans le texte à la position du curseur et modifiable avant envoi.
5. Le retrait d'une image jointe avant envoi.

Le bouton d'envoi reste indisponible seulement pendant un traitement en cours. Un envoi vide, sans image jointe, explique les formats acceptés.

### FR-2 — Routage de l'intention

À l'envoi, l'application identifie la voie métier selon les priorités suivantes :

1. Une image jointe ou collée déclenche un import image. Le texte éventuellement présent est un contexte d'import et non une demande séparée.
2. Une URL HTTP(S) déclenche l'import URL existant.
3. Un texte reconnu comme recette structurée, texte F2 reçu ou contenu de partage déclenche l'import texte/partage selon les règles déjà normatives.
4. Toute demande libre déclenche une recherche approximative dans le cahier, y compris lorsqu'elle formule une envie créative.
5. Si le cahier ne fournit pas de proposition suffisamment pertinente, l'application prépare une proposition sur mesure.

En cas d'ambiguïté entre une recette structurée et une demande libre, le produit privilégie l'import afin de ne pas perdre une recette apportée par l'utilisateur. Une ambiguïté restante doit être présentée en termes compréhensibles avec le choix « Importer cette recette » ou « Chercher une idée » ; elle ne doit pas être résolue silencieusement.

### FR-3 — Recherche dans le cahier et création si nécessaire

- La recherche approximative considère le titre, les ingrédients et la durée connue. Elle peut interpréter une envie, des ingrédients, une durée ou un ton de repas ; elle ne prétend pas à une correspondance exacte. À l'envoi explicite d'une demande d'au plus 1 200 caractères, elle transmet au BFF un snapshot limité du Cahier (trié favoris puis dernière modification, limité à 60 ; titre, libellés d'ingrédients, durée et références éphémères, sans étapes, images, notes, URL source ni identifiants durables), sans opt-in ni interstitiel par recherche. Une demande trop longue échoue sans appel distant. Jev classe les recettes et retient au plus trois candidates dont la pertinence est au moins 0,5 ; GPT-5.6 Luna avec effort `none` ne sert qu'en continuité si Jev est indisponible ou invalide, avec le même seuil. Le score n'est jamais affiché.
- Une réponse issue du cahier identifie clairement la recette existante et donne une raison courte, orientée utilisateur (par exemple ingrédients communs ou repas rapide), sans score ni explication du raisonnement.
- Si une recette est suffisamment proche, l'utilisateur peut l'ouvrir ou ajuster sa demande. La recette existante n'est pas dupliquée ni modifiée.
- Si aucune proposition utile n'est disponible après ce classement et les contraintes littérales vérifiables localement, l'assistant propose une recette sur mesure à prévisualiser. Une indisponibilité des deux fournisseurs est une erreur, pas une absence de recette. La création n'écrit rien dans le cahier avant l'action explicite de sauvegarde.

### FR-4 — Progression et annulation

Pendant une importation, une recherche ou la préparation d'une recette sur mesure, l'interface affiche un statut court, localisé et compréhensible (par exemple « Je reconnais ce lien », « Je regarde dans votre cahier », « Je prépare une recette »).

- Ces messages décrivent une étape utile au résultat, jamais une chaîne de pensée, une instruction interne, un prompt, un score ou une justification détaillée.
- Un utilisateur peut annuler. L'annulation arrête l'affichage du résultat à venir, réactive le compositeur et conserve le texte et l'image déjà fournis.
- Une erreur d'import ou d'analyse s'appuie sur les fallbacks v1 : le contenu utilisateur est préservé et un brouillon éditable reste proposé quand le contrat d'import le permet.

### FR-5 — Cartes de résultat et vue détail

- Tout résultat recette est présenté comme une carte activable au clavier et au toucher.
- Une carte du cahier ouvre le détail de la recette existante.
- Une carte sur mesure ouvre une prévisualisation détaillée : titre, durée si connue, ingrédients/étapes disponibles et action de sauvegarde.
- La fermeture du détail ou de la prévisualisation ramène à l'accueil assistant. Une prévisualisation non sauvegardée est abandonnée et l'accueil est réinitialisé ; une recette du cahier n'est jamais modifiée par cette fermeture.
- Sauvegarder une recette sur mesure applique les validations métier v1, crée une recette locale et confirme clairement la sauvegarde. Elle devient alors une recette ordinaire : détail, édition, favoris, portions, partage et mode cuisine suivent les règles existantes.

### Proposition de réconciliation — import depuis le compositeur

La maquette place la sauvegarde dans le détail, y compris après un import reconnu. Elle contredit donc le contrat v1 « parse → création immédiate → détail ». La décision produit validée est la suivante :

1. Un import lancé depuis le compositeur produit une prévisualisation détaillée, avec provenance et contenu éditable.
2. Une sauvegarde explicite crée la recette dans IndexedDB ; fermer avant cette action abandonne la prévisualisation.
3. « Sauvegarder » ne signifie pas « mettre en favori » : le favori reste une propriété distincte d'une recette déjà persistée.
4. Les imports issus des autres entrées v1 ne changent pas tant qu'une migration explicite de leur parcours n'est pas décidée.

Cette décision modifie les exigences actuelles d'import. Les mises à jour cohérentes de `docs/SPEC.md`, `docs/DOMAIN.md` et `docs/ARCH.md` restent à faire après la finalisation du PRD.

### FR-6 — Accessibilité et mouvement

- Chaque action est exploitable au clavier avec un nom accessible ; les cartes ouvrables ne dépendent pas uniquement du geste tactile.
- La voix conserve une alternative texte complète. Un refus d'autorisation, une indisponibilité navigateur ou une transcription échouée ne bloque jamais la saisie manuelle.
- Les états de progression restent compréhensibles sans animation et respectent la préférence de mouvement réduit.
- L'accueil mobile ne crée pas de défilement horizontal et garde les actions principales atteignables.

### FR-7 — Entrées v1 à préserver

Le compositeur n'élimine pas les parcours v1 nécessaires : création manuelle, import de fichier `.zip` du cahier, édition d'une recette existante et partage système. Ils restent accessibles par une action explicite adaptée ; leur sémantique de transfert n'est pas absorbée par le routage d'une demande de repas.

## Exigences non fonctionnelles

### NFR-1 — Confidentialité et contrôle

- Aucun audio brut n'est stocké par cette évolution ; seul le texte accepté dans le compositeur peut être utilisé par le flux choisi.
- Les recettes et leurs données restent local-first conformément à l'architecture v1.
- La source d'un import reste conservée selon les règles `ImportSource` existantes.

### NFR-2 — Dégradation progressive

- Sans BFF ou lorsque l'analyse distante échoue, les flux d'import conservent le comportement de draft minimal éditable déjà spécifié.
- L'absence de microphone ou de reconnaissance vocale expose une information claire et laisse le compositeur texte utilisable.
- Le rendu de l'accueil et les actions locales essentielles ne dépendent pas de l'animation de progression.

### NFR-3 — Observabilité sans contenu sensible

Les diagnostics techniques nécessaires peuvent indiquer le type de voie suivie (import URL, image, texte, recherche cahier, proposition) et l'issue générale ; ils ne doivent pas enregistrer l'audio, la chaîne de pensée ou le contenu complet de la demande sans une décision de confidentialité distincte.

## Mesures de succès

1. Une personne peut partir d'une envie, d'un lien, d'une image ou d'une dictée sans rechercher d'abord le bon écran.
2. Une recette déjà présente et pertinente est proposée avant une nouvelle recette.
3. Aucun résultat sur mesure n'est ajouté au cahier sans sauvegarde explicite.
4. À chaque traitement, l'utilisateur peut identifier l'étape visible ou annuler sans perdre son contenu.
5. Les interactions principales sont utilisables sur mobile et au clavier.

## Périmètre MVP

### Inclus

- Accueil Assistant repas, Compositeur, Routage, progression publique annulable et Carte de résultat.
- Recherche approximative dans le Cahier suivie, au besoin, d'une proposition sur mesure non persistée.
- Suggestions heure/saison locales et accessibilité décrite par FR-6.

### Reporté

- Mémoire conversationnelle, préférences apprises, historique de demandes et recommandation personnalisée.
- Automatisation sans confirmation de la sauvegarde ou de la modification de recettes existantes.
- Toute utilisation d'audio brut ou synchronisation des entrées assistant.

## Décisions ouvertes avant implémentation

## Alignement avec les sources normatives

- Les importations URL, texte, capture, partage F2, leur provenance et leurs fallbacks restent soumis à `docs/SPEC.md`, `docs/DOMAIN.md` et `docs/ARCH.md`.
- La persistance d'une recette créée par l'assistant utilise les règles v1 : titre et au moins un ingrédient ou une étape, sauvegarde explicite, IndexedDB local et détails post-sauvegarde.
- Cette proposition ne modifie aucun des contrats existants ; après validation, les modifications normatives nécessaires seront apportées de façon cohérente à `docs/SPEC.md`, `docs/DOMAIN.md` et `docs/ARCH.md` avant l'implémentation.

## Sources considérées

- `docs/SPEC.md`, `docs/DOMAIN.md`, `docs/ARCH.md`, `docs/WORKFLOW.md`
- `docs/mockups/meal-assistant-home.html` et son test interactif
- Consolidation locale de maquette : `4058395`, `0ce5190`, `5c258b1`, `c1455b7`, `12cc1ea`, `46cb913`, `4094cbf`, `0ccff19`
