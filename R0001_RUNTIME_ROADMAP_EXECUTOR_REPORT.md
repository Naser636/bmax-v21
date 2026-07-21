# R0001 — Runtime Roadmap Executor — Blockage Report

- **Mission**: R0001 — Runtime Roadmap Executor
- **Date**: 2026-07-21
- **Branch**: `mission/fleet-first-exchange`
- **Outcome**: **DIAGNOSIS ONLY — no source code modified.** This report is the single
  deliverable requested by the mission's failure clause: *"produire un unique rapport identifiant
  le blocage précis empêchant cette capacité."*
- **Method**: static inspection of the two execution entrypoints and every pipeline stage, one
  live run of `odg autonomy`, and cross-checking the frozen design (`docs/RUNTIME_AUTONOMY_DESIGN_v1.md`)
  against the actual runtime state (`runtime/generated/*.json`, `runtime/missions/*`, the ledger,
  and the mission history).

---

## 1. Executive summary — the single blockage

> **The Runtime's per-mission executor (`runtime/bin/odg-run.js` → `runtime/core/pipeline-builder.js`)
> is a generic, mission-agnostic pipeline that never loads the mission it was asked to run, produces
> the same output for every mission, and unconditionally self-certifies `SUCCESS`. Because "execute
> mission X" and "execute mission Y" are byte-for-identical operations that always pass, there is no
> real notion of "executing the roadmap mission by mission" — only a replay of the generic pipeline,
> exactly what the mission forbids.**

Everything layered *above* this pipeline is sound:

- the Autonomy Cycle (`src/core/runtime-autonomy.ts`, frozen contract 1.0.0) is a correct,
  deterministic, terminating select→execute→verify→decide→advance loop;
- the completion authority (`ReleaseManager`) and the provider path (`src/providers/*`, which runs
  *real* engineering for missions that declare write scope) are both correct.

But they all ultimately delegate execution to the generic pipeline, and the loop is fed a roadmap
that is already exhausted. So today the "one command" (`odg autonomy`) does **nothing**, and the
manual command (`odg mission <NAME>`) **fakes success for any name**.

---

## 2. Evidence

### 2.1 `odg autonomy` executes zero missions today

Live run (this session):

```
Status     : PLAN_COMPLETE
Cycles     : 0
Released   : (none)
```

The loop selects `the FIRST MASTER_PLAN objective that is (a) in registry.missingCapabilities AND
(b) not in the ledger` (frozen design §2, implemented in `selectNextMission`). Current state:

- `MASTER_PLAN.md` objectives = the 12 capability names (`Mission Loader … Learning Engine`).
- `capability-registry.json.missingCapabilities` = 9 of them (`BusinessContext … Learning Engine`).
- `mission-ledger.json` already contains **all 9** of those names as completed entries.

Intersection `(a) ∧ ¬(b)` = ∅ → `selectNextMission` returns `null` → `PLAN_COMPLETE`. The roadmap
the loop reads is **exhausted**, and the roadmap the CTO actually cares about
(`runtime/system/ROADMAP.md`, layers M0000→M0014) is wired to **neither** entrypoint.

### 2.2 The pipeline ignores the mission it is given

`runtime/generated/mission-plan.json` after running mission `RUNTIME_ROADMAP_SYNC`:

```jsonc
{
  "mission": "RUNTIME_ROADMAP_SYNC",
  "nextObjective": "Mission Loader",               // ← NOT the mission that was run
  "objectives": ["Mission Loader", "ProjectContext Engine", … "Learning Engine"]  // ← generic list
}
```

The `mission` field is stamped, but `objectives`/`nextObjective` are the *same generic capability
list for every mission*. Root cause in `runtime/core/mission-loader.js`:

```js
const mission = process.argv[2];                 // received…
// …but never used to load runtime/missions/<mission>.json
const brain = fs.readFileSync("runtime/brain/MASTER_PLAN.md", "utf8");
plan.objectives   = brainLines;                  // MASTER_PLAN, not the mission
plan.nextObjective = brainLines[0] || null;      // always "Mission Loader"
plan.status = "READY_FOR_EXECUTION";             // always
```

The Mission Loader **never reads `runtime/missions/<MISSION>.json`**. The mission's real
`objectives`, `definition_of_done`, `completion`, and `authorized_paths` are never loaded, so no
stage can act on them.

### 2.3 Validation is hardcoded — it never validates

`runtime/core/validation-engine.js` writes the mission report with a **constant** verdict:

```js
const report = { status: "SUCCESS", validated: true, summary: { …, failed: 0 } };
```

There is no check of the mission's Definition of Done, no comparison against evidence — `validated`
is `true` by construction. Combined with §2.2, **any** mission name is reported `SUCCESS`.

### 2.4 The fraud is already in the trail

`RUNTIME_ROADMAP_SYNC` and `VALIDATION_V3` have **no spec file** in `runtime/missions/`, yet the
history records both as done:

