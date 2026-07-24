# VALIDATE_ROADMAP_PHASES_4_AND_5 — Technical Audit Report

- **Date**: 2026-07-24
- **Branch**: runtime/mission-context-builder
- **Missions audited**:
  - `runtime/missions/ROADMAP_PHASE_4_FLEET_AND_PROVIDERS.json`
  - `runtime/missions/ROADMAP_PHASE_5_ENTERPRISE.json`
- **Method**: static reading of every runtime file on the execution path + **live execution** of both missions (no simulation). All claims below are backed by observed output.

---

## 0. VERDICT

### NON VALIDÉ

Both missions run to `PIPELINE SUCCESS` / `validated: true`, but **as read-only audit missions only**. They never enter real Engineering mode, never enable Fleet, never apply a real patch, and never advance the governance state beyond `CREATED`.

**This is not a runtime bug — it is the correct behaviour for the contracts as written.** The four symptoms are all *gated features* that these two contracts do not opt into. Forcing them into "real Engineering" would require **inventing** engineering scope, authorized paths and concrete file edits that the audit contracts never declare — which the mission charter explicitly forbids (« NE PAS inventer », « ne jamais casser une fonctionnalité validée »). No automatic correction is therefore applied; see §7 for the corrections that *would* be required and why each is out of scope for an automatic, non-inventing fix.

---

## 1. Are the two contracts really executable?

**Yes.** Both are valid JSON, both load, both run end-to-end with exit code 0.

Live evidence (`node runtime/bin/odg-run.js <MISSION>`):

| Mission | Objectives | Patches planned | Validation | Pipeline exit |
|---|---|---|---|---|
| ROADMAP_PHASE_4_FLEET_AND_PROVIDERS | 24 | 24 | `validated: true` / `SUCCESS` | 0 |
| ROADMAP_PHASE_5_ENTERPRISE | 14 | 14 | `validated: true` / `SUCCESS` | 0 |

Both contracts declare `"mode":"IMPLEMENT"` and rich `objectives` / `definitionOfDone` arrays. They are executable; the question is *in which mode*.

---

## 2. Do they satisfy every expectation of the current Runtime?

They satisfy the **read-only / audit** contract shape completely. They do **not** satisfy the **engineering** contract shape, because they omit every field the Runtime uses to detect an engineering mission:

| Field the Runtime keys on | Phase 4 | Phase 5 | Consequence |
|---|---|---|---|
| `requires_engineering` / `requiresEngineering` | absent | absent | not engineering |
| `authorized_paths` / `authorizedPaths` | absent | absent | not engineering, no write scope |
| per-objective `patch` payload (`target` + `content`/`diff`) | absent (plain-string objectives) | absent | patches stay symbolic |

Objectives are plain strings (`"Audit Fleet architecture."`, `"Verify governance."`, …), which the Mission Loader normalizes to `{ id, goal, done_when: [] }` with **no** `patch` field.

---

## 3. Root-cause of each symptom (precise, file-anchored)

### 3.1 Why Engineering stays "no (read-only/local)"

**File**: `runtime/core/mission-loader.js:88-91`

```js
const requiresEngineering =
    spec.requires_engineering === true ||
    spec.requiresEngineering === true ||
    authorizedPaths.length > 0;
```

Neither contract sets `requires_engineering`, neither sets `authorized_paths`, so `requiresEngineering = false`. Line 121 then prints `Engineering: no (read-only/local)`.

The same predicate governs routing in `src/runtime/mission-cli.ts:212` via `missionRequiresProvider()` (`src/providers/provider-port.ts:261`):

```js
export function missionRequiresProvider(mission) {
  if (mission.requiresEngineering === true) return true;
  const mode = (mission.mode ?? "").toUpperCase();
  if (READ_ONLY_MODES.has(mode)) return false;
  return Array.isArray(mission.authorizedPaths) && mission.authorizedPaths.length > 0;
}
```

`requiresEngineering` undefined + `authorizedPaths` empty ⇒ **false** ⇒ the PROVIDER route (RuntimeAutonomy → AutonomyRuntimeAdapter → **ClaudeProviderAdapter**) is never taken.

**Live proof** (`odg mission ROADMAP_PHASE_4_FLEET_AND_PROVIDERS`):
```
Decision   : not migrated → FALLBACK_TO_MSE
```
The mission is neither provider-routed nor in `MIGRATED_MISSIONS` (`src/runtime/mission-migration.ts:23`), so it falls to the deterministic Mission-Standard pipeline — which is read-only by construction.

### 3.2 Why patches are symbolic

**File**: `runtime/core/patch-engine.js:42-77`

A patch becomes `READY_TO_APPLY` (real) only if its objective carries a `patch` payload with a `target` and a `content`/`diff`. With plain-string objectives, `normalizeEdits()` returns `[]`, so every patch is emitted with `status: "PLANNED"` and no `edits`.

