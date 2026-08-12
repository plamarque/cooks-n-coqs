<!-- bmad:context -->
<!-- Verified 2026-08-11 against 2e7335dc510fd870a493129a245866d4cd7620ef. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## cooks-n-coqs

Cookies & Coquillettes — PWA recettes (Vue 3 / Vite) + BFF Express + package domaine partagé ; monorepo npm workspaces, Node 20. Données utilisateur en IndexedDB côté client. Docs et planning dans `docs/` ; setup/commandes dans `docs/DEVELOPMENT.md`.

## Policy

- Ne jamais créer ni modifier `.env` sans autorisation explicite de Patrice ; partir de `.env.example` seulement si demandé.
- Sources de vérité normatives : `docs/SPEC.md`, `docs/DOMAIN.md`, `docs/ARCH.md`, `docs/WORKFLOW.md`, `docs/ADR/` — ne pas les contredire ; y aligner code et changements.
- Suivi non normatif : `docs/PLAN.md`, `docs/ISSUES.md` ; opérationnel : `docs/DEVELOPMENT.md`.
- Avant de changer comportement ou structure : lire SPEC, DOMAIN et ARCH. Mettre à jour les docs normatifs quand le comportement ou la structure change ; garder PLAN/ISSUES factuels.

## Where things are

- Front : `apps/web` (`@cookies-et-coquilettes/web`)
- BFF : `apps/bff` (`@cookies-et-coquilettes/bff`)
- Règles et types partagés : `packages/domain` — ne pas réimplémenter validation, scaling ou dédup ailleurs
- Comment lancer / tester / déployer : `docs/DEVELOPMENT.md` (ne pas recopier les scripts npm ici)

## Running and verifying

- Sous `npm run dev`, `scripts/start-dev.sh` écrase `VITE_BFF_URL` avec l’IP LAN ; pour respecter `.env`, lancer `dev:web` / `dev:bff` séparément.
- E2E YouTube, Instagram et import fichier : BFF démarré requis (`npm run dev:bff`) ; sans BFF ces tests sont ignorés.
- CI ne lance pas les unit tests (e2e + typecheck au deploy) — `npm run test:unit` reste à faire en local quand tu touches la logique.
- Logique ajoutée/changée dans `apps/web/src/utils` (ou extraite depuis des composants) : ajouter/mettre à jour des tests dans `apps/web/test` et lancer `npm run test:unit`.

## Conventions that differ from defaults

- Tests unitaires : runner Node (`node --test` / `tsx`), pas Vitest/Jest.
- Dans `packages/domain`, jumeaux `.ts` + `.js` : les tests importent le `.js` — les garder alignés quand tu modifies les règles.

<!-- /bmad:context -->
