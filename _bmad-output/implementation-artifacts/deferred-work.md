- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-restaurer-generation-apres-absence-de-candidat.md`
  summary: Rendre l’état d’illustration de la prévisualisation explicite avec un halo léger pendant la génération puis un placeholder dédié si elle devient indisponible.
  evidence: La génération d’image est best-effort et non bloquante ; l’état actuel, visuellement blanc, peut être interprété à tort comme une régression de la création de recette.
- source_spec: `_bmad-output/implementation-artifacts/spec-assistant-refuser-candidate-et-preciser-demande.md`
  summary: Aligner les scénarios E2E Assistant hérités sur les wires actuels `candidates` / `noCandidate` et leurs contrats de preview.
  evidence: La suite complète échoue sur 14 scénarios inchangés qui attendent les anciens wires `newRecipe` ou `import`, tandis que le scénario candidat corrigé passe isolément.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-clore-recherche-cahier.md`
  summary: Mettre à jour l'attente du test de benchmark qui exige encore le statut `awaiting-operator` malgré la décision humaine désormais consignée.
  evidence: `npm run test:unit` échoue dans `apps/bff/test/image-benchmark.test.ts` car le document versionné contient la clôture validée, hors périmètre de la correction 2.1.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-demarrer-et-cloturer-une-conversation-assistant.md`
  summary: Enrichir le contrat BFF du Chef avec une représentation bornée des recettes proposées et écartées dans le fil actif.
  evidence: Le modèle reçoit aujourd'hui au plus cinq tours texte pour la génération, mais ni les cartes recettes ni leur état de rejet ; une représentation texte ou JSON lui permettrait d'éviter une proposition déjà refusée sans transmettre le HTML.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-demarrer-et-cloturer-une-conversation-assistant.md`
  summary: Ouvrir une recette générée en lecture seule depuis le fil, avec une action explicite pour passer à l'édition avant sauvegarde.
  evidence: La prévisualisation générée réutilise actuellement le formulaire d'édition ; le parcours souhaité distingue consultation de la proposition et modification volontaire.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-demarrer-et-cloturer-une-conversation-assistant.md`
  summary: Faire demander une précision au Chef lorsqu'une demande est ambiguë, hors cuisine ou insuffisante pour proposer une recette.
  evidence: « pourquoi les éléphants ? » a été routé vers un `noCandidate`, puis a déclenché une mousse au chocolat ; l'absence de recette du Cahier ne suffit pas à établir une intention de génération culinaire.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-demarrer-et-cloturer-une-conversation-assistant.md`
  summary: Reconnaître une demande de modification d'une recette générée dans le fil et créer une variante de cette recette plutôt qu'une nouvelle recette sans rapport.
  evidence: Après « Mousse au chocolat noir », « avec de l'orange amère » a généré des crêpes Suzette ; le contrat actuel ne fournit ni la recette proposée ni l'intention de la modifier au routeur/générateur.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-demarrer-et-cloturer-une-conversation-assistant.md`
  summary: Afficher le temps de préparation sur les vignettes de recettes lorsque cette donnée est disponible.
  evidence: Les vignettes du fil n'affichent aujourd'hui que la catégorie et le nombre d'ingrédients, ce qui ne permet pas d'évaluer immédiatement l'effort requis.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-garder-les-messages-riches-dans-le-fil.md`
  summary: Rendre l'analyse vision Assistant plus résiliente aux indisponibilités fournisseur : retry temporisé, diagnostic corrélé et reprise du lot sans réanalyser les images déjà réussies.
  evidence: Le lot est traité séquentiellement et la troisième photo valide a reçu un 503 `UPSTREAM_UNAVAILABLE` après les deux essais actuels espacés de 400 ms ; l'URL Tailscale, le BFF et les JPEG ont été vérifiés.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-rendre-les-six-etats-du-chef-localement.md`
  summary: Réparer la chaîne de build SPA afin que le gate E2E normal atteigne Playwright.
  evidence: `spa-404-fallback` échoue dans `closeBundle` avant que `dist/index.html` soit disponible ; le défaut précède la Story 5.2 et bloque aussi ses E2E via `npm run test:e2e`.
