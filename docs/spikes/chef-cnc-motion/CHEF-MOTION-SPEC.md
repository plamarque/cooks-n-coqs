# Chef C&C — système de micro-animation v1

## Intention

Le Chef ne doit pas « jouer » pendant que l'on cuisine. Il donne une présence calme : il écoute, cherche, propose, encourage et demande de l'aide. Les mouvements sont compréhensibles sans texte, mais le texte et les pictogrammes restent les sources de sens.

La référence visuelle immuable est la troisième variante de `chef-cnc-character-directions.png` : visage doré, enveloppe vert profond, toque crème, tablier clair, cuillère en bois. Ne pas simplifier le personnage en pictogramme.

## Contrat d'asset pour le développement

Un export aplati ne suffit pas. Le livrable source devra garder, dans les mêmes proportions et textures :

1. corps et tablier ;
2. tête / enveloppe ;
3. yeux ouverts, mi-clos et fermés ;
4. sourcils ;
5. bras gauche ;
6. bras droit et cuillère ;
7. toque.

Les six séquences sont exportées avec fond transparent, aucun personnage coupé, zones de débordement comprises. Une animation est interrompable à tout instant : passage immédiat à l'état suivant, jamais de fin de boucle obligatoire.

## Règles communes

- Rythme : les états actifs bouclent entre 2 et 4 secondes, avec une pause perceptible après le geste. Le Repos suit sa propre règle longue ; pas de mouvement incessant.
- Respiration : montée ou descente inférieure ou égale à 2 % de la hauteur du personnage ; elle cesse pendant les gestes. Au Repos, elle reste à 1 % maximum.
- Clignement : un seul clignement de 120 à 180 ms, irrégulier, jamais synchronisé avec un pictogramme.
- Réduction du mouvement : pose finale fixe, pictogrammes fixes ou absents, aucune transition continue.
- Les pictogrammes sont une ponctuation fonctionnelle : ils ne remplacent ni le texte ni le geste.

## Les six animations

| État | Durée / boucle | Chorégraphie | Pictogramme | Pose réduite |
| --- | --- | --- | --- | --- |
| Repos | 9 à 14 s, durée légèrement variable | 80 à 90 % de la boucle est parfaitement immobile. Un seul clignement rare vers le milieu ou la fin ; au plus un souffle de 1 % pendant 600 ms, jamais les deux au même instant. Regard face, bras et cuillère strictement au repos. | Aucun. | Regard face, bras et cuillère au repos. |
| Écoute | 2,8 s | 0–0,35 s tête vers l'utilisateur ; 0,35–0,7 s inclinaison de 4° ; yeux se posent ; 0,7–2,3 s tenue attentive ; retour souple. | Deux traits dorés apparaissent à 0,3 s, pulsation d'opacité à 1,3 s, disparaissent avant le retour. | Tête légèrement inclinée, traits fixes discrets. |
| Réflexion | 3,2 s | Regard monte d'abord ; tête suit de 2° après 120 ms ; main libre vers le menton ; mini-clignement à 1,9 s ; retour lent à 2,6 s. | `?` doré apparaît avec un léger rebond de 6 px, tient, puis s'efface. | Regard vers le haut, main proche du visage, `?` fixe. |
| Proposition | 2,6 s | Regard vers l'utilisateur ; bras-cuinère avance en arc court, main libre ouvre la paume ; tenue 0,8 s ; retour doux. | Une étoile dorée naît près de la cuillère à l'apogée, suit 12 px du geste, s'efface. | Bras et cuillère légèrement tendus, étoile fixe facultative. |
| Réussite | 2,4 s | Yeux se ferment en sourire ; petit rebond unique de 5 % ; bras se soulèvent de 8° ; réception douce puis pause. Une seule occurrence avant repos. | Deux étincelles très courtes, pas de pluie de confettis. | Sourire, bras légèrement ouverts. |
| Question | 3,0 s | Regard côté puis vers l'utilisateur ; tête s'incline de 5° ; main libre s'ouvre, cuillère reste basse ; maintien invitant. | `?` doré arrive après le regard, oscillation de rotation ±3° très lente. | Tête inclinée, paume ouverte, `?` fixe. |

## Déclencheurs et surfaces — décisions en cours

| État | Où il apparaît | Quand | Où il n'apparaît pas |
| --- | --- | --- | --- |
| Repos | Accueil Assistant ; brièvement après une réponse utile dans une conversation ouverte. | Le Chef est déjà présent et aucune action n'est attendue. | Cahier, fiche recette et mode cuisine avant invocation : ils n'affichent qu'un point d'appel calme. |
| Écoute | Conversation Assistant ouverte, y compris depuis le Cahier ou le mode cuisine après invocation. | Une demande est envoyée, une photo transmise ou une dictée finalisée : très bref accusé de réception avant Réflexion. | Pendant la frappe ordinaire, ou avant que l'utilisateur ait invoqué le Chef sur une fiche / en cuisine. |
| Réflexion | Conversation Assistant ouverte après Écoute. | Recherche ou analyse réelle, notamment une photo ; courte séquence avant réponse. Si le traitement se prolonge, l'interface affiche son attente explicitement sans boucler le Chef indéfiniment. | En arrière-plan, ou comme simple décoration d'une fiche / du Cahier. |
| Proposition | Conversation Assistant ouverte, quel que soit le point d'appel. | Une réponse directement actionnable arrive : recette sur mesure, substitution, variante ou prochain geste. | Message purement informatif, attente ou erreur. |
| Réussite | Conversation Assistant ouverte. | Une action est explicitement confirmée : recette sauvegardée, substitution choisie ou étape marquée faite. Une occurrence, puis Repos. | Après chaque réponse, ou pour une action non confirmée. |
| Question | Conversation Assistant ouverte, après invocation depuis toute surface. | Le Chef a besoin d'une précision ou d'une photo pour aider juste ; il peut aussi présenter deux voies nettes. | Pour une demande dont l'intention est déjà claire, ou pour demander une préférence qu'il peut inférer sans risque. |

## Critères d'acceptation visuelle

- À 1× comme à 0,75×, le bas du tablier et les pieds sont toujours visibles.
- La tête, les yeux et au moins un bras changent réellement entre les poses nécessaires ; aucune séquence ne se résume à un zoom ou une rotation du calque complet.
- Les changements de regard précèdent les gestes de main ou de cuillère de 80 à 160 ms : c'est ce qui rend l'intention lisible.
- Aucun pictogramme n'est présent dans Repos ; aucun n'occupe plus de 20 % de la hauteur du Chef.
- Au Repos, trois boucles successives ne doivent pas produire trois mouvements au même instant : le Chef ne cherche jamais à attirer l'attention.
- En mode réduit, l'intention reste compréhensible par la pose sans distraction animée.

## Validation avant développement

Valider les six séquences sur fond crème C&C, à la taille d'un bouton flottant et à la taille du foyer Assistant. Une prévisualisation par état n'est acceptée que si elle utilise le même asset détouré que le futur produit.
