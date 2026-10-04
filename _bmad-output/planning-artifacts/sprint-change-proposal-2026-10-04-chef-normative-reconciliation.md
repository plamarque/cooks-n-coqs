---
title: "Sprint Change Proposal — Réconciliation normative Chef C&C"
status: approved
created: "2026-10-04"
trigger: "Sprint Planning readiness gate"
scope: minor
---

# Réconciliation normative Chef C&C

## 1. Résumé du problème

Le gate de préparation a trouvé une contradiction entre les artefacts Chef finalisés et les documents normatifs v1. `SPEC.md` imposait un fil Assistant exclusivement en mémoire, `DOMAIN.md` interdisait toute persistance d'historique Assistant, et `ARCH.md` ne décrivait ni journal local, ni profil Chef, ni protocole d'outils client-médiés. Ces règles empêchaient de démarrer les stories Chef sans contredire les sources normatives du dépôt.

Les décisions Chef elles-mêmes ne sont pas remises en cause : PRD, UX, architecture-spine et epics restent cohérents et validés.

## 2. Analyse d'impact

### Epics et stories

- Epics 4 à 8 restent valides et gardent leur ordre : conversation, présence, cuisine, mémoire, rituels.
- Aucun epic ni story n'est ajouté, supprimé ou renuméroté.
- Epic 4 dépend désormais explicitement de l'alignement documentaire ; les autres epics bénéficient des mêmes invariants local-first.

### Artefacts

| Artefact | Conflit | Ajustement |
| --- | --- | --- |
| `docs/SPEC.md` | Fil volatile contraire au journal local Chef | Conversation locale, contexte minimal, conseil orienté, contrôle des écritures et proactivité opt-in |
| `docs/DOMAIN.md` | Interdiction d'historique Assistant incompatible avec fils/profil Chef | Séparation compositeur éphémère, fils locaux, profil local et mutations client-validées |
| `docs/ARCH.md` | Absence d'orchestrateur client, d'outils et de persistance Chef | Composants Chef, BFF stateless, capacités typées, transfert de profil et données Chef locales |
| PRD, UX, spine, epics | Aucun conflit | Aucune modification |

Ni déploiement, CI, infrastructure, `.env` ou code applicatif ne changent dans cette correction.

## 3. Approche retenue

**Ajustement documentaire direct.** Cette voie est préférable à un rollback ou à une réduction du MVP : elle rend les règles existantes applicables sans modifier la vision, l'UX ni le découpage de valeur. Effort faible à moyen ; risque faible. La première implémentation reste bloquée tant que cet alignement n'est pas validé et intégré.

## 4. Propositions détaillées

### `docs/SPEC.md`

**Avant :** le fil Assistant est exclusivement en mémoire Vue et est détruit à la fermeture, à l'annulation ou à une nouvelle demande.

**Après :** un fil Chef local naît au premier envoi réel, est daté, contextualisable, supprimable et reprenable. Le compositeur non envoyé et les previews restent éphémères. Le client transmet le contexte minimal ; l'intention précise domine le profil ; une action durable est prévisualisée et confirmée ; les animations sont locales et les notifications ne sont possibles qu'après rituel opt-in.

**Raison :** rendre la conversation continue sans transformer le compositeur ou la preview en persistance implicite, ni exposer de donnée personnelle au BFF.

### `docs/DOMAIN.md`

**Avant :** aucune commande, image ou historique Assistant ne pouvait être écrit dans IndexedDB.

**Après :** le compositeur reste éphémère. Les fils Chef et le profil Chef deviennent des données locales distinctes des recettes. Le profil porte préférences explicites, inférences confiancées, foyer, goûts et hypothèses ; les contraintes ponctuelles restent de séance. Les outils sont validés par le client et les mutations durables confirmées.

**Raison :** expliciter le modèle métier et les limites de confiance sans inventer de schéma Dexie détaillé.

### `docs/ARCH.md`

**Avant :** l'architecture ne décrivait que les services Assistant v1 et les tables recettes/images.

**Après :** elle ajoute l'orchestrateur client Chef, profil, outils et BFF stateless ; les règles de capacité, annulation, mutations, transfert local de profil et données Chef locales. Le schéma détaillé du journal, profil et des payloads reste défini dans les stories.

**Raison :** fixer l'invariant architectural qui interdit la lecture ou l'écriture directe des données utilisateur par le BFF.

## 5. Handoff d'implémentation

**Classification : mineure — alignement documentaire direct.**

1. Vérifier et committer les trois documents normatifs et cette proposition.
2. Relancer `bmad-sprint-planning` ; il doit produire un gate `PASS` et le suivi de sprint.
3. Merger la branche de planification dans `main` seulement après ce gate.
4. Créer le worktree de la première story via `npm run story-worktree:start -- <story-key> <slug>` depuis `main` propre ; ne pas utiliser `git worktree add` directement.

## 6. Critères de succès

- `SPEC`, `DOMAIN` et `ARCH` n'imposent plus de règle incompatible avec la conversation locale Chef.
- Le BFF reste stateless pour les données personnelles Chef.
- Les epics 4 à 8 restent inchangés et implémentables dans leur ordre.
- Le gate Sprint Planning passe avant toute story Chef.
