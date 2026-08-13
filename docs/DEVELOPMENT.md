# Développement

## Prérequis

- Node 20+
- Git

## Configuration

```bash
git clone <repo>
cd cookies-et-coquilettes
npm install
```

## Commandes

```bash
# Dev complet (web + bff)
# Défaut : HTTPS Tailscale si Tailscale est connecté, sinon HTTP LAN
./scripts/start-dev.sh
# ou équivalent :
npm run dev

# Forcer HTTPS Tailscale (Web Share mobile)
./scripts/start-dev.sh --https
npm run dev -- --https

# Forcer HTTP WiFi/LAN (sans Tailscale Serve)
./scripts/start-dev.sh --http
npm run dev -- --http

# PWA Vue seule
npm run dev:web

# BFF OCR/parsing seul
npm run dev:bff

# Build
npm run build:web
npm run build:bff

# Vérifications TypeScript
npm run typecheck

# Tests unitaires (domain + web + bff)
npm run test:unit

# Tests unitaires web uniquement
npm run test:unit -w @cookies-et-coquilettes/web

# E2E Playwright
npm run test:e2e
npm run test:e2e:ui

# Génération screenshots stores
npm run screenshots

# Test R2 (stockage images) — vérifie config et permissions
npm run test:r2 -w @cookies-et-coquilettes/bff
```

Le front écoute sur `http://127.0.0.1:5173` (et `0.0.0.0`). En mode **`--https`**, Tailscale Serve expose `https://….ts.net` vers Vite et `https://….ts.net:8443` vers le BFF (évite le mixed content). En mode **`--http`**, utilise l’URL réseau `http://<LAN-IP>:5173` sur le même WiFi.

### HTTPS / Web Share

`navigator.share` exige HTTPS (ou `localhost`). `http://100.x…` Tailscale en clair ne suffit pas — utilise `--https` (ou le défaut quand Tailscale est connecté). Ctrl+C remet `tailscale serve reset`. Si le HMR casse derrière Serve, recharge la page à la main pour retester Partager.

## Variables d’environnement

Copier `.env.example` vers `.env` pour le local puis adapter les valeurs.

- Front : `VITE_BFF_URL`, `VITE_BASE_PATH`
- BFF : `OPENAI_API_KEY` (parsing + génération d'images), `CORS_ORIGIN`, `GENERATED_IMAGE_CACHE_DIR`, `GENERATED_IMAGE_BASE_URL`, `GENERATED_IMAGE_ADMIN_TOKEN`, variables S3/R2 (stockage images), et variables **modèles IA** (voir ci-dessous)

### Modèles IA

Les modèles utilisés (images et chat) sont configurables via variables d'environnement. Colonne « Défaut » = défaut **code** si la variable d’env est absente :

| Variable | Défaut | Usage |
|----------|--------|-------|
| `AI_IMAGE_MODEL_RECIPE` | gpt-image-2 | Photos de recettes |
| `AI_IMAGE_MODEL_INGREDIENT` | gpt-image-1-mini | Icônes ingrédients |
| `AI_IMAGE_MODEL_COOKING_STEP` | gpt-image-1-mini | Illustrations étapes cuisine |
| `AI_IMAGE_QUALITY_*` | low | Qualité GPT Image : low/medium/high |
| `AI_CHAT_MODEL` | — (pas de défaut code dédié) | Fallback global **recommandé** `gpt-5.6-luna` quand la var est posée ; n’est pas le défaut de `parse` |
| `AI_CHAT_MODEL_PARSE` | gpt-5.6-terra | Parsing URL + screenshot |
| `AI_CHAT_MODEL_STEP_TIMER` | gpt-5.6-luna | Détection timer étape |
| `AI_CHAT_MODEL_REORDER` | gpt-5.6-luna | Réordonnancement des étapes |
| `AI_CHAT_MODEL_EXTRACT` | gpt-5.6-luna | Filets micro-extraits (use-case `extract`) |

Chaîne de résolution chat : override use-case → `AI_CHAT_MODEL` (si posé) → défaut code du use-case (ex. `parse` → terra, pas luna).

Référence tarifs : [OpenAI Pricing](https://developers.openai.com/api/docs/pricing).

## Prérequis E2E / screenshots

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Pour les tests d’import (fichier, URL YouTube), le BFF doit être en cours d’exécution : `npm run dev:bff` dans un terminal séparé.

## CI (GitHub Actions)

Le workflow `.github/workflows/e2e.yml` exécute tous les tests E2E (y compris ceux dépendant du BFF) sur chaque push et PR vers `main`. Les tests YouTube et Instagram sont ignorés en CI (APIs externes flaky/bloquées). Pour que les tests d'import fichier fonctionnent, configurer le secret :

- **Repository** > Settings > Secrets and variables > Actions > New repository secret
- Nom : `OPENAI_API_KEY`
- Valeur : la clé API OpenAI (parsing et génération d'images)

Sans ce secret, le BFF tourne en mode fallback et le test d'import fichier peut échouer.

## Déploiement

- PWA : workflow GitHub Pages (`.github/workflows/deploy-pages.yml`)
- BFF : workflow Render (`.github/workflows/deploy-render.yml`) + `render.yaml`
- Détails pas-à-pas : `docs/DEPLOYMENT.md`
- Publication stores : `docs/PUBLISHING_STORES.md`

## Contribution

- Lire docs/SPEC.md, docs/DOMAIN.md et docs/ARCH.md avant de modifier le comportement ou la structure.
- Mettre à jour les docs normatifs quand le comportement ou l’architecture change.
- Garder docs/PLAN.md et docs/ISSUES.md factuels.
