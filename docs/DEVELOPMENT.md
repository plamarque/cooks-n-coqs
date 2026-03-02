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
npm run dev

# PWA Vue
npm run dev:web

# BFF OCR/parsing
npm run dev:bff

# Build
npm run build:web
npm run build:bff

# Vérifications TypeScript
npm run typecheck

# Tests unitaires (domain + web)
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

Le front est servi par défaut sur `http://localhost:5173` et le BFF sur `http://localhost:8787`.

L’app est aussi exposée sur le réseau local (0.0.0.0) : au lancement, le script affiche l’URL réseau (ex. `http://192.168.1.x:5173`) pour accéder depuis un téléphone ou une tablette sur le même WiFi.

## Variables d’environnement

Copier `.env.example` vers `.env` pour le local puis adapter les valeurs.

- Front : `VITE_BFF_URL`, `VITE_BASE_PATH`
- BFF : `OPENAI_API_KEY` (parsing + génération d'images), `CORS_ORIGIN`, `GENERATED_IMAGE_CACHE_DIR`, `GENERATED_IMAGE_BASE_URL`, `GENERATED_IMAGE_ADMIN_TOKEN`, variables S3/R2 (stockage images), et variables **modèles IA** (voir ci-dessous)

### Modèles IA

Les modèles utilisés (images et chat) sont configurables via variables d'environnement. Valeurs par défaut :

| Variable | Défaut | Usage |
|----------|--------|-------|
| `AI_IMAGE_MODEL_RECIPE` | gpt-image-1.5 | Photos de recettes |
| `AI_IMAGE_MODEL_INGREDIENT` | gpt-image-1-mini | Icônes ingrédients |
| `AI_IMAGE_MODEL_COOKING_STEP` | gpt-image-1-mini | Illustrations étapes cuisine |
| `AI_IMAGE_QUALITY_*` | low | Qualité (GPT Image : low/medium/high ; DALL-E : standard/hd) |
| `AI_CHAT_MODEL` | gpt-4o-mini | Modèle par défaut (parsing, timer, réordonnancement) |
| `AI_CHAT_MODEL_PARSE` | — | Override parsing URL + screenshot |
| `AI_CHAT_MODEL_STEP_TIMER` | — | Override détection timer étape |
| `AI_CHAT_MODEL_REORDER` | — | Override réordonnancement des étapes |

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
