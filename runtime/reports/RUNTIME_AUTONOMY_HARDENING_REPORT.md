# ODG Runtime — Autonomy Hardening Report

Objectif : transformer le Runtime en Runtime autonome persistant, corriger l'incohérence
Dashboard / Pipeline / Brain / Capability Registry et rendre `odg autonomy` réellement fonctionnel —
en modifiant le dépôt, sans régresser l'existant.

## 1. Diagnostic (causes racines)

| Symptôme observé | Cause racine identifiée |
|---|---|
| `Pipeline = UNKNOWN`, `Brain = UNKNOWN` | `runtime/generated/runtime-state.json` était **vide** : aucun composant ne le produisait. Le Dashboard lisait `state.pipeline` / `state.brain` d'un fichier jamais écrit. |
| Dashboard toujours `SYSTEM_READY` | `runtime-mission-queue.json` absent + `runtime-status.json` codait en dur `nextMission:"SYSTEM_READY"`. Aucun calcul de « prochaine mission exécutable ». |
| `odg autonomy` → `PLAN_COMPLETE` / `Cycles=0` | `runtime/governance/ROADMAP.json` ne listait que `M0000/M0001/M0002`, **tous prouvés** dans le ledger → `selectNextMission` retournait `null` immédiatement. |
| Capability Registry incohérent | `capability-registry.js` écrivait les objectifs de **la dernière mission** (`execution-plan.json`) comme « missing capabilities » — vue per-mission déguisée en état global (`SELF_ENGINEERING_RUNTIME_KERNEL_1…8`). |
| Contrats sans objectifs | 5 fichiers `obj=0` dans `runtime/missions/`. |
| Missions inexistantes proposées | Aucune validation « exécutable » (contrat + objectifs) avant proposition. |

## 2. Modifications apportées

### Nouveau — source de vérité unique
- **`runtime/core/runtime-model.js`** (nouveau) : `computeRuntimeModel()` déterministe et sans effet
  de bord. Scanne `runtime/missions/*.json`, les classe (exécutable / incomplet / evidence-pack /
  plan d'orchestration / JSON invalide), croise le ledger (missions prouvées), lit roadmap + verify,
  et calcule : `capabilities`, `missingCapabilities`, `queue` (uniquement missions exécutables non
  prouvées, ordre roadmap puis alphabétique), santé `pipeline` et `brain`, `nextMission`.
- **`runtime/bin/odg-state.js`** (nouveau) : le **writer** manquant. Matérialise le modèle en
  `runtime-state.json`, `runtime-status.json`, `runtime-mission-queue.json`,
  `capability-registry.json`, `mission-scan.json` + un rapport lisible
  `runtime/generated/reports/contract-scan-report.md`. Idempotent (seul `generatedAt` varie).

### Dashboard & pipeline cohérents
- **`runtime/bin/odg`** : `odg state` ajouté ; `health`/`dashboard`/`status`/`autonomy` rafraîchissent
  l'état AVANT rendu → plus jamais de `runtime-state.json` vide ni de `SYSTEM_READY` figé. `odg-health`
  reste strictement lecture seule.
- **`runtime/core/capability-registry.js`** (stage pipeline) : ne lit plus `execution-plan.json` ;
  délègue à `runtime-model` → registre **global** cohérent, identique à ce qu'écrit `odg state`.

### Contrats
- **`CLEAN_RUNTIME_WORKSPACE.json`** : complété avec 3 objectifs réels + `definition_of_done` +
  `completion` (mission légitime, intention claire) → devient exécutable.
- Dispositions des contrats non complétables (preuve produite, jamais proposés) :
  - `MASTER_PLAN_V1` → **SKIPPED** (plan d'orchestration, pas une mission feuille).
  - `RUNTIME_PROVIDER_ORCHESTRATOR_M3.pack`, `RUNTIME_PROVIDER_REGISTRY_M4.pack` → **SKIPPED**
    (evidence-packs, pas des contrats de mission).
  - `RETIRE_LEGACY_RUNTIME` → **NEEDS_CONTRACT** : intentionnellement **non** auto-complété car
    destructif (supprime `runtime/mission-standard`) et sa précondition (« plus aucune mission ne
    dépend du fallback `mse` ») n'est pas satisfaite — l'authoring reste une décision humaine.
- Nomination de réparation obsolète `pending/FIX_CLEAN_RUNTIME_WORKSPACE.json` supprimée
  (sa raison « déclare aucun objectif » est désormais fausse).

### Autonomie & checkpoint
- **`runtime/governance/ROADMAP.json`** : les missions réellement exécutables non prouvées ajoutées
  au plan autonome (`CLEAN_RUNTIME_WORKSPACE`, `PROVIDER_ENABLED_SMOKE_V1`, `UNIFY_RUNTIME_EXECUTION`).
  `selectNextMission` retourne maintenant `CLEAN_RUNTIME_WORKSPACE` au lieu de `null`.
- **`src/runtime/autonomy-runtime-adapter.ts`** : `archive()` écrit un checkpoint de reprise
  `runtime/generated/autonomy-checkpoint.json` (best-effort, ne casse jamais une mission réussie).
- **`src/runtime/autonomy-cli.ts`** : affiche le contexte de reprise au démarrage et écrit un
  checkpoint terminal (statut, cycles, missions publiées, halt). Reprise exacte : le ledger exclut
  déjà les missions prouvées, le checkpoint rend cette reprise explicite et auditable.

Le cœur figé `src/core/runtime-autonomy.ts` (autorité de release, `selectNextMission`) n'a **pas**
été modifié : seuls ses **entrées** (roadmap) et l'**adapter** l'entourant l'ont été.

## 3. Vérification

- `npx tsc --noEmit` : **OK**.
- `npm run build` (next build) : **OK**.
- Tests unitaires impactés : `autonomy-local-loop`, `corrective-queue-intake`, `runtime-autonomy`,
  `provider-enabled-mission`, `provider-canonical-contract`, `provider-patch-engine`,
  `mse-canonical-verify`, `release-manager`, `capability-registry`, `runtime-health-dashboard` :
  **tous PASS**.
- Dashboard final : `Pipeline: READY`, `Brain: READY`, `Next Action: CLEAN_RUNTIME_WORKSPACE`,
  `Capabilities: 34 ready / 3 missing`.
- Sélection autonomy : `CLEAN_RUNTIME_WORKSPACE` — stable et déterministe.

## 4. Limites restantes

- **Exécution provider non déclenchée ici.** Les 3 missions de la file requièrent l'Engineering
  Provider (Claude). La *sélection* et le *routage* sont vérifiés de façon déterministe ; un
  `odg autonomy` complet lancera un appel provider réel — non déclenché dans cette session pour ne
  pas engager d'appel payant. En l'absence de provider, la boucle s'arrête désormais avec un
  `EXECUTION_FAILED` explicite (et non un faux `PLAN_COMPLETE`).
- **`PROVIDER_ENABLED_SMOKE_V1` et `UNIFY_RUNTIME_EXECUTION`** avaient échoué la validation
  auparavant (`pending/FIX_*` « Validation Engine failed ») ; la boucle les tentera et, si elles
  échouent encore, s'arrêtera avec un diagnostic réel à traiter.
- **`RETIRE_LEGACY_RUNTIME`** reste `NEEDS_CONTRACT` (décision humaine, destructif — voir §2).
- **Gate `gitClean`** : `odg-verify.js` conserve son TEMP PATCH (`gitClean=true`) ; le churn de
  certificats/passports non résolu n'entre pas dans le périmètre de cette passe.
