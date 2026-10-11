---
title: "Sprint Change Proposal — Chef, runtime local à outils"
status: approved
created: "2026-10-11"
trigger: "Après la clôture de 9.2, le routage classifier puis route est jugé trop prescriptif pour la conversation culinaire."
scope: moderate
mode: batch
approved: "2026-10-11"
---

# Chef : runtime local à outils

## 1. Résumé du problème

Les Stories 9.1 et 9.2 sont livrées : elles donnent un contrat de classification fermé et des sorties fiables pour idées, recherche locale et prévisualisation. Leur composition actuelle demande toutefois au modèle de choisir une destination finale avant d'avoir pu consulter les informations locales pertinentes. L'application ajoute alors des règles de routage et des exceptions pour traiter les raffinements conversationnels.

Le problème n'est pas l'absence d'un accès serveur au Cahier. Il est que le Chef ne peut pas **demander** une recherche locale, obtenir un extrait borné, puis décider de la suite du même tour. Les cas attendus — précision après une proposition, adaptation d'une recette, choix entre piste du Cahier et création — risquent donc de multiplier les branches client plutôt que d'utiliser la capacité de jugement du modèle.

Cette correction ne remet pas en cause les garde-fous produit : données et exécution restent locales ; le BFF ne conserve ni fil, ni Cahier, ni profil ; aucune écriture durable n'est automatique.

**Éléments observés**

- La route 9.2 actuelle découpe les issues `idea`, `search`, `create` et `advice` après classification, puis délègue chaque issue à un callback distinct.
- Le routeur contient déjà une exception locale pour une demande explicite de création accompagnée d'une image, signe qu'il doit compenser une décision prise sans tout le contexte utile.
- Le plan Chef et l'architecture existante prévoient déjà des « outils client-médiés » : cette proposition les rend concrets avant les Stories 9.3–9.4, au lieu de prolonger le routeur actuel.

## 2. Analyse d'impact

### Epics et stories

| Élément | Impact | Décision |
| --- | --- | --- |
| Stories 9.1 et 9.2, clôturées | Leurs comportements visibles et leurs contrats de sécurité restent valides. | Ne pas les rouvrir ni les réécrire. Conserver la classification comme compatibilité et signal de planification, pas comme unique décideur final. |
| Story 9.3 | L'adaptation et la variante sont le premier cas qui exige une recette de référence et une consultation locale contrôlée. | Recentrer sur l'exécution d'un tour Chef par outils locaux bornés, avec adaptation temporaire et prévisualisation de variante. |
| Story 9.4 | La clarification et la reprise dépendent de la même boucle de tour. | La faire reposer sur le runtime et ses résultats d'outils, sans créer un second routeur. |
| Epic 6 | Ses invocations contextuelles auront besoin du même protocole. | Préserver son ordre et ses critères ; consommer le runtime d'Epic 9 quand il sera disponible. |
| Epic 7, Story 7.3 | Son intention est exactement le protocole d'outils client-médiés, mais pour profil et préférences. | Ne pas la supprimer ; elle étendra le registre après la preuve de fonctionnement de 9.3–9.4. |
| Epics 1–5 et 8 | Aucun changement de périmètre. | Conserver intacts. |

### Artefacts

| Artefact | Ajustement proposé après approbation | Raison |
| --- | --- | --- |
| `epics.md` | Réviser 9.3 et 9.4 sans changer 9.1–9.2 ni les Epics 1–8. | Faire de 9.3 le premier vertical slice agentique local. |
| `docs/SPEC.md` | Remplacer la séquence de routage Chef par le contrat de tour outillé borné ; conserver import prioritaire et confirmation explicite. | Le comportement de conversation change. |
| `docs/DOMAIN.md` | Ajouter les wires fermés des appels/résultats d'outil et de continuation. | Contrats validables aux deux extrémités. |
| `docs/ARCH.md` | Décrire le runtime PWA, le registre local, la boucle BFF et les limites de tour. | La responsabilité passe d'un routeur final à un orchestrateur local. |
| `docs/WORKFLOW.md` et `docs/DEVELOPMENT.md` | Aucun changement présumé. | Ni workflow produit ni démarrage ne changent à ce stade. |
| `sprint-status.yaml` | Mettre à jour seulement après approbation et génération/validation BMAD. | Le tracker reste un acte distinct. |

