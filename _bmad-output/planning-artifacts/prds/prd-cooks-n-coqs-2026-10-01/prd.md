---
title: "Évolution PRD — Chef C&C, compagnon culinaire"
status: final
created: "2026-10-01"
updated: "2026-10-04"
source_of_truth_to_update: "docs/SPEC.md"
sources:
  - "../../briefs/brief-cooks-n-coqs-2026-10-03/brief.md"
  - "../../../forge/compagnon-culinaire/forged-idea.md"
---

# Chef C&C — compagnon culinaire

## 0. Décision produit à valider

Faire évoluer l'Assistant repas d'une entrée d'accueil vers le **Chef C&C**, un compagnon culinaire spécialisé et contextuel. Il aide à inventer une recette sur mesure, importer, retrouver, adapter et cuisiner une recette dans les parcours existants. Son succès n'est pas le nombre de fonctions : une personne qui se sent peu inspirée ou peu compétente doit pouvoir avancer avec confiance, sans être jugée.

Ce PRD remplace le périmètre précédent qui excluait mémoire conversationnelle et préférences apprises. Il reste une proposition : aucun changement de runtime, BFF, contrat de domaine ou document normatif n'est autorisé avant sa validation, puis les mises à jour cohérentes de `docs/SPEC.md`, `docs/DOMAIN.md` et `docs/ARCH.md`.

## 1. Problème et promesse

Le Cahier centralise les recettes, mais la cuisine quotidienne commence souvent par une situation imparfaite : une envie vague, peu d'ingrédients, un manque pendant une étape, des invités, une recette qui ne ressemble plus au plan. Les écrans actuels demandent encore de savoir quelle opération choisir avant d'exprimer ce besoin.

Le Chef C&C transforme cette situation en une recommandation concrète et désirable. Il ne joue pas au chef intimidant ni à l'agent généraliste. Il oriente, explique juste assez pour rendre autonome, et reste disponible dans le contexte où l'aide est nécessaire.

### Principes verrouillés

1. **Intention avant profil.** Une demande précise domine les habitudes. Une demande vague ou incertaine permet au Chef de s'appuyer davantage sur le foyer, les goûts, le niveau et le garde-manger probable.
2. **Personnalisation sans enfermement.** Mémoire et habitudes sont des indices, jamais des filtres ; une mémoire pauvre ouvre l'exploration plutôt qu'une suggestion générique.
3. **Conseil orienté.** Le Chef recommande une voie principale avec une raison courte ; sur une demande vague, il ouvre au plus une autre piste concrète.
4. **Incertitude honnête.** Si une information indispensable manque, il pose une question ciblée ou demande une photo plutôt que d'inventer un conseil assuré.
5. **Contrôle visible.** Il peut lire, calculer, proposer et préparer. Toute écriture durable est prévisualisée et confirmée.
6. **Présence contextuelle.** Le Chef rejoint le contexte ; il ne force pas à quitter une recette, une étape ou le Cahier pour demander de l'aide.

## Glossaire

- **Chef C&C** : l'Assistant culinaire spécialisé de Cookies & Coquillettes.
- **Cahier** : l'ensemble local des recettes persistées de la personne.
- **Contexte de séance** : les informations temporaires de l'interaction active, telles que la recette, l'étape et les portions affichées.
- **Mémoire durable** : une préférence, un paramètre de foyer ou un retour que la personne peut consulter, corriger ou supprimer.
- **Prévisualisation** : une proposition éditable qui ne devient persistée qu'après confirmation explicite.

## 2. Parcours de référence

### UJ-1 — Camille n'a pas d'idée et veut réussir ce soir

Camille ouvre l'application, écrit « J'ai des œufs et des épinards surgelés, je suis nulle en cuisine ». Le Chef propose deux cartes simples, recommande clairement l'omelette généreuse en expliquant qu'elle est rapide et utilise déjà l'essentiel, puis garde un gratin doux comme alternative. Camille choisit, ouvre la recette et ne se sent pas interrogée ni abandonnée devant une liste.

### UJ-2 — Camille demande une recette très précise

Camille écrit « Ce soir j'ai cinq invités ; je veux un coq au vin avec des pommes de terre ». Le Chef respecte cette intention précise, sans détourner la proposition selon ses habitudes. Il peut seulement ajuster un détail non demandé, par exemple les portions habituelles, et crée une prévisualisation sauvegardable.

### UJ-3 — Camille cuisine et manque d'un ingrédient

Dans le mode cuisine, Camille touche le bouton flottant du Chef et demande comment remplacer un œuf à l'étape affichée. Le Chef reçoit la recette, l'étape et les portions visibles. S'il doit savoir ce qu'elle a, il pose une question courte ou demande une photo ; il propose ensuite une substitution adaptée sans masquer la recette.