```
- [2026-07-21T12:33:36+00:00] VALIDATION_V3 SUCCESS
- [2026-07-21T12:37:07+00:00] RUNTIME_ROADMAP_SYNC SUCCESS
```

Both ran the generic pipeline and emitted canned `SUCCESS` passports/reports/certificates while
doing **zero mission-specific work**. The append-only ledger is therefore polluted with
"completions" that carry no real evidence — including the 9 capability names in §2.1, which is
*why* the autonomy loop believes the plan is complete.

### 2.5 Execution is not reproducible

`mission-loader.js`, `patch-engine.js`, and `validation-engine.js` each stamp
`new Date().toISOString()` into their generated artifacts. Identical inputs therefore yield
non-identical outputs, violating the Runtime Constitution's `DETERMINISM_FIRST` /
`PIPELINE_IS_REPRODUCIBLE` and the mission's "déterministe, traçable et reproductible" criterion.

### 2.6 Where real execution *does* happen (and why it isn't reached)

The provider path (`AutonomyRuntimeAdapter.runPipeline` → `missionRequiresProvider` →
`createClaudeProvider().execute`) performs *real* engineering (this is how M2/M3/M4 delivered actual
code). But `missionRequiresProvider` returns `true` only when the mission declares `mode` that is
not read-only **and** `authorizedPaths.length > 0`, or `requiresEngineering: true`
(`src/providers/provider-port.ts:182`). The roadmap objectives selected in §2.1 have **no spec
file**, so `authorizedPaths` is empty and the predicate is `false` → the loop would fall back to the
generic pipeline of §2.2–§2.5 anyway. The real executor exists but is never routed to for roadmap
work.

---

## 3. Impacted components

| Component | Role | Defect |
|---|---|---|
| `runtime/core/mission-loader.js` | Load the mission | Ignores `runtime/missions/<MISSION>.json`; emits generic MASTER_PLAN objectives for every mission (§2.2) |
| `runtime/core/validation-engine.js` | Validate the mission | Hardcodes `SUCCESS`/`validated:true`; checks nothing (§2.3) |
| `runtime/core/patch-engine.js` | Produce Patch Plan | Plan derived from a generic project scan, not the mission; non-deterministic timestamp (§2.2, §2.5) |
| `runtime/core/decision-engine.js` | Choose actions | Actions come from repo metrics (todos/fixmes/imports), not the mission contract |
| `runtime/bin/odg-run.js` / `pipeline-builder.js` | Orchestrate stages | Runs the same 12 generic stages regardless of mission; no "no real mission → stop" gate |
| `src/runtime/autonomy-runtime-adapter.ts` `readPlanState()` | Feed the loop a roadmap | Sources an exhausted capability plan; not connected to the official mission roadmap (§2.1) |
| `runtime/generated/mission-ledger.json` | Completion trail | Polluted with generic-replay "completions" (§2.4) — the reason the loop sees the plan as complete |
| `runtime/mission-standard/bin/mse` | Manual runner | Writes canned passport/report/certificate for any name after the generic pipeline (§2.4) |

**Not defective (reuse as-is):** `src/core/runtime-autonomy.ts` (loop), `src/core/release-manager.ts`
(decision authority), `src/providers/*` (real executor), `runtime/core/governance-kernel.js`,
`runtime/bin/odg-verify.js`.

---

## 4. Candidate fixes, ranked by safety

1. **(Safest) Make the Mission Loader mission-driven, and stop on a missing contract.**
   `mission-loader.js` loads `runtime/missions/<MISSION>.json` and populates `mission-plan.json`
   from *its* `objectives`/`definition_of_done`/`nextObjective`. If no contract exists, the pipeline
   **STOPs with a real blocker** instead of replaying generic stages. Localized, backward-compatible
   (existing specs already match the schema the adapter reads), directly kills the "generic replay".

2. **Make validation real.** `validation-engine.js` verifies the mission's `definition_of_done`
   against produced evidence (and the `odg-verify` gates) instead of hardcoding `SUCCESS`. Removes
   the false-positive that lets any mission "pass".

