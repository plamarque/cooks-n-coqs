# Issues

## Bugs

- Import URL — `servingsBase` parfois absent alors que la source indique les portions (ex. Marmiton « 4 bons appétits », yield tableau / QuantitativeValue, ou portions seulement dans le HTML). **Résolu** (2026-08-12) : parsing BFF élargi + fallback HTML motifs FR ; régression couverte par `apps/bff/test/parsing-client-servings.test.ts`.

## Limitations

- `share_target` PWA non pris en charge par Safari (iOS/macOS) et Firefox ; fallback manuel via collage/presse-papiers requis.
- Export cahier v3 (ZIP léger) : pas de blobs dans le fichier ; la complétion des visuels à l’ouverture d’une recette peut rester longue et réseau-dépendante. Pistes futures : **écriture fichier chunkée** (File System Access API), **upload temporaire** (hors principe local-only par défaut) — non planifié.

## Différé

- Ajustement des portions : UI masquée car inopérante ; slice K, voir `docs/features/PORTIONS.md`.
- Cache BFF pour images d'ingrédients générées : mutualiser les images entre utilisateurs pour limiter les appels DALL-E ; impact architecture (stockage serveur, ex. fichier ou Redis) — à réfléchir plus tard.