**File**: `runtime/core/patch-executor.js:397-408` — a patch with no `edits` falls to the `default` branch and is recorded as `status: "RECORDED"` (a bookkeeping entry), performing **no file modification**. This is by design: the executor comment states "real engineering is performed by the provider path, and read-only/audit objectives are discharged by planning + evidence."

### 3.3 Why Fleet stays disabled

**File**: `runtime/core/fleet-stage.js:35-48` — Fleet is **default-OFF**. It only activates when either:
- env `ODG_FLEET` is truthy (`on/1/true/yes`), or
- `runtime/connectors/fleet-pipeline.json` has `"enabled": true`.

Observed state: `ODG_FLEET` is unset, and `runtime/connectors/fleet-pipeline.json` = `{ "enabled": false, "failOpen": true }`.

**Live proof**:
```
>>> Fleet Bridge
FLEET STAGE
Enabled  : false
Fleet: DISABLED (skipped)
```
Neither contract sets the env var or the config, so Fleet is a deliberate no-op. (Default-off is an intentional, validated safety posture — see `pipeline-builder.js:43-56` and the fleet-stage header comment.)

### 3.4 Why Mission Ledger stays CREATED

**File**: `runtime/core/mission-ledger.js:29` calls `authorizeMission(mission)` **without a current-state argument**.