### UJ-4 — Camille corrige le Chef pour l'avenir

Après une proposition, Camille dit « À l'avenir, ne me donne pas deux options huile ou beurre : choisis ». Le Chef accuse réception de la préférence sous une forme discrète et propose de l'enregistrer. Une remarque bornée, comme « pas épicé ce soir », reste seulement dans la séance. Camille peut consulter, corriger ou supprimer ce qui a été retenu.

## 3. Exigences fonctionnelles

### FR-1 — Identité et surfaces du Chef

1. L'accueil et l'import s'appuient sur une même entrée Assistant, avec une identité visuelle reconnaissable inspirée du logo et une animation discrète, respectueuse du mouvement réduit.
2. Le Chef est la surface principale à l'accueil/import ; depuis le Cahier ou une fiche recette, il s'ouvre dans un panneau contextuel ; en mode cuisine, un bouton flottant ouvre une aide courte et refermable au-dessus de l'étape.
3. Chaque invocation conserve le contexte visuel de départ et permet de le retrouver immédiatement à la fermeture.
4. La voix est une entrée facultative ; le texte reste toujours une alternative complète et modifiable avant envoi.

### FR-2 — Compréhension et conversation culinaire

1. Le Chef comprend une demande libre, une URL, un texte de recette, une image ou une voix transcrite, selon les routes d'import déjà définies.
2. Une entrée clairement importable garde la priorité d'import ; une demande libre consulte le Cahier avant la création sur mesure.
3. Une demande suffisamment qualifiée reçoit une première proposition sans clarification superflue. Une demande vague reçoit au plus deux pistes concrètes, dont une est clairement recommandée.
4. Après une carte ou une prévisualisation, la personne peut demander une variante, modifier l'angle, poser une question ou explorer une autre piste dans le même fil.
5. Les réponses sont chaleureuses, concrètes, non jugeantes et sans exposition de chaîne de pensée, score ou jargon technique.

### FR-3 — Création et adaptation sur mesure

1. Le Chef crée une recette française structurée lorsque le Cahier n'offre pas de piste utile ou lorsque la personne demande explicitement une création.
2. Il peut proposer une variante, un remplacement d'ingrédient, une adaptation des portions, une correction ou une aide de rattrapage à partir de la recette et de l'étape courantes.
3. Lorsqu'il manque une donnée indispensable à une adaptation fiable, il pose une question ciblée ou demande une photo.
4. Toute recette nouvelle ou variante durable est une prévisualisation éditable. Elle n'entre dans le Cahier qu'après `Sauvegarder`.
5. Une proposition de modification d'une recette existante montre le changement avant confirmation ; elle ne réécrit jamais silencieusement la recette source.

### FR-4 — Mémoire personnelle contrôlable

1. Le Chef peut exploiter cinq catégories : préférences explicites, profil du foyer, goûts et retours, contexte de séance, garde-manger probable.
2. Il enregistre silencieusement un invariant explicite ou une préférence générale tournée vers l'avenir. Une contrainte temporelle reste temporaire.
3. Lorsqu'il déduit une préférence avec doute, il la retient à faible confiance et ne la consolide qu'avec des signaux convergents ; elle reste visible, corrigible et supprimable.
4. La personnalisation peut être implicite dans une proposition et ne doit pas réciter le profil. À la demande, le Chef explique le signal utilisé et donne accès à sa correction.
5. La personne peut voir, modifier, supprimer ou désactiver les mémoires durables. Le nombre de convives est un défaut modifiable, jamais une contrainte.
6. Le garde-manger probable est présenté comme une hypothèse « à vérifier », jamais comme un stock certain.
7. Le Chef adapte le poids de la mémoire à la précision de l'intention : une demande explicite la limite fortement ; une demande vague l'autorise davantage.

### FR-5 — Accès au contexte et protection des données

1. Pendant une interaction active, le Chef lit automatiquement le contexte affiché : recette, étape, portions et éléments nécessaires de l'écran courant.
2. Lorsqu'il doit consulter plus largement le Cahier, il le fait par un outil explicitement adapté à l'intention ; l'application locale résout la demande et ne renvoie au BFF que le minimum nécessaire.
3. Aucun Cahier complet, audio brut, historique intégral ou profil personnel n'est envoyé par défaut à un service distant.
4. Les diagnostics décrivent la voie générale suivie et l'issue, sans contenu complet de demande ni raisonnement interne.

### FR-6 — Actions, progression et erreurs

