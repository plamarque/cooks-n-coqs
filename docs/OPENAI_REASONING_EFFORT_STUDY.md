# Étude — `reasoning_effort` pour les appels Chat OpenAI

Date : 2026-09-30. Ce document est une aide à la décision : il ne modifie ni le runtime, ni les modèles, ni les variables Render.

## Périmètre

Le BFF conserve aujourd’hui Chat Completions et la résolution `AI_*` existante : `parse` utilise terra par défaut ; `step_timer`, `reorder` et `extract` utilisent luna. Les sept requêtes Chat omettent `temperature` pour tout modèle résolu. Cette correction est indépendante de toute décision sur `reasoning_effort`.

## Faits sourcés

- La documentation OpenAI indique que `reasoning_effort` (Chat Completions) et `reasoning.effort` (Responses) règlent le niveau de raisonnement ; les valeurs supportées dépendent du modèle. Un effort plus bas favorise vitesse et moindre consommation de tokens, un effort plus haut favorise la complétude. [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)
- Pour GPT-5.6, OpenAI recommande d’employer `gpt-5.6-terra` pour le compromis qualité/coût et `gpt-5.6-luna` pour des volumes efficaces ; les valeurs annoncées sont `none`, `low`, `medium`, `high`, `xhigh` et `max`. [Model guidance GPT-5.6](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6)
- OpenAI recommande Responses pour le raisonnement, les outils et les échanges multi-tours ; le BFF actuel n’utilise ni outils ni conversation multi-tour dans ces sept parcours. [Migration to Responses](https://developers.openai.com/api/docs/guides/migrate-to-responses?lang=javascript&tool-use=chat-completions&update-item-definitions=chat-completions)
- Pour les modèles de raisonnement, les paramètres d’échantillonnage comme `temperature` doivent être retirés lorsque l’effort n’est pas `none`. L’omission déjà appliquée évite donc d’adosser la compatibilité à une valeur particulière d’effort. [Deployment checklist](https://developers.openai.com/api/docs/guides/deployment-checklist)

## Hypothèses à mesurer

- Un effort `none` ou `low` sur luna peut préserver suffisamment les réponses JSON courtes tout en limitant latence et tokens pour `step_timer`, `extract` et `reorder` ambigu.
- Le parsing texte ou capture, plus long et multimodal, peut bénéficier de `low` ou `medium` sur terra ; le gain n’est pas démontré pour les prompts actuels.
- Une montée d’effort peut réduire les JSON invalides ou les incohérences de structure, mais peut aussi augmenter le coût et le délai sans améliorer le draft réellement éditable.

Ces hypothèses ne valent pas comme promesse de compatibilité : le modèle et les valeurs effectivement acceptées doivent être vérifiés par expérimentation contrôlée avant toute configuration.

## Recommandation initiale — non appliquée

| Use-case | Recommandation expérimentale | Motif | Décision runtime |
|---|---|---|---|
| `parse` texte | comparer omission actuelle, `low`, puis `medium` sur terra | structuration complète d’un draft | aucune |
| `parse` capture | comparer omission actuelle, `low`, puis `medium` sur terra | image + ordre des étapes, erreur plus coûteuse à corriger | aucune |
| `extract` temps, catégorie, mentions | comparer omission actuelle et `none`/`low` sur luna | sorties JSON étroites, filet non bloquant | aucune |
| `reorder` ambigu | comparer omission actuelle et `low` sur luna | l’heuristique est prioritaire, le LLM ne traite que l’ambigu | aucune |
| `step_timer` | comparer omission actuelle et `none`/`low` sur luna | réponse scalaire, fallback regex conservé | aucune |

Commencer par l’omission actuelle comme contrôle est essentiel : elle ne doit pas être confondue avec une valeur implicite de `reasoning_effort` documentée pour chaque modèle.

## Protocole d’évaluation avant approbation

1. Constituer un corpus français versionné et anonymisé : 50 textes collés, 30 captures avec accord de test, 20 JSON-LD incomplets, 20 séries d’étapes ambiguës, 30 phrases de timer et 30 cas de mentions. Inclure accents, unités, durées en plage, pronoms, recettes sucrées/salées et entrées sans réponse attendue.
2. Définir avant essai la vérité attendue : JSON parseable ; champs indispensables (`title`, ingrédients ou étapes) ; temps/catégorie valides ; permutation d’étapes sans perte de `id`/média ; timer entre 1 s et 12 h ; ids d’ingrédients existants. Noter aussi le maintien du soft-fail et des heuristiques.
3. Pour chaque use-case, exécuter le contrôle (paramètre omis) et chaque candidat, à modèle, prompt, corpus et température omise identiques. Répéter au moins trois fois les cas sensibles à la variabilité.
4. Enregistrer par requête : succès métier, JSON invalide, fallback déclenché, durée totale et p50/p95, tokens input/output/reasoning/cache lorsqu’ils sont disponibles, et coût par succès. La checklist OpenAI recommande précisément de comparer succès, latence, tokens et coût par tâche réussie. [Deployment checklist](https://developers.openai.com/api/docs/guides/deployment-checklist)
5. N’approuver un changement que s’il améliore significativement le succès ou réduit coût/latence sans régression de fallback sur le corpus. Consigner la valeur, le modèle, les résultats et la décision dans une proposition séparée ; demander l’accord avant toute modification BFF, Render ou migration Responses.

## Décisions à approuver séparément

- ajouter `reasoning_effort` au runtime ;
- modifier les defaults terra/luna ou un override `AI_*` ;
- modifier les variables Render ;
- migrer Chat Completions vers Responses API.

Aucune de ces décisions n’est prise par cette étude.
