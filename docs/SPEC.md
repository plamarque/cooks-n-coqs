# Spécification fonctionnelle v1

## Objectif produit

**Cookies & Coquillettes** est une application mobile-first (PWA) pour centraliser des recettes trouvées en ligne ou saisies à la main, puis les retrouver et les consulter facilement pendant la cuisine.

Problème utilisateur adressé en priorité : ne plus devoir re-chercher les recettes sur Internet à chaque fois.

## Périmètre v1

### Dans le périmètre

1. Création manuelle d’une recette (titre, ingrédients, étapes, portions, temps optionnels, photo optionnelle).
2. Import assisté d’une recette depuis :
   - partage système mobile (quand la plateforme le permet),
   - écran « Nouvelle recette » : champ de collage (URL/texte/image) + Importer, Saisir à la main, Choisir un fichier.
3. Structuration lisible de la recette importée sans altérer arbitrairement le sens de la source.
4. Classement binaire des recettes : `Sucré` / `Salé` (sans tags en v1).
5. Mise en favoris.
6. Consultation via vignettes (photo + nom), détail lisible, et édition libre à tout moment.
7. Ajustement du nombre de portions avec recalcul automatique des quantités.
8. Mode cuisine anti-veille (Wake Lock si disponible, sinon fallback non bloquant).
9. Fonctionnement local sans compte utilisateur (stockage local-only).
10. Suppression définitive d’une recette avec confirmation explicite.
11. Sauvegarde explicite du formulaire recette (`Enregistrer` / `Annuler`).
12. Import direct : création immédiate de la recette, édition possible à tout moment.
13. Export et import du cahier : fichier **.zip** téléchargeable (tout le cahier ou la liste filtrée affichée), import **.zip** depuis l’écran « Nouvelle recette », avec **dédoublonnage best-effort** par clé source stable (voir Export / import du cahier) ; pas de fusion automatique de contenu entre fiches distinctes.

### Hors périmètre v1

1. Partage social sortant comme fonctionnalité prioritaire.
2. Transformation vidéo -> recette structurée.
3. Liste de courses intégrée.
4. Synchronisation cloud multi-appareils.
5. Estimation automatique fiable du temps de recette par IA.

## Capacités fonctionnelles détaillées

### Saisie et import

1. L’utilisateur peut saisir une recette entièrement à la main.
2. L’utilisateur peut importer une recette via partage système (si navigateur/OS compatibles), ou depuis l'écran « Nouvelle recette » : collage (URL/texte/image) + Importer, ou choix fichier, ou saisie manuelle.
3. Toute recette importée est créée immédiatement et affichée ; l'utilisateur peut l'éditer à tout moment si besoin.
4. Lorsque la source structurée (ex. JSON-LD) fournit plusieurs images ou une vidéo par étape, l'application tente de les extraire et de les associer à l'étape correspondante (best effort) ; les images sont téléchargées en arrière-plan.
5. Si le BFF est indisponible ou l’extraction échoue, l’application crée un draft minimal (titre + provenance) à compléter manuellement via l'édition.
6. Pendant l’import (URL, texte ou image), l’interface affiche un état d’attente explicite indiquant l’analyse en cours.
7. La provenance (`source`) est conservée pour tout import, même sans URL (ex. image collée).
8. Pour un import YouTube ou Instagram (post/reel), l'application extrait la recette depuis la description (caption), capture le poster (thumbnail) et affiche l'embed vidéo dans la vue détail et le formulaire d'édition ; le poster est réservé aux cartes de l'écran d'accueil. Le bouton overlay « Cuisiner » est masqué sur les embeds vidéo pour ne pas gêner la lecture.

### Export / import du cahier

