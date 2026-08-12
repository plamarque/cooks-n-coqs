# ADR 0002 — Transfert proximité QR et dépôt Mode B

## Statut

Décidé

## Contexte

Cookies & Coquillettes est local-first : le cahier vit dans IndexedDB. Il fallait permettre à deux personnes proches de se transmettre une recette sans compte, sans sync cloud, et sans faire du BFF une source de vérité durable.

Les options techniques (WebRTC DataChannel, NFC/Bluetooth, partage système comme canal de réception, QR HTTPS) ont été évaluées ; le code v1 livre déjà un flux QR + dépôt éphémère Mode B qu’il faut figer comme contrat normatif.

## Options envisagées

1. **QR HTTPS (F2)** — deep link PWA `/r` ; Mode A = URL source dans le lien ; Mode B = ticket vers dépôt BFF court TTL / burn-after-read
2. **WebRTC / P2P (F1)** — canal direct appareil à appareil, sans transit BFF
3. **NFC / Bluetooth / `share_target` comme réception primaire** — APIs hétérogènes, support mobile inégal

## Décision

Choisir **QR HTTPS (F2)** comme transport v1.

- **Mode A** : le QR encode un deep link PWA (`/r?m=a&u=…&title=…`) vers une URL source réimportable — pas de drop BFF.
- **Mode B** : pour les recettes sans URL fiable (ou copies locales), Alice crée un dépôt éphémère `POST /api/proximity-drop` ; le QR porte uniquement le ticket (`/r?m=b&t=…&title=…`) ; Bob consomme via `GET /api/proximity-drop/:id` (burn-after-read) **après Confirmer** seulement.
- TTL v1 : **15 minutes** ; store v1 : **mémoire in-process mono-instance** ; possession du lien = frontière de confiance.
- Écriture durable uniquement via `RecipeService` après consentement ; dédup domaine quand une clé/URL est présente.
- WebRTC (et autres canaux P2P) restent **hors v1** (reportés, non rejetés définitivement).

## Conséquences

1. Le BFF gagne un rôle de **coordination éphémère** (proximity-drop) sans devenir SoR recettes.
2. Le scale horizontal du Mode B exige un ADR dédié (store partagé court TTL) avant multi-instances.
3. Seams client nommés : `proximity-deep-link-core`, `ProximityTransfer`, `proximity-receive` (+ orchestration post-confirm) — documentés dans `docs/ARCH.md`.
4. Comportement produit détaillé dans `docs/SPEC.md` (section Partage proximité).
5. Chiffrement client (`#` fragment) et révocation à la fermeture de l’overlay Alice restent différés ; HTTPS + TTL + one-shot suffisent pour v1.
