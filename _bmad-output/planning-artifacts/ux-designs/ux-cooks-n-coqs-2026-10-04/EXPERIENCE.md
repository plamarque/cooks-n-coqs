---
status: final
updated: 2026-10-04
sources: [brief, prd, forge, architecture-spine, chef-motion-spike]
---
# Experience — Chef C&C
## Foundation
PWA mobile-first ; DESIGN.md est la référence visuelle. Le Chef est un compagnon culinaire local, jamais infantilisant.
## Information Architecture
Accueil Assistant : inspiration puis conversation après première interaction. Cahier : Assistant ouvre la conversation plein écran ; cet écran porte aussi Nouvelle conversation, mémoire/préférences, reprise d'historique et futures tâches planifiées. Fiche et cuisine : invocation contextuelle. En cuisine, la bande ingrédients remonte sous l'en-tête ; carrousel d'étape avec flèches latérales discrètes.
## Voice and Tone
Tutoiement bref, tourné vers l'action. Une recommandation motivée ; deux pistes maximum. Question courte ou photo seulement si nécessaire.
## Component Patterns
Même `ChefConversation` en plein écran ou panneau. Panneau cuisine redimensionnable, rabattable vers bouton flottant, déplaçable ; croix masque définitivement le Chef pour la séance. Focus rendu au contexte hôte à la fermeture ; annonces des réponses et alternatives clavier au déplacement/redimensionnement obligatoires. Messages distincts, fil indépendant de l'étape, champ ancré au bas et clavier/safe areas pris en compte. Recettes sont des cartes interactives persistantes ; les images jointes restent attachées au message envoyé.
## State Patterns
Repos : accueil et après réponse, 9–14 s majoritairement immobile. Écoute après envoi. Réflexion seulement durant traitement court. Proposition avec réponse actionnable. Réussite après action confirmée. Question pour précision nécessaire ou deux voies.
## Interaction Primitives
Nouvelle conversation clôt le fil. Séance cuisine : nouveau fil contextuel. Accueil : reprise du dernier fil pertinent ou nouvelle conversation. Fils locaux datés et supprimables. Toute mutation recette/plan/quantité est une carte typée, prévisualisable et confirmée ; seuls les invariants mémoire explicites s'apprennent silencieusement.
## Accessibility Floor
Animation non nécessaire à la compréhension ; mouvement réduit ; alternatives accessibles au déplacement ; noms accessibles, clavier/toucher ; annulation conserve la saisie.
## Key Flows
Cuisine : Patrice appelle le Chef, décrit une sauce trop épaisse, reçoit une action, rabat le panneau et poursuit l'étape. Il peut masquer le Chef pour la séance.