1. Depuis la liste des recettes, l’utilisateur peut lancer un export : **tout le cahier** ou **uniquement les recettes correspondant aux filtres et à la recherche affichés** (même périmètre que la liste à l’écran).
2. L’export produit un **fichier .zip** téléchargeable (contient un **JSON** version **v3** à l’entrée conventionnelle `recipe-book.json`), toujours **léger** : texte et structure des recettes uniquement — **aucune image** dans le fichier (pas de blobs, pas de références d’images locales ; les **URLs vidéo** d’étapes sont conservées). Le format zip vise notamment **iOS** (Fichiers, partage). Il n’existe **pas d’options d’export** dans l’interface : un seul flux d’export.
3. Depuis l’écran « Nouvelle recette », l’utilisateur peut **importer** une archive **.zip** uniquement ; chaque recette du fichier est **ajoutée** au stockage local, **sauf** si une **clé source stable** (voir point 4) identifie déjà une recette en base ou une entrée précédente dans le même fichier — dans ce cas la recette concernée de l’archive est **ignorée** (aucune écriture, la fiche existante est conservée). Le JSON interne suit les mêmes règles qu’aux points suivants (**v1 / v2 / v3** à l’import). Pendant l’**export** ou l’**import** du cahier, l’interface affiche une **progression** (barre et libellé d’étape) pour les étapes **bloquantes** : compression ou décompression, analyse, éventuels téléchargements d’images distantes liées à l’archive, **écriture IndexedDB**. Pour les archives **sans images embarquées** (notamment v3, ou v2 avec profil « tout désactivé »), l’**import est considéré terminé** une fois les fiches écrites ; la complétion de la photo principale, des icônes ingrédients et des images d’étapes (cache BFF puis génération IA) est **tentée à la première ouverture** de chaque recette en vue détail (best-effort, dépend du BFF), sur le même principe que les imports URL/texte sans image immédiate. Les échecs réseau pendant cette phase n’annulent pas la fiche déjà créée. Les archives **v1** ou **v2** avec images incluses se comportent comme auparavant (blobs dans le fichier). **Limite** : les **captures d’écran** et **photos importées fichier** qui ne sont **pas** dans le cache BFF déterministe **ne sont pas reconstituables** à partir d’un export v3.
4. **Dédoublonnage à l’import cahier (best-effort)** : lorsque la recette porte une **`importSourceStableKey`** (dérivée d’une URL `source` normalisée, ou déjà présente dans le JSON exporté), l’application **ignore** l’import de toute recette de l’archive partageant cette clé avec une recette **déjà stockée** ou avec une recette **déjà retenue** plus haut dans le même fichier. **Sans clé** (ex. saisie manuelle sans URL exploitable), aucun dédoublonnage n’est appliqué pour cette fiche. **Limites** : deux recettes distinctes partageant la même URL de source seraient considérées comme un seul import ; les anciennes fiches sans clé ni URL exploitable ne sont pas recoupées automatiquement. À l’import, de **nouveaux identifiants** sont toujours attribués aux recettes **effectivement importées** et à leurs blobs pour ne pas écraser les données existantes.
5. Le transfert est **manuel** (copie du fichier par l’utilisateur, ex. messagerie ou AirDrop) ; il ne constitue pas une synchronisation cloud multi-appareils.
6. Le BFF expose des points d’accès **sans génération** pour obtenir des **clés de cache** déterministes (`POST .../cache-key/recipe-image`, `.../cooking-step-image`, `.../ingredient-image`) ; le client peut ensuite lire l’image en cache via `GET /api/generated-images/:key` (notamment lors de la complétion des visuels à l’ouverture d’une recette issue d’archive légère).

### Organisation et recherche rapide

1. Les recettes sont affichées sous forme de grille de vignettes.
2. L’utilisateur peut filtrer par catégorie (`Sucré`, `Salé`) et par favoris. Au chargement, le filtre favoris est activé par défaut (icône cœur) : seules les recettes favorites sont affichées.
3. L’utilisateur peut rechercher en texte libre sur `titre + ingrédients`.
4. La liste est triée par défaut : favoris en premier, puis par dernière modification (`updatedAt DESC`).
5. La navigation privilégie l’accès rapide aux recettes fréquemment utilisées.

### Consultation et exécution

