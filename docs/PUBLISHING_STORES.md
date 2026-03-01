# Publication sur les stores

## Objet

Ce guide décrit comment publier **Cookies & Coquillettes** (PWA) sur Apple App Store et Google Play Store en s'appuyant sur un packaging PWA (PWABuilder/TWA + wrapper iOS).

Références : `docs/ARCH.md`, `docs/DEPLOYMENT.md`

---

## URLs à copier pour les formulaires stores

| Champ formulaire | URL à coller |
|------------------|--------------|
| **Politique de confidentialité** (Play Store, App Store Connect) | `https://plamarque.github.io/cookies-et-coquilettes/politique-confidentialite.html` |
| **URL de la PWA** (PWABuilder) | `https://plamarque.github.io/cookies-et-coquilettes/` |

---

## Vue d'ensemble

| Où ? | Quoi faire |
|------|------------|
| **Hors dépôt** | Comptes stores, PWABuilder, consoles Play/App Store, politique de confidentialité |
| **Dans le dépôt** | Manifest (icônes), `assetlinks.json`, screenshots, variables d'environnement |

---

# Partie A — Hors du dépôt

## Étape A1. Créer les comptes développeur

| Store | Compte | Coût |
|-------|--------|------|
| Google Play | [Google Play Console](https://play.google.com/console) | 25 $ (une fois) |
| Apple | [Apple Developer Program](https://developer.apple.com/programs/) | 99 €/an |

## Étape A2. Déployer la PWA en HTTPS

La PWA doit être accessible en HTTPS avant le packaging.

1. Suivre `docs/DEPLOYMENT.md` pour déployer sur GitHub Pages ou un domaine custom.
2. Vérifier que l'URL de production charge correctement l'app (ex. `https://plamarque.github.io/cookies-et-coquilettes/`).

## Étape A3. Préparer les assets marketing (hors dépôt)

À préparer avant de remplir les fiches store :

- **Politique de confidentialité** : disponible à `https://plamarque.github.io/cookies-et-coquilettes/politique-confidentialite.html` (fichier `apps/web/public/politique-confidentialite.html`, déployé avec la PWA).
- **Description courte** (80 caractères max pour Play Store).
- **Description longue** (4000 caractères max).
- **Feature graphic** (Play Store) : 1024×500 px.
- **Icône haute résolution** : 512×512 px (PNG) pour PWABuilder si besoin de regénération.

## Étape A4. Packaging via PWABuilder

1. Aller sur [https://pwabuilder.com](https://pwabuilder.com).
2. Saisir l'URL de production de la PWA (ex. `https://plamarque.github.io/cookies-et-coquilettes/`).
3. Vérifier que le manifest et les icônes passent (sinon, corriger dans le dépôt — voir Partie B).
4. Cliquer sur **Package for stores**.
5. Télécharger :
   - **Android** : package TWA (AAB ou APK).
   - **iOS** : projet Xcode (wrapper).

## Étape A5. Google Play — Console et publication

1. Créer l'application dans [Play Console](https://play.google.com/console).
2. Remplir la fiche store :
   - Description courte / longue
   - Catégorie (ex. Style de vie)
   - **Politique de confidentialité** : `https://plamarque.github.io/cookies-et-coquilettes/politique-confidentialite.html`
   - Captures smartphone + tablette (depuis `apps/web/public/screenshots/`)
   - Feature graphic
3. Créer une piste **Internal testing**.
4. Uploader l'AAB généré par PWABuilder.
5. Récupérer le **SHA-256 fingerprint** : App Integrity → App signing.
6. Publier `assetlinks.json` sur le domaine (voir Partie B).
7. Promouvoir en production après validation.

## Étape A6. Apple App Store — App Store Connect et publication

1. Créer l'app dans [App Store Connect](https://appstoreconnect.apple.com).
2. Remplir les métadonnées (dont **Politique de confidentialité** : `https://plamarque.github.io/cookies-et-coquilettes/politique-confidentialite.html`).
3. Uploader les screenshots iPhone/iPad (depuis `apps/web/public/screenshots/ios/`).
4. Sur Mac : ouvrir le projet Xcode généré par PWABuilder.
5. Configurer le bundle ID, le compte Apple Developer, les capabilities.
6. Archiver et uploader via Xcode Organizer (ou Fastlane).
7. Soumettre pour review.

---

# Partie B — Dans le dépôt (fichiers à configurer)

## Étape B1. Icônes PWA (manifest)

PWABuilder exige au minimum des icônes **192×192** et **512×512** (PNG). Le manifest actuel n'a que `favicon.svg`.

**Fichier** : `apps/web/vite.config.ts`

1. Créer les icônes PNG :
   - `apps/web/public/icons/icon-192x192.png`
   - `apps/web/public/icons/icon-512x512.png`

   (À partir du `favicon.svg` : exporter en PNG aux tailles requises, ou utiliser un outil comme [realfavicongenerator.net](https://realfavicongenerator.net) / [favicon-generator.ai](https://favicon-generator.ai).)

2. Mettre à jour le bloc `manifest.icons` dans `vite.config.ts` :

```ts
icons: [
  { src: "favicon.svg", sizes: "any", type: "image/svg+xml" },
  { src: "icons/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "icons/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" }
]
```

## Étape B2. Digital Asset Links (Android TWA)

Pour éviter la barre d’URL dans la TWA, servir `assetlinks.json` à la racine du domaine.

**Fichier à créer** : `apps/web/public/.well-known/assetlinks.json`

Structure (à adapter avec ton package name et ton SHA-256) :

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.example.cookiesetcoquilettes",
      "sha256_cert_fingerprints": [
        "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"
      ]
    }
  }
]
```

- `package_name` : celui défini dans PWABuilder / Play Console.
- `sha256_cert_fingerprints` : depuis Play Console → App Integrity → App signing.

**Important** : ce fichier doit être servi à `https://plamarque.github.io/cookies-et-coquilettes/.well-known/assetlinks.json`. Placer le fichier dans `public/.well-known/` ; il sera copié à la racine du site déployé.

## Étape B3. Générer les screenshots

```bash
npm run screenshots
```

Génère les captures dans :
- `apps/web/public/screenshots/ios/iphone/`, `ios/ipad/`
- `apps/web/public/screenshots/android/smartphone/`, `android/tablet/`

Les utiliser pour les fiches Play Store et App Store Connect.

## Étape B4. Variables d'environnement (déploiement)

Pour le build de production (GitHub Pages, etc.) :

- **Secret GitHub** : `VITE_BFF_URL` = URL publique du BFF (ex. `https://cookies-et-coquilettes-bff.onrender.com`).
- **Vérifier** : `VITE_BASE_PATH` correspond à l’URL de déploiement (ex. `/cookies-et-coquilettes/` pour un GitHub Pages project site).

Voir `docs/DEPLOYMENT.md` pour les détails.

---

# Récapitulatif des fichiers du dépôt à modifier/créer

**URL politique de confidentialité** (pour formulaires Play Store / App Store Connect) :
```
https://plamarque.github.io/cookies-et-coquilettes/politique-confidentialite.html
```

| Fichier | Action |
|---------|--------|
| `apps/web/vite.config.ts` | Ajouter icônes 192×192 et 512×512 dans `manifest.icons` |
| `apps/web/public/icons/icon-192x192.png` | Créer (export depuis favicon) |
| `apps/web/public/icons/icon-512x512.png` | Créer (export depuis favicon) |
| `apps/web/public/.well-known/assetlinks.json` | Créer avec package name + SHA-256 Play Console |
| `apps/web/public/screenshots/` | Générer via `npm run screenshots` |

---

# CI/CD release (optionnel)

Ce repo dispose déjà du déploiement push (PWA GitHub Pages, BFF Render). Pour automatiser les releases stores :

- Workflow `release-stores.yml` déclenché par tag `v*`
- Workflow `promote-stores.yml` déclenché manuellement
- Secrets GitHub : `PLAY_STORE_SERVICE_ACCOUNT`, `ANDROID_KEYSTORE_BASE64`, `APPSTORE_ISSUER_ID`, `APPSTORE_KEY_ID`, `APPSTORE_API_PRIVATE_KEY`, etc.

Voir la section 8 ci-dessous pour la liste des secrets typiques.

---

# Secrets typiques pour pipelines stores

Exemples de secrets GitHub à prévoir (selon l'implémentation retenue) :

- `PLAY_STORE_SERVICE_ACCOUNT`
- `ANDROID_KEYSTORE_BASE64`
- `BUBBLEWRAP_KEYSTORE_PASSWORD`
- `BUBBLEWRAP_KEY_PASSWORD`
- `APPSTORE_ISSUER_ID`
- `APPSTORE_KEY_ID`
- `APPSTORE_API_PRIVATE_KEY`
- `MATCH_PASSWORD`
- `MATCH_GIT_URL`
- `MATCH_GIT_BASIC_AUTHORIZATION`
