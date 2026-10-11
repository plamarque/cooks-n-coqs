---
title: "Sprint Change Proposal — ChefAgent MCP V1"
status: approved
created: "2026-10-11"
approved: "2026-10-11"
supersedes: "sprint-change-proposal-2026-10-11-chef-runtime-outils-locaux.md"
scope: moderate
mode: batch
---

# ChefAgent : une première version agentique locale

## Décision proposée

Remplacer le routeur Chef « classifier puis parcours figé » par `ChefAgent`, orchestrateur local de la PWA. L'agent pilote une boucle de raisonnement multi-tour : il fournit au reasoning model les skills C&C et les capacités MCP autorisées, reçoit une réponse finale ou une demande de capacité, puis valide et route cette demande.

Le BFF existant ne disparaît pas. Ses routes HTTP et services hors agent subsistent. Il devient aussi une passerelle stateless vers le reasoning model et un serveur MCP d'adaptateurs vers ses services externes métier. La PWA expose séparément un MCP local pour les données et actions qu'elle possède.

## Problème résolu

Après 9.2, le Chef sait classer puis choisir une sortie sûre, mais le modèle ne peut pas explorer le contexte utile avant de décider. Un plafond de deux outils ne convient pas à un objectif culinaire réel : retrouver une recette, lire ses étapes, demander une capacité externe et réévaluer peut demander plusieurs tours de raisonnement.

## Contrat V1

```text
App.vue → ChefAgent
  → BFF / reasoning model
  ← finale | activation de skill | appel MCP
  → MCP local ou MCP BFF
  ← résultat minimal
  → reasoning model, jusqu'à finale ou arrêt sûr
```

- `ChefAgent` est propriétaire local du fil, du contexte éphémère, de l'annulation, de l'état visuel et de l'autorisation de chaque appel.
- `chef-core` est toujours chargé : identité C&C, détection d'intention comme raisonnement continu, prudence sur les données et règles de confirmation.
- Les skills contextuels sont des manifestes locaux versionnés : instructions, critères de sélection et tools permis. La V1 inclut `adapter-une-recette`.
- Le reasoning model choisit la prochaine étape, sans obtenir la possibilité d'exécuter ou d'autoriser seul une capacité.
- La boucle ne porte pas de plafond fonctionnel de deux appels. Elle s'arrête sur une finale, une annulation, une erreur définitive ou l'absence de progrès détectée par le client. Les limites techniques de délai, taille et coût restent des protections internes observables, non une restriction produit de parcours.

## Capacités V1 et compatibilité 9.2

Le ChefAgent doit rendre les mêmes services visibles que 9.2 : idée temporaire, recherche au Cahier, création de preview, conseil et adaptation/variante sans écriture implicite. Les interfaces existantes sont conservées ; leurs services métier sont réemployés derrière des adaptateurs MCP plutôt que copiés.

| Origine | Capacités V1 |
| --- | --- |
| MCP local PWA | résoudre une référence, chercher le Cahier, lire le contexte d'une recette, préparer une preview volatile |
| MCP BFF | raisonnement, sélection/recherche assistée, création de preview, conseil, analyse et autres services externes déjà fournis par C&C |

Les tools sont des verbes métier avec schémas validés, jamais un accès brut à IndexedDB, une clé API, ou une route HTTP générique. Le client réduit les résultats au contexte nécessaire ; le BFF ne persiste ni fil, ni Cahier, ni profil.

## Hors V1, mais prévus par l'architecture

- recherche dans les fils passés et continuité de conversation ;
- mémoire personnelle curée et préférences avec provenance, confiance, expiration et correction ;
- corpus collectif serveur de techniques culinaires et publication de nouveaux skills.

Le corpus collectif est une initiative séparée : aucune donnée personnelle, conversation brute ou préférence utilisateur ne le rejoint automatiquement. Toute contribution est minimisée localement, montrée à la personne et transmise seulement avec son accord explicite. JEV peut qualifier un candidat déjà autorisé (connaissance généralisable, PII résiduelle, doublon), mais ne constitue pas une barrière avant l'envoi d'un texte brut. Une quarantaine, une revue et une évaluation précèdent toute nouvelle version de skill.

## Invariants maintenus

- Import manifeste déterministe prioritaire.
- Aucune écriture durable sans confirmation humaine ; `saveAssistantPreview` demeure hors de la boucle agentique.
- Annulation, fermeture de fil ou nouveau tour invalident toute continuation tardive.
- Le Chef ne révèle ni raisonnement interne, ni score, ni prompt.
- Les données personnelles restent locales ; les projections BFF sont temporaires et minimisées.

## Effet de planification

La Story 9.3 devient « Introduire ChefAgent et les MCP V1, en préservant les capacités 9.2 ». La recherche de fils et la reprise peuvent alimenter 9.4. La mémoire personnelle et le corpus collectif requièrent des stories dédiées après validation de la V1. Le tracker n'est régénéré qu'après approbation de cette proposition et de la SPEC dérivée.
