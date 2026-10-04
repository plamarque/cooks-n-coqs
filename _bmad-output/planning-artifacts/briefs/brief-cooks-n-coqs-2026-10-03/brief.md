---
title: "Brief produit — Compagnon culinaire Cookies & Coquillettes"
status: final
created: "2026-10-03"
updated: "2026-10-03"
sources:
  - "../../../prds/prd-cooks-n-coqs-2026-10-01/prd.md"
  - "../../../ux-designs/ux-cooks-n-coqs-2026-10-01/EXPERIENCE.md"
  - "../../../architecture/architecture-cooks-n-coqs-2026-10-01/ARCHITECTURE-SPINE.md"
---

# Compagnon culinaire Cookies & Coquillettes

## Résumé

Cookies & Coquillettes évolue d'un Cahier de recettes vers un compagnon culinaire personnel. L'Assistant n'est plus seulement l'accueil qui importe, retrouve ou crée une recette : à terme, il peut être appelé là où la personne cuisine, choisit, ajuste, planifie ou fait ses courses.

Son rôle est d'aider à décider avec plaisir et à cuisiner avec confiance. Il s'appuie sur le Cahier, les préférences que la personne choisit de lui confier, le contexte de l'écran et l'historique utile. Il formule une recommandation claire plutôt qu'une liste anxiogène d'options, tout en laissant la décision et toute écriture à l'utilisateur.

Cette évolution remplace explicitement les limites de l'ancien PRD Assistant repas concernant la mémoire conversationnelle, les préférences apprises, la liste de courses et les suggestions proactives. Elle ne les implémente pas encore : un PRD, une UX et une architecture révisés devront rendre ce mandat cohérent avec le produit local-first.

## Le problème

Une recette seule ne résout pas les moments qui précèdent et entourent la cuisine : ne pas savoir quoi préparer, manquer d'un ingrédient, hésiter entre plusieurs options, adapter les portions, répéter trop souvent les mêmes repas, anticiper la semaine ou faire les courses.

Le Cahier connaît des recettes, mais ne connaît pas encore assez le foyer pour aider naturellement. Les interfaces existantes demandent à la personne de choisir un écran et une action avant de pouvoir exprimer son besoin. Et un assistant générique peut répondre sans contexte, multiplier les alternatives ou oublier les corrections qui devraient rendre la prochaine aide meilleure.

## La solution : un agent spécialisé, présent dans l'application

L'Assistant est un **complice de cuisine quotidien** : chaleureux, concret, visuel et décisionnel. Il ne se présente pas comme une IA générale ni comme un formulaire. Une petite présence visuelle, inspirée du logo et animée avec retenue, le rend reconnaissable sans gêner la cuisine ni l'accessibilité.

Il peut être invoqué par le compositeur, un point d'entrée contextuel ou la voix. Sa réponse dépend du contexte disponible : une recette ouverte, une étape en cours, les portions, les ingrédients, le menu de la semaine ou le Cahier. Une conversation peut continuer après une proposition, afin de demander une variante, corriger une instruction ou orienter autrement la recherche.

### Mandat et personnalité

- Recommander un choix concret quand le besoin le permet ; ne pas masquer l'incertitude ni inventer un stock, une préférence ou une action effectuée.
- Poser au plus une question courte lorsqu'elle change réellement la proposition. Une demande déjà exploitable reçoit une première proposition sans détour.
- Pour une demande vague, proposer au plus deux pistes concrètes, recommander nettement l'une d'elles et garder l'autre comme alternative.
- Lorsqu'une information indispensable manque, poser une question ciblée ou demander une photo plutôt que d'inventer un conseil assuré.
- Rester chaleureux, clair et non jugeant ; ne jamais exposer son raisonnement interne, de scores ou un langage technique.
- Faire de chaque recette une proposition désirable et visuelle, jamais une fiche administrative dans un fil de chat.
- Partir du familier sans enfermer la personne dans ses habitudes : proposer une découverte lorsqu'elle le demande ou selon le niveau d'ouverture choisi.

### Curseur entre intention et mémoire

L'intention présente est le signal principal, mais son poids dépend de sa précision. Une demande explicite — par exemple recevoir cinq personnes pour un coq au vin avec des pommes de terre — limite fortement l'usage des habitudes : elles ne servent qu'à éviter une incohérence manifeste ou à affiner un détail non demandé. À l'inverse, une demande vague, une personne incertaine ou peu d'informations disponibles autorisent le Chef à s'appuyer davantage sur le foyer, les goûts et le garde-manger probable pour orienter deux pistes utiles.

Une mémoire encore pauvre n'est pas une raison de produire une suggestion générique : elle élargit le champ des idées, des ingrédients et des découvertes proposées. Dans tous les cas, mémoire et habitudes restent des indices, jamais des filtres qui empêchent de répondre à l'intention exprimée.

### Capacités par contexte

| Contexte | Aide attendue |
| --- | --- |
| Accueil et import | Comprendre une envie, un texte, une URL, une image ou une voix ; retrouver dans le Cahier, importer ou créer une proposition. |
| Cahier et détail recette | Retrouver, comparer, adapter les portions, proposer une variante ou expliquer une substitution. |
| Édition et import | Corriger ou enrichir une recette avec une proposition réversible ; ne jamais réécrire silencieusement une fiche. |
| Mode cuisine | Bouton flottant et voix pour demander un geste, une substitution, un ajustement de quantité ou une solution de rattrapage, à partir de l'étape active. |
| Planification | Composer ou ajuster les repas de la semaine, avec le temps, les goûts et la variété désirée. |
| Courses | Transformer un menu validé en liste consolidée ; distinguer les achats des ingrédients probablement disponibles. |