### Contraintes d'architecture conservées

- Les entrées manifestement importables (image, URL, recette structurée) gardent leur routage déterministe existant.
- La PWA possède conversation, contexte affiché, Cahier, profil, annulation et états visuels.
- Un outil ne reçoit ni accès général à IndexedDB ni capacité d'appeler le réseau arbitrairement.
- Toute lecture retourne un extrait minimisé ; toute écriture durable passe par une prévisualisation et une confirmation humaine.
- Le modèle ne révèle ni raisonnement interne, ni score, ni prompt ; la personne voit seulement un statut compréhensible et le résultat actionnable.

## 3. Approche recommandée

**Ajustement direct du backlog Epic 9, avec migration progressive du moteur de conversation.**

La PWA devient le runtime du Chef. Elle envoie au BFF le message, le contexte déjà autorisé et les définitions des outils disponibles. Le BFF appelle le modèle et retourne soit une réponse Chef, soit une demande d'outil structurée. La PWA valide cette demande, exécute localement la capacité autorisée, puis envoie seulement son résultat borné au BFF pour poursuivre le même tour.

La boucle est volontairement limitée : au plus deux exécutions d'outils par tour initial, annulation propagée à chaque aller-retour, taille maximale de payload et résultat, et arrêt explicite sur refus/indisponibilité. Les outils initiaux sont :

1. `searchNotebook` — recherche locale en lecture seule, résultat limité à quelques résumés de recettes ;
2. `getRecipeContext` — extrait minimal d'une recette de référence déjà résolue localement ;
3. `prepareRecipePreview` — prépare une demande de prévisualisation, sans écrire ;
4. `proposeSessionAdvice` — formule une action temporaire sur le contexte disponible, sans modifier la recette.

`saveRecipePreview` ne fait pas partie de la boucle : seul le geste humain « Sauvegarder » déclenche le service existant.

