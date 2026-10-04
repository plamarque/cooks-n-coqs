---
title: 'Consigner l’amélioration visuelle de l’illustration Assistant'
type: 'chore'
created: '2026-10-04'
status: 'done'
route: 'one-shot'
context: []
---

# Consigner l’amélioration visuelle de l’illustration Assistant

## Intent

**Problem:** L’illustration best-effort d’une prévisualisation peut attendre ou devenir indisponible alors que la recette est déjà prête. Son état blanc actuel a pu être pris pour une régression de la génération de recette.

**Approach:** Enregistrer, sans changer le produit livré, une tâche différée limitée à deux états visuels : halo léger durant la génération et placeholder explicite en cas d’indisponibilité.

## Suggested Review Order

- L’entrée différée conserve le périmètre UX et son fondement observé. [`deferred-work.md`](deferred-work.md)
- La feature achevée reste la source du parcours recette et illustration non bloquante. [`spec-2-2-restaurer-generation-apres-absence-de-candidat.md`](spec-2-2-restaurer-generation-apres-absence-de-candidat.md)