1. Les vignettes (cartes) affichent la photo de la recette lorsqu'elle existe.
2. L'écran détail affiche l'image en en-tête, puis ingrédients (grille avec images), quantités, portions et préparation (étapes ordonnées avec icônes des ingrédients mentionnés en bout de ligne, au plus trois visibles par étape ; au-delà, une indication « +x » sur la troisième icône ouvre une popin listant tous les ingrédients de l'étape). Sous chaque étape, lorsqu'ils existent, les médias d'étape s'affichent dans l'ordre : plusieurs images (vignettes / défilement) et liens ou embeds vidéo (YouTube, Instagram, Vimeo en embed si reconnu, sinon lien externe). En mode cuisine, la bande d'ingrédients de l'étape courante suit la même règle.
3. L'utilisateur peut modifier les portions ; les quantités sont recalculées immédiatement.
4. L'utilisateur peut réinitialiser les portions à la valeur de base.
5. Le mode cuisine (anti-veille) est activable uniquement depuis l'écran détail d'une recette ouverte.
6. En mode cuisine, les actions `Précédente` / `Suivante` restent toujours visibles en bas d'écran ; seul le texte de l'étape défile.
7. En mode cuisine, la zone média affiche d'abord les médias explicites de l'étape (images locales et vidéos intégrées ou en lien) ; à défaut, une image d'étape en cache local historique (`cookingStepImages`) si elle existe ; sinon l'image recette ; sinon invite à ajouter une image.
8. En mode cuisine, si le texte d'une étape mentionne (explicitement ou implicitement) une durée de cuisson/repos, l'UI propose un timer countdown prérempli ; l'utilisateur le déclenche manuellement. La durée est déterminée par détection sémantique (IA, avec fallback local en cas d'indisponibilité). Le timer affiche le temps restant et une progression circulaire semi-transparente décroissante (sens horaire), puis émet un court signal sonore de fin.
9. À la sortie du mode cuisine, l'application affiche le temps passé et propose de mettre à jour `prepTimeMin` en prenant la moyenne entre le temps mesuré et la valeur existante de la recette.

> **Note** : L'ajustement des portions (points 3-4) est prévu mais l'UI est temporairement masquée ; implémentation à finaliser (slice K).

### Image de recette

1. L'image est affichée sur les cartes, dans l'en-tête du détail et dans le formulaire d'édition.
2. L'utilisateur peut ajouter, modifier ou supprimer l'image depuis le formulaire recette.
3. Lorsqu'aucune image n'est extraite à l'import (URL, texte, partage), l'application tente de générer une image automatiquement à partir du titre, des ingrédients et de la description de la recette.
4. L'image générée adopte un style plat, type photo de plat Instagram : élégant, professionnel, appétissant.
5. À l'import, l'image est traitée en arrière-plan (extraction ou génération) ; un placeholder avec message s'affiche pendant ce temps.
6. Les illustrations d'étapes générées pendant le mode cuisine sont conservées localement pour éviter une régénération répétée.

### Images des ingrédients

1. Chaque ingrédient peut avoir une image associée, affichée à côté de son libellé dans la liste des ingrédients (écran détail).
2. Si l'image n'existe pas, elle est générée automatiquement par IA à la demande (lazy).
3. Si l'image existe déjà (stockée localement), elle est réutilisée.
4. Sur les cartes de la page d'accueil (liste des recettes), où le nombre total d'ingrédients est affiché, les images des ingrédients sont affichées en petits icônes sur le côté.
5. Style des images : photoréaliste, ingrédient unique en gros plan (une seule occurrence), fond blanc propre sans ombre marquée, conçu pour rester lisible en petit format.

### Édition

1. Toute recette peut être modifiée à tout moment.
2. Les modifications sont persistées localement à l’action explicite de sauvegarde.
3. La suppression est irréversible après confirmation utilisateur.
4. Pour chaque étape, l'utilisateur peut ajouter ou retirer plusieurs images (fichier ou génération IA comme pour l'illustration recette), ordonner les médias, et ajouter une ou plusieurs URLs vidéo (`http` ou `https`).

## Critères de succès v1

1. Ajouter une recette en moins de 2 minutes via import ou saisie manuelle.
2. Retrouver une recette en moins de 10 secondes via vignettes + filtres (`Sucré`, `Salé`, `Favoris`).
3. Changer le nombre de portions et observer la mise à jour des quantités sans latence perceptible.
4. Consulter et modifier les recettes sans connexion réseau.
5. Finaliser un import directement ; éditer la recette si besoin, y compris en mode fallback hors-ligne.

## Contraintes fonctionnelles

1. Le recalcul des portions ne s’exécute que sur action explicite utilisateur.
2. Les quantités non quantifiables (ex : “une pincée”, “un zeste”) restent en texte libre.
3. Les unités pratiques doivent être conservées quand possible (ex : œufs en nombre, pas en grammes).
4. Le recalcul des portions doit se baser sur une référence immuable (pas de dérive cumulative).
5. Le produit est optimisé pour le français en v1 ; autres langues en best effort.
