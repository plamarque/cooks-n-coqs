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
4. Si le BFF est indisponible ou l’extraction échoue, l’application crée un draft minimal (titre + provenance) à compléter manuellement via l'édition.
5. Pendant l’import (URL, texte ou image), l’interface affiche un état d’attente explicite indiquant l’analyse en cours.
6. La provenance (`source`) est conservée pour tout import, même sans URL (ex. image collée).
7. Pour un import Instagram en fallback (sans image locale), l’interface affiche un aperçu embarqué du post/reel à la place de la photo, afin de pouvoir consulter la source pendant l’édition.

### Organisation et recherche rapide

1. Les recettes sont affichées sous forme de grille de vignettes.
2. L’utilisateur peut filtrer par catégorie (`Sucré`, `Salé`) et par favoris.
3. L’utilisateur peut rechercher en texte libre sur `titre + ingrédients`.
4. La liste est triée par défaut : favoris en premier, puis par dernière modification (`updatedAt DESC`).
5. La navigation privilégie l’accès rapide aux recettes fréquemment utilisées.

### Consultation et exécution

1. Les vignettes (cartes) affichent la photo de la recette lorsqu'elle existe.
2. L'écran détail affiche l'image en en-tête, puis ingrédients, quantités, portions et étapes ordonnées.
3. L'utilisateur peut modifier les portions ; les quantités sont recalculées immédiatement.
4. L'utilisateur peut réinitialiser les portions à la valeur de base.
5. Le mode cuisine (anti-veille) est activable uniquement depuis l'écran détail d'une recette ouverte.
6. En mode cuisine, les actions `Précédente` / `Suivante` restent toujours visibles en bas d'écran ; seul le texte de l'étape défile.
7. En mode cuisine, l'image affichée tente d'abord une illustration IA basée sur le texte de l'étape ; l'image recette reste le fallback immédiat.

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
