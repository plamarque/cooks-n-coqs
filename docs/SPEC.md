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
14. Partage d’une recette via le **partage système natif** (Web Share) : texte contractuel **F2** (± image illustrative générée localement) ; destinataire sans app peut lire/cuisiner sans installer ; import côté utilisateur C&C via collage / `share_target` (voir Partage natif).

### Hors périmètre v1

1. Landing / dépôt serveur de **contenu** recette (cache OG, URL de fiche hébergée) comme véhicule de partage.
2. Partage / réception par **QR proximité** (deep link `/r`, Mode A/B, dépôt BFF) — retiré du produit.
3. Fichier joint hors image illustrative Web Share (zip/json/PDF) comme véhicule de partage V1.
4. Transformation vidéo -> recette structurée.
5. Liste de courses intégrée.
6. Synchronisation cloud multi-appareils.
7. Estimation automatique fiable du temps de recette par IA.
8. Transfert P2P / WebRTC / NFC / Bluetooth (reporté hors v1).

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

### Partage natif (OS)

1. Depuis le détail d’une recette, **une seule** action Partager ouvre le partage système natif (Web Share). Pas de partage QR proximité en parallèle.
2. Le payload **texte** suit le contrat **F2** : première ligne = **titre nu** (sans préfixe `Titre:`) ; si les portions **affichées** sur le détail sont connues (après scaling appliqué : `servingsCurrent` s’il est défini et valide, sinon `servingsBase`), une ligne `N portions` immédiatement sous le titre — **N = le nombre visible**, pas la base persistée si l’affichage diffère ; puis en-têtes en ligne seule `Ingrédients:`, `Étapes:`, `Source:` (corps multiligne sous chaque en-tête). Les **quantités** du texte sont celles de la liste détail (déjà scalées à N) ; une saisie portions non appliquée n’entre pas dans le payload ; Partager ne réécrit pas `servingsBase` / `quantityBase`. La ligne portions et `Source:` sont omises si absentes. Sans URL source, le texte porte la fiche **complète** pour cuisiner hors app au nombre affiché. Avec URL http(s), la section `Source:` la mentionne (optimisation) sans remplacer le contenu des autres blocs. À l’import, l’ancien wire (`Titre:` / `Portions:`) reste accepté ; N et quantités du texte reçu deviennent la **base** de la fiche importée.
3. **CTA install** : à l’**émission**, une seule ligne en **tout dernier**, jamais au milieu du texte :  
   `Tu veux garder cette recette ? https://plamarque.github.io/cooks-n-coqs/`  
   À l’**import**, tolérance messagerie : le même CTA peut arriver wrappé (question puis URL Pages sur la ligne suivante) ; ce wrap n’est pas un format d’émission. L’import ignore aussi le CTA historique `…/cookies-et-coquilettes/`. Aucun lien vers une landing ou un dépôt de **contenu** recette.
