---
title: 'Story 9.3 — Introduire ChefAgent et les MCP V1'
type: 'feature'
created: '2026-10-11'
status: 'in-progress'
baseline_commit: '2cf8499c8985a38a25ff28fa50121b691340b166'
review_loop_iteration: 0
context:
  - 'docs/SPEC.md'
  - 'docs/DOMAIN.md'
  - 'docs/ARCH.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Après 9.2, le Chef offre des idées, une recherche Cahier, une preview et du conseil, mais un classifieur puis un routeur déterminent le parcours avant que le modèle n'ait consulté le contexte utile. Le Chef ne peut donc pas raisonner en plusieurs étapes ni choisir des capacités C&C selon le besoin réel.

**Approach:** Introduire `ChefAgent` dans la PWA : boucle multi-tour, `chef-core`, skills C&C et MCP local/BFF. Il valide et route les appels, réemploie les services 9.2 et ajoute l'adaptation sans changer les sorties visibles.

## Boundaries & Constraints

**Always:** `ChefAgent` possède boucle, fil, contexte, recette, annulation et état visuel. `chef-core` fait détecter l'intention, choisir skill/tool si nécessaire et réévaluer ; ce n'est pas un classifieur préalable. Un skill est un manifeste C&C local versionné (instructions, tools permis), sans code ni contenu utilisateur. V1 : `chef-core` et `adapter-une-recette`. Le LLM choisit mais n'exécute ni n'autorise. Le MCP local porte recette, Cahier et preview ; le MCP BFF adapte les services métier existants sans supprimer leurs routes ni exposer clés/endpoints. L'agent poursuit tant qu'il progresse ; arrêt sur finale, annulation, erreur définitive ou absence de progrès. Aucun id local, `File`, blob, profil, Cahier complet, raisonnement, score ou prompt au BFF. Aucune écriture durable sans confirmation.

**Ask First:** Ajouter une capacité de mémoire personnelle/collective, changer les règles de confidentialité ou de confirmation, ou toucher au tracker avant l'approbation de cette SPEC.

**Never:** Charger un skill depuis le réseau ou du contenu utilisateur, donner au BFF un accès direct à IndexedDB ou au réseau arbitraire, persister un état d'agent côté BFF, envoyer une recette entière par défaut, déclencher `saveAssistantPreview` dans la boucle, ou implémenter mémoire personnelle/collective dans cette story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Service 9.2 | Demande d'idée, Cahier, recette ou conseil | L'agent appelle les mêmes services via MCP et réutilise les sorties UI actuelles | Les erreurs gardent les contrats visibles actuels |
| Adaptation | Référence locale et contraintes ; tool MCP valide | L'agent lit l'extrait utile puis conseille ou prépare une variante | Ni id local ni donnée superflue ne quittent la PWA |
| Variante | Finale après contexte autorisé | Preview distincte, sans persistance avant « Sauvegarder » | Échec : ni recette ni image créées |
| Boucle multi-tour | Une étape apporte une information ou capacité utile | L'agent poursuit jusqu'à finale | Stop sur annulation, erreur définitive ou absence de progrès |
| Annulation/tardif | Signal annulé, fermeture de fil ou `requestId` obsolète | Saisie et tours checkpointés restent ; UI à `repos` | Ignorer toute continuation tardive |

### Boucle agentique visée

`App.vue` → `ChefAgent` (skills + MCP local/BFF) → BFF/reasoning model → **finale** → PWA affiche les sorties 9.2

ou :

`App.vue` → `ChefAgent` → BFF/reasoning model → **charge un skill C&C** ou **demande un tool MCP** → MCP local/BFF → résultat minimal → reasoning model, jusqu'à finale.

Le LLM décide du prochain skill ou tool ; `ChefAgent` décide s'il est autorisé et le route. Le BFF ne garde aucun état ; son MCP expose des services externes métier, jamais des clés ou une API brute.

</frozen-after-approval>

## Code Map

