# ADR 0004 — Runtime Chef modulaire local

## Statut

Décidé — 2026-10-13

## Contexte

Les stories 9.1 à 9.4 ont livré un tour Chef local sûr : classification temporaire, annulation, redaction, clarification et reprise. Leur runtime V1 reste cependant structuré autour de deux manifests TypeScript, d'un prompt central et d'une intégration de tools dans l'écran principal. Ajouter les capacités prévues pour les contextes Chef, la mémoire et les préférences dans cette forme ferait diverger les prompts, politiques et contrats.

Les invariants ne changent pas : IndexedDB est la source de vérité des recettes, fils et données Chef ; le BFF ne persiste aucune donnée utilisateur ; les extraits réseau sont temporaires et redacted ; une écriture durable reste prévisualisée puis explicitement confirmée. Cette décision ne rouvre ni ne modifie les stories 9.1 à 9.4.

## Décision

### 1. Un catalogue embarqué est la seule source des capacités Chef

Ajouter un package versionné `packages/chef-catalog/`, sans téléchargement de skills au runtime. Il contient `SKILL.md` avec frontmatter pour l'identité, les dépendances, le résumé et les instructions d'un skill ; `TOOL.md` pour l'intention, les conditions d'usage, la classification des données, les allow-lists de champs, les clés de limites et la politique d'effet de chaque tool ; et un schéma JSON Schema Draft 2020-12 d'entrée et de résultat pour chaque tool. Chaque tool nomme son exécuteur local ou son adaptateur BFF, ses projections d'entrée/résultat et exactement un effet parmi `none`, `local_read`, `bff_read`, `session_reversible`, `explicit_preference`, `inferred_preference_low_confidence` ou `preview_then_confirm` : il n'existe aucun accès générique au réseau ou à IndexedDB. Les allow-lists sont toujours intersectées avec une deny-list compilée non contournable : IDs locaux, `File`, `Blob`, URL `blob:`, binaires/images source, profil/préférences/mémoire bruts, Cahier/fil complets, prompt système et raisonnement.

Un compilateur déterministe valide le catalogue (unicité, références, dépendances, cycles, schémas, politiques et fraîcheur des artefacts) et produit un manifeste immuable, identifié par `catalogRevision`. PWA et BFF importent ce manifeste compilé ; ni l'un ni l'autre ne duplique les instructions ou la liste de tools. `packages/domain` possède le wire fermé `ChefAgentTurnWireV2` et ses validateurs partagés `.ts`/`.js`.

### 2. La PWA orchestre le tour et reste le garde d'accès

Le `ChefTurnRuntime` démarre avec `chef-core`. Le modèle ne voit qu'un résumé des skills disponibles et peut demander `activate_skill`; la PWA vérifie cette demande contre le catalogue, résout les dépendances et enrichit le registre actif avec les seules instructions et tools permis. Chaque activation est tracée avec une provenance fermée : `bootstrap` ou `function_call`.

Le manifeste impose un `ChefAgentTurnWireV2` fermé : révision, nonce éphémère non persistant, étape monotone, skills actifs et projection. Chaque décision/résultat doit correspondre au nonce et à l'étape encore actifs ; cela rend les annulations et réponses tardives vérifiables.

Le `ContextResolver` est local. Il garde objectif actif/suspendu, clarification, ancrage explicitement cité ou visible et état de recherche. Une ambiguïté suspend ou demande une précision : elle n'efface pas l'objectif précédent. Il est l'unique propriétaire de la projection LLM ; un exécuteur lit seulement par le service déclaré par son tool et ne retourne que sa projection compilée. La projection réseau est bornée par `ChefRuntimeLimitsV1`, et ne laisse sortir ni IDs Dexie, ni `File`, ni blob, ni profil, ni Cahier complet, ni fil complet par défaut.

La recherche conversationnelle est locale. `search-current-thread` et `get-thread-excerpt` ne lisent que le fil actif et ne renvoient qu'un extrait redacted borné. Explorer un fil clos requiert un signal utilisateur explicite vers le passé et un tool dont la portée le permet ; aucun scan de l'historique clos n'est implicite.

