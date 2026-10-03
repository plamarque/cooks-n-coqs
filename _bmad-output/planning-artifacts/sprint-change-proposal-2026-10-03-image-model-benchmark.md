# Proposition de changement de sprint — benchmark de remplacement de `gpt-image-1-mini`

**Date :** 3 octobre 2026
**Mode :** batch
**Statut :** proposition — aucune modification de production autorisée par ce document seul.

## 1. Résumé du problème

L’évaluation initiale a comparé `gpt-image-1-mini` à `gpt-image-2`. Patrice a confirmé que Mini était suffisamment fidèle et plus rapide pour les neuf cas, mais `gpt-image-2` n’est pas le candidat de remplacement retenu : le seul candidat crédible à évaluer est `gpt-image-2.5-flare`.

Le benchmark actuellement produit bien un champ `usage` brut dans `manifest.json`, mais la revue HTML n’affiche ni les tokens, ni un coût exploitable. Par ailleurs, le BFF demande aujourd’hui `1024x1024` pour les recettes, ingrédients et étapes, alors que l’ingrédient est rendu à `64x64` dans l’interface.

La situation combine une exigence de produit (remplacer Mini avant son retrait), une lacune de mesure (coût non lisible) et une optimisation potentielle de sortie (taille d’image ingrédient).

## 2. Éléments établis

- Le corpus contient trois cas par usage, soit neuf cas ; le benchmark conserve les prompts, requêtes, dimensions, latences, images et `usage` fournisseur par tentative.
- La page `review.html` affiche aujourd’hui le rendu dans son contexte visuel, le modèle, le statut, la latence, les dimensions et le format ; elle ne présente ni tokens ni coût.
- `buildImageParams()` fixe les trois usages à `1024x1024`.
- L’affichage de référence est `320x320` pour une carte recette, `64x64` pour un ingrédient et `480x270` pour une étape.
- Les dimensions personnalisées de GPT Image 2.5 doivent être des multiples de 16 et leur surface doit atteindre au moins 655 360 pixels. Une miniature `64x64` ne peut donc pas être demandée directement à l’API. `816x816` est le plus petit carré valide (665 856 pixels).
- Le montant réellement facturé n’est pas fourni dans les réponses Images observées. Le benchmark doit donc parler de **coût API standard estimé**, calculé à partir des tokens retournés et d’une table tarifaire versionnée ; il ne doit jamais le présenter comme une facture réelle.

## 3. Analyse d’impact

| Domaine | Impact | Décision proposée |
| --- | --- | --- |
| Epic 3 / 3.1 | Le corpus et l’isolation sont utiles, mais la comparaison et le rapport ne suffisent pas à décider. | Réouvrir 3.1 avec un protocole Mini ↔ Flare et un relevé lisible des usages/coûts estimés. |
| Epic 3 / 3.2 | La décision existante ne peut pas être validée avec un candidat inadapté ni sans coût exploitable. | Refaire 3.2 après le nouveau run, avec une grille de décision explicitement humaine. |
| Epic 3 / 3.3 | La migration ne doit pas être engagée avant la décision. | Annuler l’exécution actuelle ; repartir uniquement après validation de 3.2. |
| PRD | Les FR-M1 à FR-M5 restent valides. | Aucun changement de périmètre PRD : précision de mise en œuvre dans les stories. |
| Architecture / cache | Une taille de sortie fait partie de la génération et donc de la clé de cache ; les images existantes ne doivent pas être touchées. | Toute future taille de production est une configuration explicite par usage ; aucun cache existant n’est purgé ou régénéré. |
| UX | La taille affichée de l’ingrédient est le critère visuel utile. | Revoir les ingrédients à `64x64`, pas seulement à leur taille de sortie. |
| Production / Render | Les variables modèle ne doivent pas changer avant décision humaine. | Aucune variable Render durant l’évaluation ; déploiement et repli restent des gates distincts. |

## 4. Options examinées

### Option A — ajustement direct des stories existantes (recommandée)

Réviser 3.1 et 3.2, laisser 3.3 bloquée jusqu’à la décision humaine, puis relancer la Loop depuis le plan corrigé.

- Effort : moyen.
- Risque : faible à moyen ; les prix devront être explicitement datés et la formule testée.
- Avantage : conserve le corpus, le benchmark et le worktree déjà réalisés, sans fausse conclusion ni migration prématurée.

### Option B — rollback du benchmark existant

Revenir sur 3.1 et supprimer son résultat.

- Effort : moyen.
- Risque : moyen ; perte d’un outil utile et de données comparatives malgré leur cible imparfaite.
- Décision : non retenue. Les résultats Mini ↔ Image 2 restent un point de référence, clairement étiqueté hors décision de remplacement.

### Option C — réduire l’objectif de migration

Conserver Mini jusqu’au retrait sans désigner de remplacement.

- Effort : faible à court terme.
- Risque : élevé ; contredit l’échéance de migration avant le 1er décembre 2026.
- Décision : non retenue.

## 5. Changements détaillés proposés

### Epic 3 — ajout au résumé

**AJOUT :** la décision de remplacement compare obligatoirement `gpt-image-1-mini` et `gpt-image-2.5-flare`. Les résultats d’autres modèles peuvent être conservés comme référence, sans constituer la décision de migration.

### Story 3.1 — remplacer les critères liés à l’exécution et à la revue

**AVANT :**

