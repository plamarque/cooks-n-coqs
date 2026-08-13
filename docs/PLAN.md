# Plan

## Phase actuelle

Exécution des slices v1 en petites livraisons verticales. Refonte UX appliquée : layout simplifié (cartes en premier), import unifié (Coller + Choisir fichier), favoris en tête.

## Slices v1

| Slice | Objectif | Statut | Reste à faire |
|-------|----------|--------|---------------|
| A | Invariants domaine + types partagés (`quantityBase`, validation, règles import/suppression) | Fait | — |
| B | Persistance Dexie + `recipe-service` (CRUD/favoris/scale immuable/tri) | Fait | — |
| C | CRUD UI (liste, détail, formulaire) avec sauvegarde explicite, affichage et édition image | Fait | — |
| D | Recherche et filtres (`Sucré/Salé`, favoris, texte titre+ingrédients) | Fait | — |
| E | Import complet + revue obligatoire + fallback draft manuel | Fait | — |
| F | Mode cuisine Wake Lock + fallback non bloquant | Fait | — |
| G | Durcissement release v1 (tests smoke E2E + cohérence erreurs/docs) | En cours | Corriger les tests E2E BFF-dépendants si échecs hors CI |
| H | Import URL — pages web (fetch, JSON-LD, OpenAI, spinner, image) | Fait | — |
| I | Import URL — Instagram (scraper open-source) | Fait | — |
| J | Images recettes : génération IA automatique (fallback si pas d'extraction), placeholder | Fait | — |
| K | Ajustement portions : recalcul quantités (UI masquée, implémentation à finaliser) | Différée | Voir [PORTIONS.md](docs/features/PORTIONS.md) |
| L | Cible de partage PWA (`share_target`) + fallback presse-papiers multi-plateforme | Fait | — |
| M | Images ingrédients : icônes détail + cartes, génération IA lazy, cache IndexedDB mutualisé | Fait | — |
| N | Import URL — YouTube (description, poster, embed) | Fait | — |
| O | Export / import cahier (ZIP + JSON interne, tout ou liste filtrée, sans dédoublonnage ; progression UI) | Fait | — |
| P | Partage natif OS (texte F2 ± vignette) ; retrait QR proximité | En cours | Feature SPEC `_bmad-output/specs/spec-partage-recette-distant/` ; ADR 0003 ; stories 2… |

## Idées / backlog (hors livraison v1)

- **P2P / WebRTC / NFC** : reportés (non rejetés) — hors chemin partage natif OS. Ancienne exploration QR : `features/PEER_RECIPE_SHARE.md` (historique ; produit = ADR 0003).

## Definition of Done par slice

- [x] Code implémenté
- [x] Tests unitaires et/ou smoke E2E ciblés
- [x] Docs normatives et de suivi alignées
