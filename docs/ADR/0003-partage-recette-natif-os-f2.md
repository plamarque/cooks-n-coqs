# ADR 0003 — Partage recette natif (OS / F2)

## Statut

Décidé

## Contexte

Le partage proximité QR (ADR 0002 : deep link `/r`, Mode A URL, Mode B dépôt BFF) ne couvre pas le job « envoyer une recette à quelqu’un qui n’a pas l’app » (ex. messagerie). Il complexifie le produit (QR, `/r`, dépôt éphémère) alors que le succès attendu est **lire/cuisiner hors app**, pas installer pour recevoir.

Contraintes inchangées : local-first, peu/pas de conservation serveur de recettes, IndexedDB = SoR.

## Options envisagées

1. **Partage OS natif** — `navigator.share` : texte contractuel F2 (± image illustrative locale) ; CTA install en bas ; import Bob via collage / `share_target`
2. **Conserver / étendre le QR proximité** — Mode A/B comme canal principal
3. **Landing / cache OG serveur** — URL de fiche comme véhicule principal
4. **Fichier joint** (zip/json) comme véhicule V1 hors image illustrative Web Share

## Décision

Choisir le **partage système natif (option 1)** comme unique action Partager.

- Payload texte **F2** : titre nu en L1, ligne optionnelle `N portions` (**N = portions affichées** sur le détail après scaling appliqué, pas `servingsBase` si l’affichage diffère), quantités = liste détail ; en-têtes `Ingrédients:` / `Étapes:` / `Source:` ; CTA soft unique en dernière ligne vers l’origine PWA. Partager ne mute pas `servingsBase` / `quantityBase`. Parse entrant : nouveau wire **et** ancien `Titre:` / `Portions:` ; **parse local exclusif** si F2 reconnu (zéro BFF de structuration) ; `Source:` http(s) → `source.url` sans re-fetch ; CTA (une ligne ou wrap question + URL Pages live/legacy) ignoré, jamais URL de recette ; à l’import, N + quantités du texte deviennent la base de la fiche. Export/import zip cahier inchangé (fiche persistée, pas le scale d’affichage du partage).
- Image illustrative ~1080×1080 générée localement : photo principale plein cadre, CTA visuel bas, logo `favicon.svg` overlay haut-droite — **pas** de fiche (titre / portions / ingrédients) sur l’image ; dégradation **texte seul** si fichiers non partageables. À l’import F2, génération/extraction d’image post-création reste async best-effort.
- Pas de landing ni dépôt serveur pour le **contenu** recette ; si lien = CTA install seulement.
- Retrait produit du QR / `/r` / Mode B ; cleanup BFF `proximity-drop` en livraison suivante après retrait UI.
- ADR 0002 est **Superseded**.

## Conséquences

1. `docs/SPEC.md` décrit « Partage natif (OS) » à la place de « Partage proximité (QR) ».
2. `docs/ARCH.md` cible les seams `recipe-share-f2` / `recipe-share-card` / `recipe-native-share` ; seams proximité obsolètes.
3. `docs/DOMAIN.md` note l’échange texte F2 sans nouvelle entité persistée ; émission depuis l’affichage, import = base reçue.
4. Compat Web Share + fichiers variable selon OS — le texte F2 reste le véhicule obligatoire.
5. Feature SPEC de référence : `_bmad-output/specs/spec-partage-recette-distant/`.
6. **CAP-7** : le F2 émis reflète l’écran détail (portions + quantités visibles) ; zip cahier et image sans portions restent hors de ce recalibrage.