> le relevé associe à chaque rendu le modèle, la qualité, les dimensions, la latence, les données de coût/usage disponibles et le statut d’erreur ou de succès.

**APRÈS :**

> le relevé associe à chaque rendu le modèle, la qualité, les dimensions demandées et reçues quand disponibles, la latence, les tokens d’entrée et de sortie fournis par l’API, le statut d’erreur ou de succès et le coût API standard **estimé** ;
>
> la table tarifaire utilisée, sa date de vérification et la formule sont versionnées avec le résultat ; une absence de données de tokens rend le coût `indisponible`, jamais `0` ;
>
> la page de revue et le manifeste présentent les mesures par tentative et les agrégats par modèle et par usage, en distinguant explicitement valeurs API, calcul estimé et appréciation humaine.

**AJOUT :**

> le run de décision exécute `gpt-image-1-mini` et `gpt-image-2.5-flare` avec les mêmes prompts, qualité `low` et paramètres de taille actuels ;
>
> un second profil Flare compare pour les ingrédients `1024x1024` et `816x816`, puis les rend tous deux au format de lecture `64x64` ;
>
> l’essai de taille ne modifie pas encore la taille de production et ne compare pas une taille non prise en charge par Mini.

**Rationale :** comparaison de modèle équitable d’abord, évaluation d’optimisation de sortie ensuite ; aucune approximation de facturation.

### Story 3.2 — remplacer le prérequis de décision

**AVANT :**

> un benchmark terminé pour le modèle actuel et les candidats.

**APRÈS :**

> un benchmark Mini ↔ Flare terminé et une évaluation humaine renseignée pour chaque usage ; le rapport sépare strictement qualité humaine, tokens API, coût standard estimé et latence mesurée.

**AJOUT :**

> le rapport conclut par usage : conserver temporairement Mini pendant l’évaluation, retenir Flare à taille actuelle, retenir Flare avec la taille ingrédient optimisée, ou ne pas retenir Flare ;
>
> pour les ingrédients, la décision exige une lisibilité équivalente à `64x64`, l’absence d’artefact et un gain mesuré ou une absence de régression acceptable sur coût et latence ;
>
> aucune conclusion ne prétend comparer la facture réelle ; les taux de régénération ne sont évalués que si des essais de régénération sont effectivement exécutés, sinon ils sont marqués non mesurés.

**Rationale :** rendre la recommandation défendable et éviter de déduire le coût réel d’un tarif théorique.

### Story 3.3 — précondition et périmètre

**AVANT :**

> Given une recommandation de modèle validée pour chaque usage.

**APRÈS :**

> Given une recommandation Mini ↔ Flare explicitement validée par Patrice et, si une taille de production a été retenue, la taille par usage explicitement validée.

**AJOUT :**

> la migration modifie uniquement les variables de modèle et, le cas échéant, les tailles explicitement validées ; elle ne redimensionne, ne purge ni ne régénère une image existante ;
>
> le repli restaure à la fois le modèle et la taille antérieurs par usage.

**Rationale :** empêcher le changement de dimensions d’invalider implicitement la sémantique du cache ou de devenir une migration de médias.

## 6. Protocole opératoire après approbation

1. Réviser les stories 3.1, 3.2 et 3.3 dans `epics.md`, puis réconcilier le suivi de sprint par le mécanisme BMad prévu.
2. Adapter le benchmark : profil de modèle, profil de taille, normalisation des tokens, table tarifaire datée, estimation, agrégats et revue HTML.
3. Exécuter le run de décision : 9 cas × Mini et Flare à paramètres identiques, puis 3 ingrédients Flare à `816x816`.
4. Patrice ouvre `review.html`, examine les cartes recette, icônes ingrédient et illustrations d’étapes, et renseigne l’évaluation humaine.
5. Produire 3.2 : choix par usage, taille éventuelle, repli, limites de coût, et décision explicite de Patrice.
6. Seulement ensuite, reprendre 3.3 dans un nouveau worktree et passer les gates locale → commit → validation humaine → Render → post-déploiement.

## 7. Handoff et critères de succès

| Rôle | Responsabilité |
| --- | --- |
| Patrice | Valide ce changement, exécute le benchmark avec sa clé, apprécie les rendus, autorise ou non la migration et le déploiement. |
| BMad / développeur | Implémente le benchmark révisé et ses tests dans un worktree isolé, sans toucher Render. |
| BMad / revue | Vérifie la formule d’estimation, le marquage non-facture, les tailles demandées et l’absence de changement du cache existant. |

Succès : un rapport reproductible permet à Patrice de comparer Mini et Flare par usage avec qualité, latence, tokens et coût estimé ; l’essai `816x816` établit ou écarte objectivement une optimisation des ingrédients ; aucune configuration de production ni image existante n’est modifiée avant une décision humaine séparée.

## 8. Checklist de navigation

- [x] 1.1–1.3 — déclencheur, problème et preuves établis.
- [x] 2.1–2.5 — Epic 3 seulement ; ajustement direct, pas de nouvel epic ni changement de priorité externe.
- [x] 3.1–3.4 — PRD inchangé ; stories, architecture de génération/cache, documentation et stratégie de tests impactées ; UX de revue à `64x64` impactée.
- [x] 4.1–4.4 — option A retenue ; pas de rollback, pas de réduction MVP.
- [x] 5.1–5.5 — proposition, plan et responsabilités définis.
- [x] 6.1–6.2 — proposition vérifiée ; 6.3–6.5 attendent l’approbation de Patrice.
