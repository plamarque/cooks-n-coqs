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
```

Le front est servi par défaut sur `http://localhost:5173` et le BFF sur `http://localhost:8787`.

L’app est aussi exposée sur le réseau local (0.0.0.0) : au lancement, le script affiche l’URL réseau (ex. `http://192.168.1.x:5173`) pour accéder depuis un téléphone ou une tablette sur le même WiFi.

## Variables d’environnement

Copier `.env.example` vers `.env` pour le local puis adapter les valeurs.

- Front : `VITE_BFF_URL`, `VITE_BASE_PATH`
- BFF : `OPENAI_API_KEY` (parsing + génération d'images DALL-E), `CORS_ORIGIN`

## Prérequis E2E / screenshots

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Pour les tests d’import (fichier, URL YouTube), le BFF doit être en cours d’exécution : `npm run dev:bff` dans un terminal séparé.

## Déploiement

- PWA : workflow GitHub Pages (`.github/workflows/deploy-pages.yml`)
- BFF : workflow Render (`.github/workflows/deploy-render.yml`) + `render.yaml`
- Détails pas-à-pas : `docs/DEPLOYMENT.md`
- Publication stores : `docs/PUBLISHING_STORES.md`

## Contribution

- Lire docs/SPEC.md, docs/DOMAIN.md et docs/ARCH.md avant de modifier le comportement ou la structure.
- Mettre à jour les docs normatifs quand le comportement ou l’architecture change.
- Garder docs/PLAN.md et docs/ISSUES.md factuels.
