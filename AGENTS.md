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

## Worktrees de story

- **Ne jamais appeler `git worktree add` directement** pour une story. Depuis `main` propre, appeler obligatoirement `npm run story-worktree:start -- <story-key> <slug>` ; lui seul crée le worktree et prépare les dépendances, le `.env` local autorisé et les workflows BMAD. Si `main` porte des changements locaux non liés, appeler `npm run story-worktree:start-from-head -- <story-key> <slug>` : il part du `HEAD` validé sans copier ces changements.
- Pour isoler tardivement une séance commencée dans `main`, Codex propose d’abord une liste courte des chemins vraisemblablement liés et attend la confirmation ou l’ajustement de Patrice. Une fois celle-ci obtenue, utiliser seulement `npm run story-worktree:handoff -- <story-key> <slug> -- <chemin-confirmé>...` : il crée et prépare le worktree depuis `HEAD`, puis y reporte exactement cette sélection sans modifier `main`. Ne jamais y inclure de fichiers ignorés, dépendances, secrets ou travaux non confirmés.
- Si un worktree a déjà été créé directement, le réparer avant toute investigation avec `npm run story-worktree:prepare -- <chemin-du-main>` depuis ce worktree.
- Si le worktree Codex de destination existe déjà, ne pas relancer un handoff : l’examiner puis appeler `npm run story-worktree:prepare -- <chemin-du-main>` depuis celui-ci avant de reprendre la séance.
- Exception à la règle `.env` ci-dessus : ce script peut uniquement copier le `.env` local de `main` vers le worktree qu’il crée ou prépare ; il ne le versionne ni ne l’affiche.

## Clôture d'une story

- « Clôturons », « termine cette story » ou équivalent est une autorisation de réaliser la clôture **locale** normale : vérifier l’état réel, lancer les vérifications pertinentes, committer les seuls changements de la story, merger dans `main`, vérifier `main`, puis retirer le worktree et la branche locale une fois intégrés.
- Ce n’est pas un teardown aveugle : détecter et expliquer tout conflit, test en échec, changement non lié, worktree non mergé ou processus actif avant d’agir. Une story simplement marquée `done` peut déclencher une proposition de clôture, jamais une suppression automatique.
- Ne jamais pousser, déployer, supprimer un autre worktree, ni supprimer le worktree actif du chat sans instruction explicite. Une clôture qui nécessite de retirer le worktree courant se termine dans le chat de story puis s’exécute depuis le checkout d’intégration.