3. **Make execution reproducible.** Replace `new Date().toISOString()` in the three stages with a
   deterministic stamp injected by the caller (e.g. the mission's commit) or drop it from the hashed
   artifact surface. Satisfies `DETERMINISM_FIRST`.

4. **Feed the loop the official roadmap (chosen target design — new explicit manifest).** Introduce
   **one** canonical, machine-readable manifest, e.g. `runtime/governance/ROADMAP.json`:
   ```jsonc
   { "roadmapContractVersion": "1.0.0",
     "missions": [ { "id": "M0000", "contract": "runtime/missions/M0000.json", "requiresEngineering": false },
                   { "id": "M0001", "contract": "runtime/missions/M0001.json" }, … ] }
   ```
   Point `AutonomyRuntimeAdapter.readPlanState()` at it (ordered `missions[]` = `masterPlanObjectives`,
   "missing" = not-yet-RELEASED in a *clean* ledger). This is the single new artifact; it replaces
   the exhausted/ambiguous `MASTER_PLAN.md ∩ registry` source with an explicit, ordered mission list
   whose entries carry real contract refs — so the loop selects the next incomplete roadmap mission
   and routes engineering missions to the real provider path, never the generic pipeline.

5. **Reconcile the ledger.** The autonomy loop reads a ledger polluted by §2.4. A one-time,
   auditable reset of *generic-replay* entries (keeping genuine, evidence-backed releases) is
   required before the loop can see the real roadmap as incomplete. Highest-touch → do last, behind
   human review.

> Note on the frozen contract: `docs/RUNTIME_AUTONOMY_DESIGN_v1.md` freezes the *selection function
> and the six-stage mapping*, not the concrete roadmap **file**. Fixes 1–3 are pipeline-internal and
> touch no frozen contract. Fix 4 changes only which artifact the adapter reads to build
> `AutonomyPlanState` — the pure selection semantics are unchanged, so it stays within the frozen
> design. If reviewers judge otherwise, Fix 4 warrants Autonomy Contract v1.1.0 (never an in-place
> edit of v1.0.0).

---

## 5. Recommended implementation plan (for a follow-up, code-changing mission)

Order chosen to keep every step independently validatable and reversible:

1. **Fix 1 + gate** — Mission Loader loads the real contract; pipeline STOPs (non-zero exit,
   explicit `BLOCKED: no mission contract for <NAME>`) when absent. *Immediately* ends generic
   replay: `RUNTIME_ROADMAP_SYNC`/`VALIDATION_V3`-style runs can no longer fake success.
2. **Fix 3** — determinism: remove wall-clock stamps from hashed artifacts.
3. **Fix 2** — real validation against `definition_of_done` + `odg-verify` gates.
4. **Fix 4** — add `runtime/governance/ROADMAP.json` (the M0000→M0014 sequence, each with a real
   `runtime/missions/Mxxxx.json` contract) and repoint `readPlanState()` at it.
5. **Fix 5** — reconcile the ledger (audited) so the loop sees the true remaining roadmap.
6. **Prove end-to-end deterministically** — run `odg autonomy` on a read-only/local roadmap mission
   (no paid provider call): observe select → contract → pipeline → real validation → Release Manager
   → ledger append → advance, and that a spec-less name now HALTS instead of faking success.

Each engineering (write-scope) roadmap mission then routes to the existing provider path unchanged;
no new executor is built (`REUSE_BEFORE_CREATE`).

## 6. Determinism / governance / backward-compatibility

- **Determinism**: guaranteed by Fix 3 + the already-pure `selectNextMission`.
- **Governance**: completion stays the Release Manager's sole authority; the loop still never judges
  quality. The new manifest is *input*, not a new decision authority.
- **Backward-compat**: public APIs (`AutonomyRuntimePorts`, `ReleaseInputs`, mission JSON schema,
  `odg` CLI surface) are unchanged. Existing `runtime/missions/*.json` already conform to the loaded
  shape.

## 7. Rollback strategy

- Fixes 1–3: single-file stage edits — `git checkout` the three `runtime/core/*.js` files.
- Fix 4: delete `runtime/governance/ROADMAP.json` and revert the one `readPlanState()` change →
  loop returns to reading `MASTER_PLAN.md`.
- Fix 5: the ledger reconciliation must be committed as its own commit with the *pre-reset* ledger
  archived alongside, so `git revert` restores the exact prior trail (`ROLLBACK_MUST_ALWAYS_BE_POSSIBLE`).

## 8. Validation plan

1. A spec-less mission name (e.g. `NO_SUCH_MISSION`) now exits non-zero with an explicit blocker and
   writes **no** `SUCCESS` artifact. *(proves §2.2/§2.4 fixed)*
2. `mission-plan.json.nextObjective` equals the run mission's own next objective, not `"Mission Loader"`.
3. Two consecutive identical runs produce byte-identical generated artifacts. *(proves §2.5 fixed)*
4. A mission whose Definition of Done is not met yields `validated:false`. *(proves §2.3 fixed)*
5. `odg autonomy` on the new roadmap reports `Cycles ≥ 1` and names the mission(s) released, and
   halts with a precise reason on the first real blocker. *(proves §2.1 fixed)*

## 9. Final recommendation

The mission's "last missing link" is **not** the autonomy loop (it already exists and is correct) —
it is that **the per-mission executor is generic and self-certifying, and the loop is fed an
exhausted, wrong roadmap**. Implement Fixes 1→5 in the order of §5 in a follow-up code-changing
mission. Do **not** modify the frozen Autonomy Contract 1.0.0; all recommended changes are either
pipeline-internal or a change of *input artifact* to the adapter. Until Fixes 1–2 land, treat every
existing generic-replay ledger entry (§2.4) as **unproven**.