4. **Image illustrative** (secondaire) : générée **localement** (~1080×1080) — photo principale du plat plein cadre (placeholder sage si absente), bandeau bas **« Recette envoyée via »** suivi du logo visuel C&C (`favicon.svg`) inline (une seule occurrence ; pas d’overlay haut-droite ; sans URL). Le CTA install texte F2 (`Tu veux garder cette recette ?` + URL) reste distinct et n’apparaît pas sur l’image. **Interdit** sur l’image : titre, portions, aperçu d’ingrédients, faux chrome UI (retour, cœur, Cuisiner). La fiche vit dans le texte. Jointe au partage si l’OS accepte un fichier image ; sinon le partage **texte seul** doit réussir. L’ordre des bulles OS (texte vs image) n’est pas contractuel.
5. Critère de succès principal : un destinataire **sans** l’app (ex. messagerie) peut lire et cuisiner depuis le message, sans installer C&C.
6. Un utilisateur qui a déjà C&C peut créer une fiche via **collage** (Nouvelle recette) ou **`share_target`** du même texte F2. Si le texte est reconnu comme F2 (nouveau ou ancien wire), le parse est **local exclusif** : zéro aller-retour BFF pour structurer la fiche ; une `Source:` http(s) du site d’origine est stockée en `source.url` **sans** re-fetch / `importFromUrl`. Le CTA install (question + URL Pages live ou legacy, une ligne ou wrap messagerie en fin de message) est ignoré et n’est jamais traité comme URL de recette. L’image illustrative post-création reste **async best-effort** (échec de génération ≠ échec d’import). Hors F2, le pipeline texte/share BFF existant s’applique. Friction manuelle acceptée ; pas d’import « magique » via dépôt serveur.

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
3. Après une sauvegarde réussie (édition ou création), l’utilisateur arrive sur la vue détail de cette recette, même si les filtres ou la recherche de la liste ne l’afficheraient pas ; une confirmation brève (« Recette modifiée. » / « Recette créée. ») est superposée à la fiche puis disparaît d’elle-même sans action requise ; pendant son affichage, la fiche reste utilisable. En cas d’échec de sauvegarde, l’utilisateur reste sur le formulaire avec l’erreur.
4. La suppression est irréversible après confirmation utilisateur.
5. Pour chaque étape, l'utilisateur peut ajouter ou retirer plusieurs images (fichier ou génération IA comme pour l'illustration recette), ordonner les médias, et ajouter une ou plusieurs URLs vidéo (`http` ou `https`).

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

## Évolution Assistant — fondations locales (story 1.1)

L’accueil peut proposer un Compositeur Assistant distinct du Cahier v1. Il accepte localement du
texte, une URL, une recette collée ou une ou plusieurs images locales : le texte et les images restent en mémoire de
l’interface, sont modifiables et peuvent être retirés indépendamment. Cette fondation ne route, n’importe, ne
sauvegarde ni n’envoie aucune donnée. Les starters ne font que préremplir puis focaliser le champ.

La dictée, lorsqu’elle est fournie par le navigateur, insère seulement une transcription acceptée au
curseur ; aucun audio brut n’est stocké ou transmis. Si elle est indisponible, le texte reste
l’alternative immédiate. Le Cahier conserve ses parcours v1 nommés : création manuelle, import
`.zip`, édition et partage. Les traitements Assistant, prévisualisations et sauvegardes explicites
seront introduits par leurs stories dédiées sans modifier ces contrats v1.

## Import Assistant éphémère (story 1.2)

Depuis le seul Compositeur Assistant, une image est prioritaire sur une URL HTTP(S), elle-même prioritaire sur le texte (dont F2). L'import réemploie le parseur existant mais produit une prévisualisation en mémoire, annulable : ni recette, ni fichier, ni état Assistant n'est écrit dans IndexedDB, l'URL ou `sessionStorage`. Annuler ou fermer détruit la prévisualisation et ignore les réponses tardives tout en conservant texte, curseur et image dans le Compositeur. La sauvegarde explicite est hors de cette story ; les flux v1 `parse → create → détail` restent inchangés.

## Sélection Assistant Jev (story 2.1)

Pour une demande texte libre d’au plus 2 600 caractères, le client envoie au BFF uniquement la demande et un instantané plafonné à 60 recettes (titre, libellés d’ingrédients, durée et référence temporaire). Jev retourne une à trois références à partir de 0,5, ou `noCandidate`; les références sont vérifiées localement avant affichage. Timeout, 429, 5xx ou wire Jev invalide déclenchent un unique secours Luna ; deux échecs donnent `selectionUnavailable`. Une annulation, `noCandidate`, une erreur 4xx ou une réponse tardive ne créent ni ne modifient rien. Les diagnostics ne journalisent que route, phase, issue, classe HTTP et identifiant opaque.

## Précisions conversationnelles Assistant (story 2.3)

