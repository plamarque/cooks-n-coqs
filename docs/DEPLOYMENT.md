# Déploiement

## Objectif

Déployer en mode push :
- PWA sur GitHub Pages
- BFF sur Render

## 1) GitHub Pages (frontend)

### Pré-requis GitHub

1. Activer **Pages** dans le repo (source : GitHub Actions).
2. Ajouter le secret repo :
   - `VITE_BFF_URL` = URL publique du BFF Render (ex. `https://cookies-et-coquilettes-bff.onrender.com`)

### Workflow

- Fichier : `.github/workflows/deploy-pages.yml`
- Déclenchement : push sur `main` quand web/domain/build config changent.
- Build avec :
  - `VITE_BASE_PATH=/<nom-repo>/` (compat GitHub Pages project site)
  - `VITE_BFF_URL` depuis secret

## 2) Render (backend)

### Option A (recommandée ici) : Deploy Hook

1. Créer un Web Service Render pointant ce repo.
2. Configurer sur Render :
   - Build Command : `npm ci && npm run build:bff`
   - Start Command : `npm run start -w @cookies-et-coquilettes/bff`
3. Renseigner les variables Render :
   - `OPENAI_API_KEY`
   - `CORS_ORIGIN` = `https://plamarque.github.io` (origine du front GitHub Pages)
4. Copier l’URL du Deploy Hook Render dans le secret GitHub :
   - `RENDER_DEPLOY_HOOK_URL`

Le workflow `.github/workflows/deploy-render.yml` déclenche alors un redeploy Render à chaque push `main` côté backend.

### Option B : Blueprint Render

Le fichier `render.yaml` peut être utilisé pour créer/synchroniser le service Render.

## 3) Vérification rapide après déploiement

1. Front déployé : vérifier l’URL GitHub Pages et le chargement des assets.
2. BFF déployé : tester `GET /health`.
3. CORS : vérifier qu’un appel front -> BFF passe sans erreur CORS.
4. Import URL/texte/screenshot : vérifier réponse API non 5xx.

## 4) Publication stores

Le guide détaillé de setup consoles et packaging est dans :
- `docs/PUBLISHING_STORES.md`