### 3. Le BFF fait du function calling stateless, pas de l'exécution libre

Le navigateur transmet une projection validée, la révision, le nonce/étape et les IDs de skills actifs — jamais du Markdown, un prompt, un schéma, un exécuteur ou un résultat brut. Le BFF accepte seulement une révision qu'il embarque, reconstruit les instructions et définitions de functions depuis son manifeste, valide les IDs, appelle le modèle, puis renvoie une finale ou un appel déclaré. Une révision inconnue retourne le refus typé `catalog_mismatch` : la PWA arrête la boucle sans exécuter de tool et reprend le fallback 9.2.

La PWA revalide chaque appel avant de l'exécuter : appartenance au registre, schéma, portée, budget, redaction, annulation et politique d'effet. Aucun tool ne reçoit une URL ou une capacité `fetch` arbitraire : seul `BffToolAdapter` résout un adaptateur statique déclaré dans le catalogue ; le modèle ne choisit jamais une route HTTP. Les résultats retournés pour poursuivre la boucle sont validés, redacted et bornés. Une préférence explicitement exprimée ne peut être retenue que par le service local de profil avec accusé visible, conformément à AD-4 ; une inférence ne peut passer que sous `inferred_preference_low_confidence`, avec provenance et confiance, dans ce même service local. Recette, plan et quantité restent une preview puis une confirmation. Toute recette durable passe ensuite exclusivement par `RecipeService`, conformément à l'AD-12 parent.

Un appel inconnu, un schéma invalide, un dépassement de budget, un refus local, un résultat non redacted, une annulation, une réponse tardive ou l'absence de progrès arrête le tour sans écriture. Hors annulation, l'échec agentique reprend le comportement de classification 9.2 existant.

### 4. L'évaluation sépare garanties et qualité linguistique

Les scénarios utilisent uniquement des fixtures synthétiques locales. Une trace redacted et bornée conserve la révision de catalogue, les skills activés, les appels/refus, les résultats réduits, les transitions, la sortie visible redacted et le motif d'arrêt.

Les tests déterministes bloquants couvrent compilation, schémas, registre, redaction, limites, confirmation, annulation, réponse tardive, non-écriture, `catalog_mismatch` et absence de recherche silencieuse dans les fils clos. Playwright couvre les parcours visibles. Un juge LLM optionnel, isolé et configuré séparément peut évaluer la pertinence, la continuité et l'honnêteté avec une grille versionnée, mais ne remplace jamais une assertion déterministe ni une revue humaine.

## Conséquences

1. L'ajout d'un skill ou d'un tool n'exige plus de branche spécifique dans `App.vue` : il passe par le catalogue, son adaptateur et le registre actif.
2. La PWA et le BFF ont un contrat de révision explicite ; un décalage de déploiement échoue de façon sûre et retombe sur le flux existant au lieu d'exécuter une capacité inconnue.
3. Le compilateur et les tests de catalogue deviennent des prérequis de la story 9.5. Les seuils précis de `ChefRuntimeLimitsV1` seront fixés dans sa SPEC, puis appliqués des deux côtés.
4. Aucun RAG, aucune mémoire métier et aucune nouvelle surface visible ne découlent de cette ADR. Une recherche sémantique ne sera examinée qu'avec des preuves que l'index/extrait local déclaré ne suffit pas.
5. `docs/SPEC.md`, `docs/DOMAIN.md`, `docs/ARCH.md`, le backlog et le tracker ne changent qu'après la SPEC 9.5 et les autorisations prévues ; cette ADR et la spine ne constituent pas une implémentation ni une modification de sprint.

## Références

- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-10-13-chef-runtime-modulaire.md`
- `_bmad-output/planning-artifacts/architecture/architecture-cooks-n-coqs-2026-10-04/ARCHITECTURE-SPINE.md`
- `docs/SPEC.md`, `docs/DOMAIN.md`, `docs/ARCH.md`
