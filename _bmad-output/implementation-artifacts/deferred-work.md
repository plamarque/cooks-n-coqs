- source_spec: `_bmad-output/implementation-artifacts/spec-2-2-restaurer-generation-apres-absence-de-candidat.md`
  summary: Rendre l’état d’illustration de la prévisualisation explicite avec un halo léger pendant la génération puis un placeholder dédié si elle devient indisponible.
  evidence: La génération d’image est best-effort et non bloquante ; l’état actuel, visuellement blanc, peut être interprété à tort comme une régression de la création de recette.
- source_spec: `_bmad-output/implementation-artifacts/spec-assistant-refuser-candidate-et-preciser-demande.md`
  summary: Aligner les scénarios E2E Assistant hérités sur les wires actuels `candidates` / `noCandidate` et leurs contrats de preview.
  evidence: La suite complète échoue sur 14 scénarios inchangés qui attendent les anciens wires `newRecipe` ou `import`, tandis que le scénario candidat corrigé passe isolément.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-clore-recherche-cahier.md`
  summary: Mettre à jour l'attente du test de benchmark qui exige encore le statut `awaiting-operator` malgré la décision humaine désormais consignée.
  evidence: `npm run test:unit` échoue dans `apps/bff/test/image-benchmark.test.ts` car le document versionné contient la clôture validée, hors périmètre de la correction 2.1.