Avant toute recherche, création ou parse, chaque entrée (texte, URL, une ou plusieurs images) passe par la sélection d’intention ; une URL ou une image n’est donc jamais un import automatique. Pour chaque image, le BFF produit un résumé visuel temporaire borné ; les résumés sont réunis et remis à Jev et à la génération finale, mais jamais au fil visible, au stockage ou aux diagnostics. Le Compositeur ne propose qu’une action photo, qui ouvre « Prendre une photo » ou « Choisir des images » ; la galerie autorise plusieurs fichiers, la capture est unitaire mais additive. La sélection peut répondre `clarify` avec une question courte et ciblée. Le fil (demande, question, réponse) reste visible et exclusivement en mémoire Vue : il est envoyé au BFF au tour suivant, sans IndexedDB, stockage web ni journalisation de contenu. Deux précisions consécutives au plus sont autorisées côté serveur ; ensuite l’Assistant cherche le Cahier puis propose avec ses hypothèses. Une question ne crée ni brouillon ni vignette. Annuler, fermer le résultat ou démarrer une nouvelle demande détruit ce fil et invalide les réponses tardives.

Jusqu’à cinq images sont préparées localement, une par une et dans leur ordre d’origine, avant toute analyse Assistant. Un JPEG, PNG ou WebP valide déjà sous 4 Mio est conservé tel quel ; les autres formats décodables sont convertis en JPEG, et les images trop lourdes sont réduites par un nombre borné de paliers de dimensions et de qualité jusqu’à 4 Mio maximum sans rendre manifestement illisible une recette. Un échec de décodage ou d’encodage, ou une copie encore trop lourde, arrête le lot avant toute requête BFF avec un message de préparation distinct indiquant le numéro de la photo ; tous les originaux restent au Compositeur et peuvent être retirés ou réessayés. Annuler pendant la préparation empêche tout envoi tardif. Les résumés vision d’un lot sont demandés l’un après l’autre, dans une requête HTTP distincte par image, pour éviter à la fois une rafale fournisseur et une connexion ouverte pendant toute l’analyse du lot. Une indisponibilité ponctuelle du résumé vision est reprise une seule fois côté BFF, image par image, avec une attente courte annulable : les images déjà résumées ne sont jamais renvoyées. Une réponse textuelle du modèle dépassant 240 caractères est raccourcie et reste exploitable, au lieu d’être traitée comme une panne. Après épuisement, le lot échoue explicitement sans créer de recette ni écrire localement ; le texte et les photos restent au Compositeur. L’erreur affiche une référence technique courte sans contenu des photos. Une référence de préparation locale ne correspond à aucune trace BFF, puisqu’aucune requête n’est partie ; les références des tentatives vision envoyées au BFF sont corrélables à ses diagnostics anonymes. Sur mobile, les miniatures forment un rail horizontal distinct au-dessus des actions. Pendant une opération, le calque opaque du Compositeur centre un anneau animé autour du mini-logo C&C, un libellé court et un bouton Annuler secondaire fixe dessous ; le mouvement réduit est respecté.

## Continuité de l’illustration Assistant

L’illustration de la vignette Assistant reste temporaire jusqu’à une action explicite. Pour une recette sur mesure, Sauvegarder prépare hors transaction l’illustration distante, puis écrit dans une unique transaction IndexedDB les fichiers source, l’illustration disponible et la recette normalisée/validée. Toute erreur d’écriture annule l’ensemble et conserve la prévisualisation éditable ; une indisponibilité réseau de l’illustration n’empêche pas la recette et est signalée. Après succès, l’utilisateur arrive sur la fiche DETAIL créée, y compris si les filtres ou un rafraîchissement la masquent. Pour une candidate du Cahier sans image, le premier clic d’ouverture accepte l’illustration déjà générée, l’enregistre une seule fois sur la recette et l’affiche durant l’écriture ; fermer la vignette avant ce clic n’écrit rien. Une image déjà enregistrée n’est jamais remplacée.

Le payload de partage F2 déjà reconnu reste l’exception compatible : son parse est local exclusif, sans sélection ni BFF, conformément au contrat de partage natif.
