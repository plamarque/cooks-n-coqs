# Agents

## Sources de vérité (normatifs)

- **docs/SPEC.md** — Ce que le système fait ; contrat fonctionnel.
- **docs/DOMAIN.md** — Vocabulaire et règles du domaine.
- **docs/ARCH.md** — Structure et technologies.
- **docs/WORKFLOW.md** — Quand mettre à jour quel document.
- **docs/ADR/** — Décisions d’architecture.

Ne pas contredire ces documents. Le code et les changements doivent s’y aligner.

## Suivi et opérationnels (non normatifs)

- **docs/PLAN.md** — Livraison : tranches, jalons, statut des tâches. Utiliser pour le suivi, pas pour définir le comportement.
- **docs/ISSUES.md** — Bugs, limitations, travail différé. Utiliser uniquement pour le suivi des problèmes.
- **docs/DEVELOPMENT.md** — Configuration, commandes, contribution. Opérationnel uniquement.

## Workflow pour les agents

1. Lire SPEC, DOMAIN et ARCH avant de modifier le comportement ou la structure.
2. Utiliser PLAN pour « quoi faire ensuite » et ISSUES pour « ce qui est cassé ou différé ».
3. Lors de la mise à jour des docs : modifier les docs normatifs quand le comportement ou la structure change ; garder les docs de suivi factuels.

## Cursor Cloud specific instructions

### Overview

Cookies & Coquillettes is an npm-workspaces monorepo (Node 20) with three packages:
- `apps/web` — Vue 3 PWA frontend (Vite, port 5173)
- `apps/bff` — Express BFF for recipe parsing/AI (tsx watch, port 8787)
- `packages/domain` — Shared domain types and rules

No external database or Docker is required. All user data is stored client-side in IndexedDB.

### Running services

Standard commands are documented in `docs/DEVELOPMENT.md`. Key notes:
- Copy `.env.example` to `.env` before first run. Set `VITE_BFF_URL=http://localhost:8787` and `CORS_ORIGIN=http://localhost:5173` for local dev.
- `OPENAI_API_KEY` is optional; without it the BFF falls back to JSON-LD extraction only.
- `npm run dev` starts both web + BFF concurrently via `scripts/start-dev.sh`. To run them separately: `npm run dev:web` / `npm run dev:bff`.
- The BFF uses `tsx watch` for hot-reload; dependency changes require restarting the process.

### Testing

- **Unit tests**: `npm run test:unit` (Node built-in test runner on `packages/domain` + `apps/web/test`).
- **Frontend utility rule**: when adding/changing logic in `apps/web/src/utils` (or extracting helper logic from components), add/update targeted unit tests in `apps/web/test` and run `npm run test:unit -w @cookies-et-coquilettes/web` (or the root `npm run test:unit`).
- **Type checking**: `npm run typecheck` (vue-tsc for web, tsc for BFF).
- **E2E tests**: `npm run test:e2e` (builds the web app, starts a preview server on port 4174, runs Playwright). Requires `npx playwright install chromium` first. Les tests YouTube, Instagram et import fichier nécessitent le BFF démarré (`npm run dev:bff`) ; sans BFF ils sont ignorés.