- `packages/domain/src/chef-turn-classification.ts:1-62`, `chef-advice.ts:1-64` — contrats 9.2 à adapter vers MCP sans casser les sorties ; garder `.ts`, `.js`, `.d.ts` alignés.
- `apps/bff/src/server.ts:32-40,225-277`, `assistant-client.ts:243-318` — services existants, passerelle reasoning et adaptateurs MCP stateless.
- `apps/web/src/services/assistant-service.ts:110-140`, `utils/assistant-session.ts:54-69,153-155,206-274` — réseau, contexte borné, `requestId` et annulation, fondations de l'agent.
- `apps/web/src/utils/chef-intent-router.ts:41-62`, `App.vue:1335-1757` — capacités/rendu 9.2 à migrer ; `preview-save-service.ts:111-155` reste hors agent.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/domain` — définir skills, catalogues MCP et wires de boucle (`skill`, appel, résultat minimal, finale) ; adapter les contrats 9.2 sans casser leurs sorties et synchroniser les jumeaux.
- [ ] `apps/bff` — préserver les routes existantes ; ajouter passerelle stateless de raisonnement et adaptateurs MCP des services externes métier, avec abort et validation.
- [ ] `apps/web/src/utils/chef-agent.ts`, `chef-skills.ts`, `chef-mcp-local.ts` — créer l'agent PWA multi-tour, ses skills et son MCP local (recherche Cahier, contexte recette, preview), avec détection d'absence de progrès, annulation et redaction.
- [ ] `apps/web/src/services/assistant-service.ts`, `utils/assistant-session.ts`, `App.vue` — faire passer toutes les capacités 9.2 par l'agent en conservant checkpoint, saisie, états et rendu des cartes/previews/conseils.
- [ ] Tests domaine/BFF/web et régression de parité 9.2 — doubles de reasoning model, parcours multi-tour, annulation/tardif, non-écriture et mêmes sorties visibles ; aligner les docs normatifs après approbation.

**Acceptance Criteria:**
- Given les demandes 9.2 existantes, when elles passent par `ChefAgent`, then elles rendent les mêmes idées, recettes Cahier, previews ou conseils avec le même contrôle d'annulation et sans écriture implicite.
- Given une adaptation « au Cookeo et sans crème », when le reasoning model demande les capacités MCP nécessaires, then l'agent poursuit les appels utiles, lit localement le contexte minimal et rend un conseil ou une preview sans modifier la source.
- Given une réponse finale demandant une variante, when le tour finalise, then une preview distincte est proposée et aucune recette, image ou mutation Dexie n'est écrite avant « Sauvegarder ».
- Given une boucle sans progression, une annulation ou une erreur définitive, when `ChefAgent` le détecte, then il arrête le tour, conserve la saisie et ignore toute continuation tardive sans écriture.
- Given les capacités MCP BFF, when elles sont proposées au reasoning model, then elles réemploient des services métier stateless et ne révèlent ni clés ni endpoints bruts.

## Spec Change Log

## Design Notes

Le Chef n'est pas un prompt posé sur un routeur : `ChefAgent` compose skills, mémoire de tour et capacités MCP ; le reasoning model propose la prochaine étape, l'agent contrôle l'accès. La V1 privilégie une parité de capacités 9.2 afin que l'architecture agentique soit utile dès livraison. Les futures mémoires et skills collectifs ne sont pas simulés ici : seuls leurs formats extensibles sont préparés.

## Verification

**Commands:**
- `npm run test:unit --workspace @cookies-et-coquilettes/domain` — expected: validations de wires et plafonds V1 vertes.
- `npm run test:unit --workspace @cookies-et-coquilettes/bff` — expected: endpoint stateless, abort et wire fermé verts.
- `npm run test:unit --workspace @cookies-et-coquilettes/web` — expected: runtime client, non-écriture, annulation/tardif et régressions Chef verts.
- `npm run typecheck` — expected: contrats partagés et consommateurs typés sans erreur.

**Manual checks:**
- Vérifier dans le navigateur qu'une adaptation affichée ne change pas la recette source, que « Créer une variante » reste une preview, puis que l'annulation conserve la saisie et n'affiche aucune réponse tardive.
