---
title: 'Souffle discret du Chef au Repos'
type: 'chore'
created: '2026-10-04'
status: 'done'
route: 'one-shot'
baseline_commit: '83d9661886f2ca6dee9d2d38f288ba85f4936f86'
---

# Souffle discret du Chef au Repos

## Intent

**Problem:** Le Repos du prototype faisait percevoir un léger déplacement entre poses alors que le Chef doit rester une présence immobile et discrète.

**Approach:** Garder une seule pose de repos, ajouter un souffle vertical de 1 % sur 600 ms au milieu d’une durée aléatoire de 9 à 14 s, puis isoler le clignement bref de la fin de séquence.

## Suggested Review Order

- Le Repos combine la pose fixe, le souffle limité et le clignement séparé.
  [`index.html:31`](../../docs/spikes/chef-cnc-motion/index.html#L31)

- Les keyframes garantissent que souffle et clignement ne coïncident jamais.
  [`index.html:37`](../../docs/spikes/chef-cnc-motion/index.html#L37)

- Le rejeu choisit une nouvelle durée sans modifier les autres états.
  [`index.html:85`](../../docs/spikes/chef-cnc-motion/index.html#L85)
