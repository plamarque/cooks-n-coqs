# Plan

## Phase actuelle

Exécution des slices v1 en petites livraisons verticales. Refonte UX appliquée : layout simplifié (cartes en premier), import unifié (Coller + Choisir fichier), favoris en tête.

## Slices v1

| Slice | Objectif | Statut |
|-------|----------|--------|
| A | Invariants domaine + types partagés (`quantityBase`, validation, règles import/suppression) | En cours |
| B | Persistance Dexie + `recipe-service` (CRUD/favoris/scale immuable/tri) | En cours |
| C | CRUD UI (liste, détail, formulaire) avec sauvegarde explicite, affichage et édition image | En cours |
| D | Recherche et filtres (`Sucré/Salé`, favoris, texte titre+ingrédients) | En cours |
| E | Import complet + revue obligatoire + fallback draft manuel | En cours |
| F | Mode cuisine Wake Lock + fallback non bloquant | En cours |
| G | Durcissement release v1 (tests smoke E2E + cohérence erreurs/docs) | En cours |
| H | Import URL — pages web (fetch, JSON-LD, OpenAI, spinner, image) | Fait |
| I | Import URL — Instagram (scraper open-source) | Fait |
| J | Images recettes : génération IA automatique (fallback si pas d'extraction), placeholder | En cours |
| K | Ajustement portions : recalcul quantités (UI masquée, implémentation à finaliser) | Différée |
| L | Cible de partage PWA (`share_target`) + fallback presse-papiers multi-plateforme | Fait |
| M | Images ingrédients : icônes détail + cartes, génération IA lazy, cache IndexedDB mutualisé | Fait |
| N | Import URL — YouTube (description, poster, embed) | Fait |

## Definition of Done par slice

- [x] Code implémenté
- [x] Tests unitaires et/ou smoke E2E ciblés
- [x] Docs normatives et de suivi alignées