Le protocole sera **compatible conceptuellement avec MCP** (outils nommés, schémas d'entrée/sortie, appels et résultats structurés), mais MCP n'est pas une dépendance réseau de cette première tranche. Créer dès maintenant un serveur MCP BFF ferait croire que le BFF peut accéder aux données locales. La frontière utile est le protocole PWA ↔ BFF ; une adaptation MCP ultérieure reste possible si un autre hôte doit consommer les mêmes outils.

### Options écartées

| Option | Verdict | Motif |
| --- | --- | --- |
| Terminer 9.3–9.4 avec le routeur actuel puis refactorer | Écartée | Elle multiplierait les règles de priorité et les scénarios de migration avant d'avoir le premier outil réel. |
| Rollback de 9.1–9.2 | Écartée | Le fil, les sorties sûres, la prévisualisation et le contrat de classification restent utiles comme garde-fous et couverture de régression. |
| Agent autonome côté BFF ou accès BFF direct au Cahier | Écartée | Cela contredirait le local-first, accroîtrait l'exposition de données et contournerait la validation client. |
| Serveur MCP comme prérequis | Différée | Le transport standard ne résout pas le besoin de décision ; il augmente l'intégration avant que le registre local soit éprouvé. |

**Effort : moyen. Risque : moyen.** Le risque principal est une boucle non bornée ou des données trop larges ; il est réduit par le registre fermé, les budgets, des doubles de modèle dans les tests et la conservation du parcours 9.2 en régression.

## 4. Propositions détaillées

### 4.1 Epic 9 — formulation

**ACTUEL**

> Le Chef route chaque tour vers un parcours unique, contextualisé et actionnable.

**PROPOSÉ**

> Le Chef comprend chaque tour, peut consulter par des outils locaux explicitement autorisés le contexte minimal nécessaire, puis produit une réponse ou une prévisualisation actionnable. Le client reste l'orchestrateur, le contrôleur d'accès et la source de vérité.

### 4.2 Story 9.3 — remplacement

**ACTUEL :** « Adapter ou décliner une recette de référence ».

**PROPOSÉ :** « Orchestrer une adaptation par outils locaux bornés ».

La story introduit le runtime local, le registre d'outils fermé, les wires domaine et le relais BFF. Elle démontre le parcours de référence : une recette déjà identifiée est consultée par `getRecipeContext`; le Chef rend soit un conseil temporaire, soit une proposition explicite de variante ; la variante prépare une prévisualisation sans écrire.

Critères supplémentaires :

- un appel d'outil hors registre, invalide, trop large ou arrivé après annulation est refusé localement sans fuite de données ;
- le même tour ne dépasse pas deux appels d'outil ; un refus ou une indisponibilité devient une réponse honnête, pas un contournement ;
- l'adaptation ponctuelle ne modifie jamais la recette source ; la variante reste une prévisualisation jusqu'à `Sauvegarder` ;
- les tests injectent des réponses de planification et prouvent ordre, budget, redaction, annulation et absence d'écriture.

### 4.3 Story 9.4 — remplacement

**ACTUEL :** « Clarifier seulement quand nécessaire et préserver la reprise ».

**PROPOSÉ :** « Chercher, clarifier et reprendre avec le même runtime local ».

La story branche `searchNotebook` et les résultats de refus/indisponibilité sur le runtime. Une clarification conserve l'objectif et les résultats minimisés déjà obtenus ; elle ne relance pas une classification isolée qui ignorerait le tour précédent. Elle préserve les contrats d'annulation, de saisie et de réponse tardive de 4.4.

Critères supplémentaires :

- le Chef cherche localement avant de décider qu'une création est utile quand l'intention le permet ;
- une clarification porte sur une donnée indispensable non disponible via les outils autorisés ;
- une demande d'idée rend une à trois pistes temporaires, jamais une écriture ;
- les données et résultats d'outil non nécessaires ne sont pas placés dans le journal local ni dans les diagnostics.

### 4.4 Architecture et contrats à concevoir avant 9.3

- `ChefTurnRuntime` côté PWA : propriétaire du budget, de l'annulation, de l'état de progression, de la validation d'appel et de la continuation.
- `ChefToolRegistry` côté PWA : unique liste des outils, schémas, limites de données et exécuteurs locaux.
- Wires dans `packages/domain` : `ChefToolCallV1`, `ChefToolResultV1`, `ChefTurnStepV1` et union de réponse finale fermée.
- Endpoint BFF unique de tour outillé : il ne détient aucun état et ne peut que demander un outil déclaré dans la requête ou renvoyer une réponse finale validée.
- Adaptateurs : le routeur/classifieur 9.1–9.2 reste disponible durant la migration, mais le nouveau runtime devient la seule voie pour 9.3 et 9.4. Sa suppression éventuelle est une décision ultérieure fondée sur les tests de régression.

## 5. Plan d'implémentation et handoff

**Classification : modérée — Product Owner, Architecte et Développeur.**

1. **Product Owner + Architecte :** approuver ce change course, puis produire une SPEC courte de runtime avant toute story. Elle fixe les quatre outils initiaux, leurs schémas, budgets, erreurs et états UI.
2. **Développeur :** démarrer une story 9.3 dans un worktree préparé ; réaliser un seul vertical slice d'adaptation avec `getRecipeContext`, conseil temporaire et proposition de variante.
3. **Développeur :** ajouter ensuite `searchNotebook` et reprise/clarification dans 9.4, avec des tests unitaires de runtime et un E2E mobile du raffinement « au Cookeo et sans crème ».
4. **Product Owner + Développeur :** seulement après les contrats approuvés, régénérer et valider le tracker, puis créer les stories/worktrees selon le workflow BMAD.

## 6. Critères de succès

- 9.1 et 9.2 restent intégrées et testées sans régression de leurs sorties visibles.
- Le Chef peut demander une recherche ou un extrait de recette avant de décider sa réponse, sans envoyer le Cahier complet au BFF.
- Un tour annulé, refusé ou hors budget ne produit ni écriture, ni résultat tardif, ni appel supplémentaire.
- Une adaptation de recette reste temporaire ; une variante devient une prévisualisation et une sauvegarde reste un geste distinct.
- Les parcours futurs d'Epic 6 et la Story 7.3 peuvent réemployer le même registre, sans obtenir un accès BFF direct aux données locales.

## 7. Statut de checklist

- [x] Déclencheur, problème et éléments observés
- [x] Impact sur l'Epic 9 et dépendances futures
- [x] Conflits PRD, architecture, UX et contrats normatifs analysés
- [x] Options direct adjustment, rollback et révision MVP évaluées
- [x] Handoff et critères de succès définis
- [!] Approbation explicite de Patrice requise avant toute modification de `epics.md`, des documents normatifs ou du tracker