1. Le Chef peut librement lire, calculer, proposer et préparer une prévisualisation. Une action de séance réversible peut être appliquée immédiatement ; toute écriture durable est montrée puis confirmée.
2. Toute opération distante ou longue affiche un statut court, compréhensible et annulable. L'annulation préserve la saisie et évite d'afficher un résultat tardif.
3. En cas d'indisponibilité BFF ou d'analyse impossible, l'interface préserve l'entrée et expose le fallback compatible avec le flux concerné ; une indisponibilité n'est jamais interprétée comme une absence de recette.

### FR-7 — Découverte et proactivité consentie

1. Le Chef peut proposer une découverte lorsque la personne le demande ou selon un réglage d'ouverture choisi : rarement, de temps en temps ou souvent.
2. Aucune notification ni suggestion hors application n'est déclenchée par défaut. Un rituel ou service explicitement activé autorise des suggestions configurables.
3. Les suggestions proactives sont des commodités best-effort ; elles ne promettent ni une exécution ponctuelle universelle ni une consultation du Cahier lorsque l'application n'est pas active.

## 4. Hors périmètre de cette première évolution

- Planification hebdomadaire, liste de courses consolidée et inventaire de stock exact.
- Synchronisation cloud, compte utilisateur ou mémoire partagée entre appareils.
- Prescription médicale, diagnostic nutritionnel ou règle d'équilibre alimentaire imposée.
- Audio brut stocké, écoute permanente ou commande vocale sans alternative texte.
- Modification automatique d'une recette, d'une préférence ou d'un profil.

Ces possibilités restent des horizons du brief produit. Elles feront l'objet d'un cadrage séparé une fois le Chef utile dans les parcours existants.

## 5. Exigences non fonctionnelles

### NFR-1 — Local-first, confidentialité et contrôle

- Les recettes persistées restent la source de vérité dans IndexedDB.
- Les mémoires durables sont locales par défaut, visibles, corrigibles et supprimables.
- Les données transmises hors appareil sont réduites à l'intention et au contexte strictement nécessaires à l'outil appelé.

### NFR-2 — Accessibilité et continuité

- Toutes les surfaces du Chef sont exploitables au clavier et au toucher, avec noms accessibles et alternative texte à la voix.
- Les animations respectent `prefers-reduced-motion` et ne sont jamais nécessaires à la compréhension.
- Le Chef ne masque pas durablement une étape de cuisine ni l'action principale de l'écran hôte.

### NFR-3 — Confiance et sécurité culinaire

- Le Chef distingue une certitude, une hypothèse et une donnée à vérifier dans une formulation compréhensible.
- Il ne prétend pas connaître un ingrédient, une préférence ou un stock qu'il n'a pas reçu ou déduit avec une confiance suffisante.
- Les conseils alimentaires restent généraux et non médicaux.

## 6. Mesures de succès

1. Une personne peut obtenir une proposition adaptée sans chercher le bon écran ni répéter le contexte visible.
2. Face à une demande vague, elle peut choisir et cuisiner une piste recommandée sans se sentir submergée.
3. Une préférence explicitement corrigée influence une proposition ultérieure et peut être retirée facilement.
4. Aucune recette, préférence ou modification durable n'est créée sans confirmation explicite.
5. L'aide en mode cuisine permet de résoudre une question sans perdre l'étape active.

### Contre-métriques

- La hausse des propositions ne doit pas augmenter les recettes, préférences ou variantes créées sans compréhension ni confirmation.
- La personnalisation ne doit pas réduire la diversité des propositions choisies ni faire remonter des éléments de mémoire perçus comme intrusifs.
- Le panneau du Chef ne doit pas empêcher l'accès à l'étape, au minutage ou aux actions de cuisine.

## 7. Décisions ouvertes avant UX et architecture

1. Durée et interface de gestion de l'historique conversationnel local.
2. Représentation d'une adaptation : variante temporaire, copie ou modification proposée de la recette source.
3. Signaux exacts qui alimentent le garde-manger probable et leur niveau de confiance visible.
4. Périmètre initial des gestes vocaux et des plateformes supportées.
5. Mécanisme d'explication à la demande d'une personnalisation discrète.

## 8. Alignement avec les sources normatives

- Les règles v1 d'import, provenance, dédoublonnage, portions, édition, partage et mode cuisine restent applicables tant que les documents normatifs ne sont pas réconciliés.
- Les imports issus du Chef suivent la prévisualisation et la sauvegarde explicite validées pour le Compositeur ; les autres entrées v1 ne changent pas sans décision distincte.
- Ce PRD n'implémente ni contrat IA, ni modèle, ni schéma de persistance, ni protocole outil client/BFF. Ces choix relèvent de l'UX et de l'architecture après validation du présent document.
