# Issues

## Bugs

- Import URL — `servingsBase` parfois absent alors que la source indique les portions (ex. Marmiton « 4 bons appétits », yield tableau / QuantitativeValue, ou portions seulement dans le HTML). **Résolu** (2026-08-12) : parsing BFF élargi + fallback HTML motifs FR ; régression couverte par `apps/bff/test/parsing-client-servings.test.ts`.
- Détail — champ Portions vide (ou stale) à l’entrée DETAIL hors ouverture depuis la liste (`saveForm` / création / import), alors que `servingsCurrent` / `servingsBase` sont persistés. Cause : seul `openDetail` peuplait `servingsInput`, avec une règle truthy plus faible que CAP-1. **Corrigé** (2026-08-15) : helper CAP-1 (`resolveDisplayedServings` / `servingsInputFromRecipe`) sur toutes les entrées DETAIL ; peupler ≠ scaler ; régression : `apps/web/test/recipe-detail-selection.test.ts`.

## Limitations

- `share_target` PWA non pris en charge par Safari (iOS/macOS) et Firefox ; fallback manuel via collage/presse-papiers requis.
- Export cahier v3 (ZIP léger) : pas de blobs dans le fichier ; la complétion des visuels à l’ouverture d’une recette peut rester longue et réseau-dépendante. Pistes futures : **écriture fichier chunkée** (File System Access API), **upload temporaire** (hors principe local-only par défaut) — non planifié.
- **Partage natif hors HTTPS** (ex. HTTP Tailscale `100.x` / LAN) : `navigator.share` (et souvent le presse-papiers) indisponibles sans contexte sécurisé. Pour tester le vrai partage OS en local : **HTTPS via Tailscale Serve** — voir `docs/DEVELOPMENT.md`. **Évolution future** (pas de dialogue « sélectionne le texte ») : si Web Share indisponible, **copier automatiquement** le F2 dans le presse-papiers et afficher « collé — colle ailleurs ».
- **CAP-2 — ordre WhatsApp (texte F2 vs image)** : avec le payload Web Share L2 `navigator.share({ text, files })`, WhatsApp (souvent aussi iMessage) affiche souvent le média avant le texte F2. L’API `ShareData` (`title` \| `text` \| `url` \| `files`) n’expose aucun champ d’ordre d’affichage ; l’ordre des clés JS n’est pas sémantique. **Volontairement non corrigé** : pas de branche WhatsApp, pas de double `share()`, pas d’omission de `files` ni de détournement `title`/`url` — tout cela régresserait les autres cibles ou le contrat F2 sans garantie d’ordre. Aligné avec `docs/SPEC.md` §Partage point 4 et `docs/ARCH.md` seam `recipe-native-share` (ordre des bulles OS non contractuel / non contrôlé).

## Différé

- Cache BFF pour images d'ingrédients générées : mutualiser les images entre utilisateurs pour limiter les appels DALL-E ; impact architecture (stockage serveur, ex. fichier ou Redis) — à réfléchir plus tard.