## Mémoire, confiance et contrôle

La mémoire rend l'aide meilleure, mais doit être visible, locale par défaut et corrigible. Elle ne doit jamais devenir un profil opaque.

| Mémoire | Exemples | Règle produit |
| --- | --- | --- |
| Préférences explicites | « Choisis huile ou beurre, pas les deux », épicé, moins d'options | Ajoutée ou confirmée par la personne ; éditable et supprimable. |
| Profil du foyer | Nombre habituel de convives, niveau de cuisine, rythme | Paramètres visibles ; sert de défaut modifiable, jamais de contrainte. |
| Goûts et retours | Aimé, pas aimé, à refaire, trop compliqué | Signal lisible et corrigeable ; ne transforme pas un essai isolé en interdiction. |
| Contexte de séance | Recette, étape, portions, ingrédient manquant | Temporaire ; utilisé pour la réponse en cours sans devenir automatiquement une préférence. |
| Garde-manger probable | Produits de base déclarés ou souvent utilisés | Hypothèse affichable : l'Assistant peut dire « à vérifier », jamais affirmer que le produit est en stock. |

L'historique et les apprentissages doivent pouvoir être consultés, corrigés, effacés et désactivés. **[ASSUMPTION]** La première version reste local-first, sans compte ni synchronisation cloud ; la synchronisation future ne sera pas déduite de ce brief.

## Planifier sans moraliser

L'Assistant aide à varier les repas et à tendre vers un équilibre choisi par le foyer. Il peut signaler avec tact une répétition, suggérer une recette plus végétale ou introduire une nouvelle cuisine, sans diagnostiquer, prescrire ni imposer une norme nutritionnelle.

Deux intentions doivent rester simples à choisir : **faire simple / avec mes habitudes** et **me surprendre / découvrir**. Une préférence de découverte (rarement, de temps en temps, souvent) règle la proactivité ; une demande ponctuelle comme « surprends-moi » la remplace. La personnalisation doit augmenter la pertinence sans réduire la diversité choisie.

Les suggestions proactives — par exemple une soupe saisonnière à anticiper ou une recette appréciée à refaire — sont rares, justifiées par un signal lisible, configurables et soumises à l'autorisation de notification. Elles ne doivent pas devenir du bruit ni une pression alimentaire.

## Invariants à préserver

- Le Cahier demeure la source de vérité des recettes persistées ; une proposition, une correction ou un menu ne modifie pas une recette sans action explicite.
- Les données de mémoire et les décisions de planification restent sous le contrôle de la personne ; aucune collecte ou envoi de contenu personnel ne se fait au-delà de ce qui est nécessaire à la capacité demandée.
- L'audio brut n'est pas conservé ; la voix doit toujours avoir une alternative texte et une permission explicite.
- L'application reste utilisable hors ligne pour la consultation, l'édition et les données déjà locales. Les capacités d'analyse distante expliquent leur indisponibilité sans détruire la saisie.
- Les recommandations alimentaires restent de l'aide culinaire générale, sans prétention médicale, ni jugement sur les choix du foyer.

## Première version utile

La première livraison doit prouver le compagnon dans un moment réel de cuisine, pas accumuler les capacités.

1. Identité visuelle de l'Assistant, conversation contextuelle utile et contrat d'agent commun aux surfaces.
2. Préférences explicites locales et profil de foyer minimal : style de décision, épices, nombre de convives et ouverture à la découverte.
3. Invocation depuis le détail et le mode cuisine : portions, substitution, variante et aide de rattrapage dans le contexte de la recette et de l'étape.
4. Toute proposition d'écriture (recette corrigée, préférence, variante sauvegardée) est prévisualisée et confirmée.

La planification hebdomadaire, la liste de courses, le garde-manger probable, la notation et les notifications suivent ensuite, lorsque leurs modèles de données et leurs écrans de contrôle sont explicitement conçus.

## Indicateurs de réussite

- Une personne obtient une aide contextualisée sans devoir retrouver le bon écran ni répéter la recette ou l'étape concernée.
- Une préférence explicitement corrigée se reflète dans une proposition suivante, et peut être revue ou supprimée facilement.
- Les recommandations restent compréhensibles : elles indiquent ce qui est certain, probable ou à vérifier.
- Les personnes qui préfèrent le familier trouvent plus vite une solution ; celles qui veulent découvrir reçoivent réellement de nouvelles pistes.
- Aucun utilisateur ne découvre après coup qu'une recette, une préférence ou une donnée de mémoire a été modifiée sans son accord.

## Décisions à prendre dans la suite

1. Quel niveau d'historique conversationnel est mémorisé, pendant combien de temps et dans quel écran peut-on le gérer ?
2. Comment l'utilisateur distingue-t-il une préférence déclarée, une déduction faible et un contexte temporaire ?
3. Quelle définition personnalisable de la variété et de l'équilibre sera proposée, sans conseil médical implicite ?
4. Quels gestes vocaux sont fiables et pertinents en cuisine, et à quelles plateformes la commande vocale s'applique-t-elle ?
5. Comment une recette ajustée est-elle représentée : variante temporaire, copie ou modification de la recette source ?
6. Quel consentement, quelle fréquence et quels canaux pour les suggestions proactives ?

## Hors périmètre de ce brief

Ce brief ne choisit pas le modèle IA, les prompts définitifs, le protocole des outils, les contrats HTTP, le schéma IndexedDB, la synchronisation, le moteur nutritionnel ou les écrans détaillés. Ces décisions appartiennent au PRD, à l'UX et à l'architecture qui suivront sa validation.