**File**: `runtime/core/governance-kernel.js:9** — `authorizeMission(mission, currentState = "CREATED")` defaults to `"CREATED"`, and the ledger records `state: governance.currentState` (line 39).

Nothing in the deterministic pipeline ever advances the state machine (`runtime/governance/state-machine.json`: `CREATED → QUALIFIED → … → ARCHIVED`). The transitions exist as data but there is **no code path that writes progression back**. Consequently **every** ledger entry is `state: "CREATED"` — not just phases 4/5.

**Live proof** — all 122 ledger entries, including both phase-4/5 runs, carry `state: "CREATED"`:
```
- ROADMAP_PHASE_4_FLEET_AND_PROVIDERS | state=CREATED | validated=true
- ROADMAP_PHASE_5_ENTERPRISE          | state=CREATED | validated=true
```

This is the one symptom that is a **genuine Runtime limitation** (as opposed to a contract omission): the governance state machine is never driven. It is, however, **global** (affects all missions) and not specific to phases 4/5.

---

## 4. All Runtime files on the execution path (concerned files)

| File | Role in the symptom |
|---|---|
| `runtime/missions/ROADMAP_PHASE_4_FLEET_AND_PROVIDERS.json` | audit contract — no engineering fields |
| `runtime/missions/ROADMAP_PHASE_5_ENTERPRISE.json` | audit contract — no engineering fields |
| `runtime/bin/odg` | launcher; routes `odg mission` → `mission-cli.ts`, falls back to `mse` on exit 3 |
| `src/runtime/mission-cli.ts` | route selection (PROVIDER / LOCAL / FALLBACK) |
| `src/providers/provider-port.ts` | `missionRequiresProvider()` decision |
| `src/runtime/mission-migration.ts` | `MIGRATED_MISSIONS` — neither phase is listed |
| `runtime/mission-standard/bin/mse` | fallback engine; git-clean pre-flight; SUCCESS artifacts |
| `runtime/bin/odg-run.js` | deterministic pipeline runner |
| `runtime/core/pipeline-builder.js` | stage list incl. conditional Fleet stage |
| `runtime/core/mission-loader.js` | computes `requiresEngineering` → read-only verdict |
| `runtime/core/patch-engine.js` | symbolic vs real patch decision |
| `runtime/core/patch-executor.js` | records symbolic objectives as `RECORDED` |
| `runtime/core/fleet-stage.js` | Fleet enable/disable (default off) |
| `runtime/core/governance-kernel.js` | `authorizeMission` defaulting state to CREATED |
| `runtime/core/mission-ledger.js` | records `state: CREATED` unconditionally |
| `runtime/core/validation-engine.js` | evidence gate; vacuous engineering pass |
| `runtime/connectors/fleet-pipeline.json` | `enabled:false` |

---

## 5. Missing dependencies / capabilities

- **No missing npm/build dependency.** `npm run build` → exit 0; `npx tsc --noEmit` → exit 0 (both captured live this run).
- **Missing *contract* declarations** (not code): `requires_engineering`, `authorized_paths`, per-objective `patch` payloads.
- **Missing Runtime capability**: a state-machine *driver* that advances `CREATED → … → ARCHIVED` and feeds the advanced state into the Mission Ledger. The transition table exists; the driver does not.
- **Provider route pre-conditions unmet in this session**: the PROVIDER route requires (a) an engineering contract, (b) a **clean git tree**, and (c) the Claude Provider Adapter to actually spawn. The tree is currently **dirty** (31 entries; 13 tracked non-artifact files incl. `runtime/core/mission-loader.js`, `patch-engine.js`, `patch-executor.js` and several `.bak`/archive files), so `mse [1/5] PRE-FLIGHT` and any provider release gate would `STOP: Git repository is dirty` even if the contracts were engineering contracts. (Consistent with the known clean-tree precondition and `ROOT_CAUSE_RELEASE_GATE` gitClean deadlock.)

---

## 6. Hypotheses verified

| # | Hypothesis | Method | Result |
|---|---|---|---|
| H1 | Contracts unreadable/invalid | JSON parse + load | **False** — both load, 24/14 objectives |
| H2 | Engineering read-only comes from missing `authorized_paths`/`requires_engineering` | read `mission-loader.js`, live `Engineering: no` | **Confirmed** |
| H3 | Missions are provider-routed | live `odg mission` | **False** — `FALLBACK_TO_MSE` |
| H4 | Patches symbolic due to no `patch` payload | read `patch-engine.js` + `patch-execution.json` | **Confirmed** (all `RECORDED`) |
| H5 | Fleet disabled by config/env default-off | read `fleet-stage.js`, live `Enabled: false` | **Confirmed** |
| H6 | Ledger CREATED is hardcoded default | read `governance-kernel.js:9` + `mission-ledger.js:29`, all 122 entries | **Confirmed** (global) |
| H7 | Build/TS broken | live `npm run build` + `tsc --noEmit` | **False** — both exit 0 |
| H8 | Validation is faked | read `validation-engine.js`, inspect `mission-report.json` | **False** — evidence-based; passes vacuously because `isEngineering=false` (line 74: `!isEngineering || scopedChanges>0`) |
| H9 | A minimal, non-inventing auto-fix exists | analysis §7 | **False** |

---

## 7. Corrections that WOULD be required (and why they are not auto-applied)

To make phases 4/5 genuinely engineer, **all** of the following would be needed. Each is rejected for the stated reason:

1. **Add `requires_engineering:true` + `authorized_paths` to both contracts.**
   → Rejected: converts audit missions into engineering missions the author never specified. This is *inventing scope*. Also, with no `patch` payloads, an engineering mission that changes nothing fails the Validation Engine's engineering gate (`validation-engine.js:74,102`), so it would flip SUCCESS → BLOCKED — i.e. it would **break a currently-passing mission**.

2. **Author concrete `patch` payloads for each objective.**
   → Rejected: objectives are verifications ("Verify Dispatcher", "Verify governance"). There is no concrete edit to author without fabricating implementation work — pure invention.

3. **Enable Fleet** (`ODG_FLEET=on` or `fleet-pipeline.json.enabled=true`).
   → Rejected: default-off is a validated safety posture; flipping it globally changes behaviour for every mission, risking regressions the charter forbids.

4. **Route via the Claude Provider Adapter** (real engineering execution).
   → Rejected: requires a clean git tree (currently dirty, §5) and spawns an external, non-deterministic Claude subprocess — cannot be *validated deterministically* within this audit, and the charter forbids simulating a validation.

5. **Wire a governance state-machine driver into the Ledger** so state advances past CREATED.
   → Rejected *as an auto-fix*: this is a genuine improvement but is a **design change** (not a minimal correction), touches validated governance behaviour, and is global rather than phase-4/5-specific. It should be its own scoped, reviewed mission.

None of these can be done automatically without either inventing work or breaking a validated feature. Per the charter, the correct outcome is this report, not a speculative edit.

---

## 8. Deliverables

- **Report**: this file (`runtime/reports/VALIDATE_ROADMAP_PHASES_4_AND_5_20260724.md`).
- **Build**: `npm run build` → **exit 0** (`/tmp/phase45_build.log`).
- **TypeScript**: `npx tsc --noEmit` → **exit 0** (`/tmp/phase45_tsc.log`).
- **Mission 4 result**: `node runtime/bin/odg-run.js ROADMAP_PHASE_4_FLEET_AND_PROVIDERS` → `PIPELINE SUCCESS`, `validated:true`, Engineering `no`, Fleet `DISABLED`, 24 symbolic patches, Ledger `CREATED`.
- **Mission 5 result**: `node runtime/bin/odg-run.js ROADMAP_PHASE_5_ENTERPRISE` → `PIPELINE SUCCESS`, `validated:true`, Engineering `no`, Fleet `DISABLED`, 14 symbolic patches, Ledger `CREATED`.

---

## 9. Final summary

### NON VALIDÉ

**Justification technique**: Les deux missions s'exécutent proprement (`SUCCESS`, build + TypeScript verts) mais **en mode audit read-only**, ce qui est le comportement *correct* du Runtime pour des contrats qui ne déclarent ni `requires_engineering`, ni `authorized_paths`, ni de charge utile `patch`. Engineering reste "read-only/local", Fleet reste désactivé (default-off), les patchs restent symboliques et le Mission Ledger reste `CREATED` — chacun pour une cause précise, prouvée et localisée (§3). Aucune correction automatique n'est possible sans **inventer** une portée d'ingénierie que les contrats d'audit ne spécifient pas, ou sans **casser** une fonctionnalité validée — les deux étant interdits par la charte de mission. La seule anomalie *de code* réelle (Mission Ledger figé à `CREATED`, faute de pilote de machine à états) est globale à toutes les missions et relève d'une mission de correction dédiée, pas d'un patch minimal.
