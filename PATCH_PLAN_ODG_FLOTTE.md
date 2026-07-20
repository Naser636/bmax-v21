# PATCH PLAN — Communication ODG ↔ Flotte (agents, dont Claude)

## 0. Objectif & périmètre
Rendre **opérationnel et fiable** un cycle complet de communication ODG → agent → réponse → mise à jour du Runtime, en réutilisant au maximum l'existant. **Strict nécessaire**, aucun refactoring global, aucune fusion avec le socle TypeScript `src/runtime/*`.

## 1. Constat de l'existant
La communication est **amorcée mais non opérationnelle**. Un flux fichier-based *semi-manuel* existe dans `runtime/llm/`, mais **le transport manque** : la réponse de l'agent est aujourd'hui collée à la main en `argv`, et aucun de ces scripts n'est câblé dans un pipeline (vérifié : zéro invocation).

Cycle actuel, décousu :
`engineering-brief-builder.js` → `engineering-brief.json` + `generated/llm/patch-request.md` … **[trou : envoi/réception]** … `response-parser.js '<json>'` (collé main) → `proposal.json` → `proposal-analyzer.js` → `review-report.js` (`humanDecision: PENDING`).

## 2. Composants déjà disponibles & réutilisables (à NE PAS réécrire)

| Composant | Rôle réutilisé |
|---|---|
| `runtime/llm/engineering-brief-builder.js` | Construit la charge utile sortante (mission, actions, contexte) |
| `runtime/generated/llm/patch-request.md` | Gabarit d'instruction pour l'agent (contrat de tâche) |
| `runtime/llm/response-parser.js` | Valide la réponse (`mission/summary/actions`) — validation entrante |
| `runtime/llm/proposal-analyzer.js` / `save-proposal.js` / `review-report.js` | Analyse / persistance / rapport de revue |
| `runtime/llm/llm-config.js` | `timeout`, `fallbackModel`, `maxTokens` — paramètres de fiabilité (aujourd'hui inutilisés) |
| `runtime/core/governance-kernel.js` | Autorise l'échange avant application (`authorizeMission`) |
| `runtime/core/mission-ledger.js` *(M0015)* | Preuve append-only de chaque échange |
| `runtime/core/pipeline-builder.js` + `runtime/bin/odg-run.js` | Orchestration / point d'intégration |
| `runtime/core/patch-engine.js` / `patch-executor.js` / `validation-engine.js` | Application de la proposition → mise à jour du Runtime |

*Hors périmètre :* socle TypeScript `src/runtime/` (`mission-dispatcher.ts`, `event-bus.ts`, `runtime-agent.ts`…), non câblé au pipeline JS actif — non fusionné.

## 3. Composants manquants (strict nécessaire)
1. **Contrat d'enveloppe** request/response commun — inexistant.
2. **Registre de la flotte** — agents, adressage, capacités (dont `claude`).
3. **Transport / boîte aux lettres fichier** (le trou central) — inbox/outbox corrélés par `requestId`.
4. **Fiabilité** — `requestId`, cycle de statut, `timeout`/`retry`/`fallback`, gestion d'erreur, traçabilité `mission-ledger`.
5. **Câblage** — point d'entrée `runtime/bin` rendant le cycle exécutable de bout en bout.

## 4. Interfaces d'échange ODG ↔ agents

**Transport : boîte aux lettres fichier** (déterministe, sans réseau, compatible avec un agent Claude lisant/écrivant des fichiers).

```
runtime/generated/fleet/requests/<requestId>.json     # ODG → agent
runtime/generated/fleet/responses/<requestId>.json    # agent → ODG
runtime/connectors/fleet-agents.json                  # registre de la flotte
```

**Enveloppe de requête :**
```json
{ "requestId": "<mission>-<seq>", "agent": "claude", "status": "PENDING",
  "mission": "...", "createdAt": "...", "timeoutMs": 60000, "attempt": 1,
  "brief": { "...engineering-brief.json..." }, "instruction": "<patch-request.md>" }
```

**Enveloppe de réponse (écrite par l'agent) :**
```json
{ "requestId": "<même id>", "agent": "claude", "status": "ANSWERED",
  "answeredAt": "...", "proposal": { "mission": "...", "summary": "...", "actions": ["..."] } }
```

**Cycle de statut :** `PENDING → DELIVERED → ANSWERED → VALIDATED → APPLIED` (ou `TIMEOUT` / `FAILED`), chaque transition consignée dans le `mission-ledger`.

**Registre de flotte (`fleet-agents.json`) :**
```json
{ "agents": [ { "id": "claude", "kind": "file-mailbox", "capabilities": ["patch-proposal"], "enabled": true } ] }
```

## 5. Cycle complet d'une demande
1. **ODG → requête** : `odg-dispatch.js` construit le brief (réutilise `engineering-brief-builder`), génère un `requestId`, écrit `requests/<id>.json` (`PENDING`), journalise (`mission-ledger`).
2. **Remise** : statut → `DELIVERED` ; l'agent détecte la requête en attente.
3. **Agent → réponse** : l'agent (Claude) écrit `responses/<id>.json` (`ANSWERED`).
4. **ODG ← réception** : `odg-collect.js` lit la réponse corrélée par `requestId`, valide (`response-parser`), persiste (`save-proposal`), analyse (`proposal-analyzer`), produit le `review-report`, statut → `VALIDATED`. Sans réponse avant `timeoutMs` → `TIMEOUT` + `retry`/`fallback` (`llm-config`).
5. **Gouvernance** : `governance-kernel.authorizeMission` conditionne l'application ; sinon `FAILED`.
6. **Mise à jour Runtime** : proposition validée → `patch-engine → patch-executor → validation-engine` ; statut → `APPLIED` ; preuve finale au `mission-ledger`.

## 6. Fichiers à créer / modifier

| Action | Fichier | Rôle |
|---|---|---|
| **CRÉER** | `runtime/connectors/fleet-agents.json` | Registre de la flotte |
| **CRÉER** | `runtime/core/fleet-envelope.js` | Contrat + helpers (build/validate enveloppe, `requestId`, statuts) |
| **CRÉER** | `runtime/core/fleet-dispatcher.js` | ODG → requête (réutilise `engineering-brief-builder`) |
| **CRÉER** | `runtime/core/fleet-collector.js` | Agent → réponse (réutilise `response-parser`, `proposal-analyzer`, `mission-ledger`) |
| **CRÉER** | `runtime/bin/odg-dispatch.js` | Point d'entrée émission |
| **CRÉER** | `runtime/bin/odg-collect.js` | Point d'entrée réception |
| **CRÉER** | `runtime/connectors/FLEET_PROTOCOL.md` | Documentation du contrat d'échange |
| **MODIFIER** | `runtime/llm/llm-config.js` | Ajout additif d'un bloc `fleet` (chemins inbox/outbox, retry) — pas de réécriture |

*Aucune modification de `governance-kernel`, `mission-loader`, `mission-ledger`, `patch-*`, `odg-run`, `pipeline-builder` : uniquement réutilisation.*

## 7. Validations à prévoir
- `node --check` sur chaque fichier créé/modifié.
- **Contrat** : enveloppes valides acceptées, champs manquants rejetés (logique `response-parser`).
- **Cycle bout-en-bout simulé** : `odg-dispatch.js <mission>` crée `requests/<id>.json` (`PENDING`) ; dépôt d'une `responses/<id>.json` de test ; `odg-collect.js` corrèle, valide, produit `review-report.json`, journalise → statuts `PENDING→…→VALIDATED` vérifiés.
- **Fiabilité** : absence de réponse → `TIMEOUT` ; mauvais `requestId` → rejeté ; JSON corrompu → échec propre sans corruption d'artefact.
- **Idempotence / immutabilité** : rejouer la collecte ne duplique pas l'application ; `mission-ledger` reste append-only.
- **Non-régression** : `odg-run.js` sort toujours en `SUCCESS` (dispatch/collect hors pipeline principal).
- *Hors périmètre* : `next build` / `tsc` (runtime JS pur, non couvert par `tsconfig`).

## 8. Risques & mesures

| Risque | Mesure |
|---|---|
| Fusion accidentelle avec `src/runtime/*.ts` | Explicitement hors périmètre |
| Blocage du pipeline si un échange échoue | Dispatch/collect en points d'entrée séparés ; erreurs non bloquantes |
| Application d'une proposition non autorisée | Passage obligatoire par `governance-kernel` avant `patch-executor` |
| Réponses orphelines / mauvaise corrélation | `requestId` unique + validation stricte |
| Dérive de périmètre | 7 créations + 1 ajout additif ; aucun refactoring |
| Rollback | Branche dédiée + sauvegarde de `llm-config.js` avant modification |

## 9. Séquence post-validation (à ton feu vert uniquement)
1. Branche dédiée (`mission/fleet-communication`)
2. Sauvegarde de `llm-config.js`
3. Création des 7 fichiers + ajout additif au config
4. Validations §7
5. Rapport d'exécution avec preuves (statuts, ledger, sorties de commandes)
