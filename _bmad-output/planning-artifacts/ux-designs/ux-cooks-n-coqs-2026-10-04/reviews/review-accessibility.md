# Revue UX — accessibilité et mobile

Date : 2026-10-04  
Périmètre : `DESIGN.md`, `EXPERIENCE.md`, décisions consignées et maquettes de travail.  
Verdict : **à corriger avant finalisation**. Le contrat pose une intention inclusive solide (mouvement non nécessaire, réduction du mouvement, alternative au déplacement), mais il doit rendre ces garanties testables dans les composants et les écrans contraints.

## Constats

### A11Y-01 — Le panneau conversationnel n'a pas encore de contrat de focus ni de sémantique modale

**Sévérité : élevée**

Le même `ChefConversation` doit fonctionner plein écran et dans un panneau cuisine. Le contrat ne dit pas si le panneau bas est un dialogue modal ou une région non modale, où arrive le focus à son ouverture, comment il revient au bouton d'appel lorsqu'il est rabattu/fermé, ni comment les lecteurs d'écran sont informés d'une réponse, d'une attente ou d'une erreur. Sans cette règle, un clavier peut continuer à parcourir l'étape masquée ou perdre son point d'entrée.

**À cadrer :**

- panneau cuisine : région non modale si l'étape doit rester utilisable, avec titre programmatique, bouton « Rabat le panneau » et bouton « Masquer le Chef pour cette séance » ; fermer/rabattre restaure le focus au bouton Chef ;
- conversation plein écran : dialogue/page avec titre, ordre de focus prévisible et retour explicite vers le Cahier ;
- nouveaux messages annoncés via une région `aria-live` polie, une seule fois, sans relire tout le fil ; attente et erreur annoncées textuellement ;
- Échap rabat le panneau (sans masquer le Chef) ; la fermeture définitive garde son action explicite.

### A11Y-02 — Redimensionnement et déplacement sont décrits comme gestuels, sans mécanisme clavier spécifié

**Sévérité : élevée**

Le panneau est « redimensionnable par poignée » et le Chef flottant est « déplaçable au doigt ». La mention générale d'« alternatives accessibles » ne suffit pas à produire un composant testable. Une personne au clavier, au switch control ou avec un geste imprécis doit pouvoir éviter l'obstruction du texte d'étape de façon équivalente.

**À cadrer :**

- tailles nommées accessibles du panneau : compact, moyen, étendu, accessibles depuis une action/bouton avec état courant ; la poignée tactile reste un raccourci ;
- positions nommées du bouton Chef (bas droit par défaut, bas gauche, haut droit…) dans un menu accessible ; « Replacer le Chef » restaure le défaut pour la séance ;
- ni déplacement ni redimensionnement ne peuvent sortir le contrôle du viewport visible ou d'une zone atteignable ;
- l'état choisi est conservé seulement pour la séance, comme prévu.

### A11Y-03 — Le contrat ne protège pas encore le panneau contre le clavier virtuel, les zones sûres et les petits viewports

**Sévérité : élevée**

« Le panneau se recale au-dessus du viewport visible » est la bonne intention, mais pas une règle de mise en page vérifiable. En portrait court, paysage, zoom texte et avec le clavier iOS/Android, la saisie et l'action d'envoi peuvent être masquées ; un panneau étendu peut aussi cacher le texte de l'étape sans laisser un chemin clair pour la consulter.

**À cadrer :**

- dimensionner au `visualViewport` lorsque disponible, avec repli robuste ; respecter `env(safe-area-inset-*)` ;
- conserver champ, envoi, contrôle de rabattement et dernier message utiles visibles au clavier ;
- fixer une hauteur maximale laissant une bande d'étape lisible, sauf lorsque l'utilisateur choisit volontairement le plein écran ;
- vérifier portrait étroit, paysage téléphone, zoom 200 % et taille de police système augmentée.

### A11Y-04 — Les états visuels et les messages doivent être distinguables autrement que par couleur, forme ou animation

**Sévérité : moyenne**

Le contrat exige que les messages du Chef et de l'utilisateur soient « distincts », mais ne fixe pas la redondance non visuelle. Les animations sont bien non nécessaires à la compréhension ; la même exigence doit couvrir auteur, attente, proposition et réussite.

**À cadrer :**

- chaque message expose l'auteur en texte/nom accessible (« Chef C&C », « Toi »), pas uniquement par couleur, alignement ou avatar ;
- les actions d'une proposition portent un verbe et leur conséquence (« Appliquer : détendre avec une cuillère d'eau »), pas seulement une coche ou une étoile ;
- état d'attente, erreur et succès ont une phrase visible et annoncée ; les pictogrammes restent décoratifs ou ont un libellé non redondant ;
- contrastes à vérifier sur toutes les surfaces crème/vert/doré, états désactivés et focus visible, y compris le bouton flottant et les flèches du carrousel.

### A11Y-05 — La fermeture définitive de séance a besoin d'une protection contre l'erreur, sans réintroduire une réactivation intrusive

**Sévérité : moyenne**

La décision produit est claire : la croix masque le Chef jusqu'à la fin de séance et aucun contrôle de réactivation ne reprend l'espace. C'est compatible avec une cuisine calme, mais une croix reste un geste facilement accidentel. Sans confirmation, l'utilisateur perd l'assistance durant la séance ; avec une confirmation mal conçue, il perdrait du temps en cuisine.

**À cadrer :** afficher à la première fermeture une confirmation courte et explicite (« Masquer le Chef jusqu'à la fin de cette séance ? » / « Garder le Chef »), puis mémoriser ce choix de confirmation pour la séance. Après validation, ne pas afficher de point de réactivation dans l'interface, conformément à la décision produit.

### A11Y-06 — Les contrôles du carrousel d'étapes sont trop peu définis pour une utilisation mobile sûre

**Sévérité : moyenne**

Le remplacement des gros boutons par des flèches latérales discrètes améliore la légèreté visuelle, mais risque de réduire les cibles tactiles et de rendre le changement d'étape ambigu aux aides techniques.

**À cadrer :** cibles tactiles d'au moins 44 × 44 CSS px, libellés « Étape précédente » / « Étape suivante », indication programmatique et visible de l'étape courante (« Étape 3 sur 5 »), et prévention d'un changement involontaire quand le panneau ou le Chef recouvre la zone.

## Points déjà solides

- Repos long, majoritairement immobile, et mouvement réduit prévu : la présence ne devient pas une distraction.
- Les animations ne portent pas seules le sens ; le contrat prévoit pose et texte/pictogrammes alternatifs.
- Le Chef n'est pas visible avant invocation sur les surfaces de lecture/cuisson, ce qui limite la charge cognitive.
- Le fil est indépendant de l'étape et la saisie reste ancrée : bonne base pour éviter de perdre la tâche culinaire.

## Vérifications à prévoir en implémentation

1. Lecteur d'écran (VoiceOver et TalkBack) : ouverture, réponse, erreur, rabattement, fermeture de séance, nouvelle conversation.
2. Clavier seul : parcours complet, focus visible, raccourci Échap et restitution de focus.
3. Toucher : cibles, déplacement limité, redimensionnement, une main et portrait/paysage.
4. Préférences : `prefers-reduced-motion`, zoom 200 %, police système agrandie, contraste et mode sombre si l'application le supporte.
