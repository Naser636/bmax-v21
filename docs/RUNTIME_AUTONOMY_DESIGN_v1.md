# Runtime Autonomy — Architecture Design

- **Design version:** v1.0 (FROZEN)
- **Master Plan alignment:** enables `MODE=AUTONOMOUS_FACTORY` (runtime/brain/MASTER_PLAN.md)
- **Classification:** Capability (NOT a new engine) — *Autonomy Cycle*
- **Owning engine:** Runtime (decision authority delegated to Governance)
- **Autonomy Contract Version:** `1.0.0`
- **Status:** FROZEN
- **Scope:** Architecture only. No code. No new foundation. Reuses existing primitives exclusively.

---

## 0. Constitutional grounding

**EDG Constitution (`docs/CONSTITUTION_EDG_v1.md`)**
- Principle 1 — *No new engine after v1.0.* → Autonomy is a **Capability**, not a tenth engine.
- Principle 2 — *Every feature is a Capability or an extension of an existing engine.* → Autonomy
  extends the **Runtime** engine's own operation (running missions) and reuses **Governance** as the
  decision authority.
- Principle 3 — *Patrimony = decisions, capabilities, proofs — never prototypes.* → The cycle produces
  ledger entries, certificates and release records only; it invents nothing.

**Runtime Constitution (`runtime/constitution/runtime-constitution.json`)**
- `DETERMINISM_FIRST` · `REUSE_BEFORE_CREATE` · `EVIDENCE_REQUIRED` ·
  `ONE_RESPONSIBILITY_PER_COMPONENT` · `ARTIFACTS_ARE_IMMUTABLE` ·
  `ROLLBACK_MUST_ALWAYS_BE_POSSIBLE` · `PIPELINE_IS_REPRODUCIBLE`.

**Runtime Brain RULES (`runtime/brain/MASTER_PLAN.md`)**
- *Never invent architecture.* · *Never modify frozen foundations.* · *Human validates structural
  decisions.* · *Stop immediately on error.* · *Produce evidence.* — these bound the loop's authority.

**Founding invariant (inherited from the Release Manager).**
> The Autonomy Cycle never judges software quality and never decides completion on its own. It
> orchestrates existing components and defers the RELEASE / NO_RELEASE decision entirely to the
> **Release Manager**, and the state transition entirely to the **Governance Kernel**.

---

## 1. Purpose and single responsibility

The Runtime Autonomy Capability performs exactly one act:

> **Deterministically chain the existing per-mission components into a self-driving cycle** that
> selects the next mission, generates its contract, executes it, verifies its evidence, obtains a
> completion decision, and advances to the next mission — until the Master Plan is exhausted or a
> blocking gate halts it.

It owns no other responsibility (`ONE_RESPONSIBILITY_PER_COMPONENT`). It does **not** implement
mission selection heuristics of its own, does **not** execute build/tests, does **not** judge
quality, and does **not** persist anything the underlying components do not already persist. It is
**pure orchestration over existing parts**.

### 1.1 What already exists (reuse map — no new foundation)

The execution of a **single** mission is already fully implemented and green (verified: `odg-run.js`
→ `PIPELINE SUCCESS`). The deterministic pipeline
(`runtime/core/pipeline-builder.js`) chains, in order:

| # | Stage | Component | Output (evidence) |
|---|-------|-----------|-------------------|
| 1 | Mission Interpreter | `runtime/core/mission-interpreter.js` | `mission-interpretation.json` |
| 2 | Mission Loader | `runtime/core/mission-loader.js` | `mission-plan.json` (objectives, nextObjective) |
| 3 | Execution Planner | `runtime/core/execution-planner.js` | `execution-plan.json` |
| 4 | Capability Registry | `runtime/core/capability-registry.js` | `capability-registry.json` (missing capabilities) |
| 5 | Knowledge Engine | `runtime/core/knowledge-engine.js` | `knowledge.json` |
| 6 | ProjectContext (cond.) | `runtime/core/project-context-engine.js` | `project-context.json` |
| 7 | Fleet Bridge | `runtime/core/fleet-stage.js` | fleet envelopes |
| 8 | Decision Engine | `runtime/core/decision-engine.js` | `decision.json` (actions) |
| 9 | Patch Engine | `runtime/core/patch-engine.js` | `patch-plan.json` |
| 10 | Patch Executor | `runtime/core/patch-executor.js` | applied patches |
| 11 | Validation Engine | `runtime/core/validation-engine.js` | `mission-report.json` (validated) |
| 12 | Mission Ledger | `runtime/core/mission-ledger.js` | `mission-ledger.json` (append-only) |

Governance authority is already implemented: `runtime/core/governance-kernel.js` +
`runtime/governance/state-machine.json` (lifecycle `CREATED → … → VERIFIED → RELEASED → ARCHIVED`).
Evidence-completeness certification is already implemented: the **Documentation Engine**
(`src/core/documentation-engine.ts` → `DocumentationProof`) and the **Release Manager**
(`src/core/release-manager.ts` → `RELEASE | NO_RELEASE`). External verification is already
implemented: `runtime/bin/odg-verify.js` → `{ build, typescript, gitClean }`.

A **single-objective executor cascade** already exists in the TypeScript layer and each link takes
one `{ objective, missionId, missionName }`:
`RuntimeAutopilot → RuntimeSupervisor → RuntimeGovernor → RuntimeDirector → RuntimeOS → RuntimeHost
→ RuntimeShell → … → MissionController → RuntimeExecutor` (`src/runtime/*.ts`).

### 1.2 The only gap (what Autonomy adds — as a Capability, not a foundation)

None of the components above **selects** the next mission (today it comes from `process.argv[2]`, a
human) or **loops** across missions. The Autonomy Capability supplies exactly two thin,
deterministic pieces and **nothing else**:

1. a **Mission Selector** — a pure function over already-persisted evidence, and
2. an **Autonomy Cycle Controller** — a loop that wires the existing stages together and defers every
   decision to existing authorities.

Both are Capabilities/extensions (Constitution principle 2). Neither introduces a new engine, state
machine, persistence format, or constitution (`REUSE_BEFORE_CREATE`).

---

## 2. The six autonomy stages → existing components

Every stage maps onto a component that already exists. The Capability writes the glue, never the
parts.

### Stage 1 — Select the next mission (deterministic)

**Inputs (all already persisted):**
- `runtime/brain/MASTER_PLAN.md` → ordered `NEXT_OBJECTIVES` (human-authored, the only source of new
  work — honours *never invent architecture*). Parsed today by Mission Loader into
  `mission-plan.json.objectives`.
- `runtime/generated/mission-ledger.json` → append-only set of already-completed missions.
- `runtime/generated/capability-registry.json` → `missingCapabilities` (objectives not yet available).

**Selection function (pure, total, deterministic):**
```
selectNextMission(masterPlanObjectives, ledger, registry) →
    the FIRST objective, in Master Plan order, that is
      (a) still in registry.missingCapabilities   (not yet delivered), AND
      (b) not already RELEASED/ARCHIVED in the ledger
    else null            // Master Plan exhausted → cycle terminates
```
Deterministic by construction: same evidence ⇒ same choice (`DETERMINISM_FIRST`). Ordering is the
Master Plan's own priority order; the Selector adds **no** heuristic and **no** ranking of its own.
An objective that would require a new structural decision is **not** selectable — it is escalated to
a human (see §4, R-Human).

**Reused component:** `src/runtime/autonomous-planner.ts` (`AutonomousPlanner.build`) already models
`{ selectedObjective, roadmap, validations }`; the Selector populates its `selectedObjective`.

### Stage 2 — Generate the Mission Contract

The **Mission Contract** already has a canonical shape on disk — `runtime/missions/*.json`
(`{ mission, priority, mode, objectives[].done_when, definition_of_done, completion }`).

**Reused components:**
- `src/runtime/mission-intent.ts` → `createMissionIntent` / `validateMissionIntent` (`MissionIntent`).
- `runtime/core/mission-interpreter.js` → `mission-interpretation.json` (objective, priority, mode,
  category).
- `runtime/core/mission-loader.js` → `mission-plan.json` (objectives, nextObjective).

The Controller assembles the contract from the selected objective + interpreter + intent; it emits a
`runtime/missions/<MISSION>.json` conforming to the **existing** schema. No new contract type is
created.

### Stage 3 — Execute the mission

**Reused component:** the canonical pipeline `node runtime/bin/odg-run.js <MISSION>`
(`pipeline-builder.js`, 12 stages). This is invoked **unchanged**; Autonomy only supplies the
`<MISSION>` argument that a human supplies today.

**Authority note.** The JS pipeline is the **authoritative, evidence-producing** execution path.
The TypeScript executor cascade (`RuntimeAutopilot → … → RuntimeExecutor`) is plan-only /
simulated — `RuntimeExecutor.execute` builds plans, registers capabilities and calls
`RuntimeState.complete()` **unconditionally**, running no real work. Autonomy therefore executes via
`odg-run.js` and **must not** treat `RuntimeState.complete()`/`status:"DONE"` as a completion signal;
doing so would let the loop "decide done" itself and violate the founding invariant. The TS cascade
may be used only as a thin in-process *driver* that shells the pipeline, never as the decision.

### Stage 4 — Verify the evidence

**Reused components (evidence producers):**
- `runtime/core/validation-engine.js` → `mission-report.json` (`validated: true`).
- `runtime/bin/odg-verify.js` → `runtime-verify.json` `{ build, typescript, gitClean }`.
- **Documentation Engine** (`DocumentationEngine.generate`) → `DocumentationProof` (immutable,
  hashed projection of the mission artifacts).
- `runtime/mission-standard/{certificates,passports,reports}` → mission-standard artifact set.
- Mission pipeline exit code → `missionPipeline` evidence.

No verification logic is written by Autonomy; it **collects** the evidence these components already
produce.

### Stage 5 — Decide whether the mission is done

This is delegated **entirely** — Autonomy forms no judgement of its own (founding invariant).

**Reused decision authorities:**
- **Release Manager** (`ReleaseManager.decide(ReleaseInputs)`) → `RELEASE | NO_RELEASE`, the
  deterministic completion certification from complete, conformant evidence. This is the crux: the
  Release Manager already *"certifies only that a complete set of conformant evidence permits a
  RELEASE or NO_RELEASE decision"*.
- **Governance Kernel** (`authorizeMission`) + `state-machine.json` → the deterministic lifecycle
  transition `VERIFIED → RELEASED → ARCHIVED`.
- The Mission Contract's own `definition_of_done` / `completion` clauses.

**ReleaseInputs assembly (the glue the Release Manager design flagged as Runtime-side).** The
Controller builds `ReleaseInputs` from stage-4 evidence — this is the *"Runtime glue that assembles
`ReleaseInputs` from the verify/pipeline/documentation outputs"* explicitly deferred to the Runtime
by `docs/RELEASE_MANAGER_DESIGN_v1.md`:
```
ReleaseInputs {
  releaseContractVersion : "1.0.0"
  requestId              : <mission id>
  validation : {
    build           : runtime-verify.json.build
    typescript      : runtime-verify.json.typescript
    gitClean        : runtime-verify.json.gitClean
    missionPipeline : (odg-run.js exit code === 0)
  }
  source             : { commit, branch }          // Runtime-supplied, echoed
  documentationProof : <DocumentationEngine.generate(...).proof>
  artifacts          : [ certificate, passport, report, documentation, proof refs ]
  previousReleaseRef : <last RELEASE record ref, or null>
}
```
`decision === "RELEASE"` ⇒ the mission is **done**; `"NO_RELEASE"` ⇒ **not** done (a certified
refusal, not an error); an `error` result (`EVIDENCE_INCOMPLETE` / `INPUTS_MALFORMED` /
`RELEASE_CONTRACT_INCOMPATIBLE`) ⇒ **no decision possible** → halt (see §3).

### Stage 6 — Advance to the next mission (loop)

**Reused components:**
- **Mission Ledger** (`recordMission`) — appends the completed mission immutably
  (`ARTIFACTS_ARE_IMMUTABLE`); the next Stage-1 selection excludes it, guaranteeing forward progress.
- The single-objective executor cascade (`RuntimeAutopilot.run` …) executes each iteration.

The Autonomy Cycle Controller closes the loop: on `RELEASE` it records, then re-enters Stage 1. The
loop is the only genuinely new control-flow, and it is deterministic and terminating (§3).

---

## 3. The Autonomy Cycle (control flow)

```
loop:
  1. mission ← selectNextMission(masterPlan, ledger, registry)
     if mission is null            → STOP: PLAN_COMPLETE (success)
  2. contract ← generateContract(mission)                    // interpreter + intent + loader
     if contract invalid           → STOP: CONTRACT_INVALID (halt for human)
  3. run  ← odg-run.js(mission)                              // canonical pipeline
     if pipeline failed            → STOP: EXECUTION_FAILED (halt, evidence preserved)
  4. evidence ← collect(validation, verify, docProof, artifacts, pipelineExit)
  5. decision ← ReleaseManager.decide(assembleReleaseInputs(evidence))
       ├ error (EVIDENCE_INCOMPLETE/…)  → STOP: EVIDENCE_INCOMPLETE (halt for human)
       ├ NO_RELEASE                     → STOP: BLOCKED (certified refusal; rollbackRef kept)
       └ RELEASE                        → continue
  6. governance ← authorizeMission(mission) ; transition VERIFIED→RELEASED→ARCHIVED
  7. recordMission(mission)             // append-only ledger; excludes it from step 1 next round
  8. goto loop
```

**Termination (halting guarantee).** The loop terminates because (i) the ledger grows monotonically
and Stage 1 excludes recorded missions, so the finite Master Plan is strictly consumed, and (ii)
every non-`RELEASE` outcome is a hard stop. No unbounded retry, no self-generated work: the only
source of new missions is the human-authored Master Plan (`REUSE_BEFORE_CREATE`, *never invent
architecture*). A `NO_RELEASE` or error halts with all evidence and the `rollbackRef` preserved.

---

## 4. Invariants

1. **Capability, not engine** — extends the Runtime engine; adds no tenth engine (Constitution 1–2).
2. **No new foundation** — reuses the state machine, ledger, contracts, pipeline, Documentation
   Engine, Release Manager, verify/freeze/rollback (`REUSE_BEFORE_CREATE`).
3. **Pure orchestration** — the Capability contains selection + loop glue only; every decision and
   every side effect belongs to an existing component (`ONE_RESPONSIBILITY_PER_COMPONENT`).
4. **Deterministic** — identical evidence (Master Plan + ledger + registry + gates) ⇒ identical
   mission choice and identical decision (`DETERMINISM_FIRST`, `PIPELINE_IS_REPRODUCIBLE`).
5. **Evidence required** — no advance without a `RELEASE` from complete, conformant evidence via the
   Release Manager (`EVIDENCE_REQUIRED`).
6. **Never judges quality** — completion is decided only by the Release Manager + Governance Kernel;
   the loop rationalises nothing (founding invariant).
7. **Immutable trail** — every iteration appends to the ledger and leaves the release record intact
   (`ARTIFACTS_ARE_IMMUTABLE`).
8. **Rollback always possible** — each release record carries `rollbackRef`; a halt never destroys
   evidence (`ROLLBACK_MUST_ALWAYS_BE_POSSIBLE`).
9. **Halts, never invents** (R-Human) — the only mission source is the human-authored Master Plan;
   any objective needing a new structural decision is escalated, not fabricated (*Human validates
   structural decisions*).
10. **Stop on error** — any pipeline failure or evidence-incomplete result halts immediately with
    preserved evidence (Brain RULE *Stop immediately on error*).

---

## 5. Contracts (all reused — no new contract type)

- **Input to selection:** `mission-plan.json.objectives` (Master Plan), `mission-ledger.json`,
  `capability-registry.json`. *(existing)*
- **Mission Contract:** `runtime/missions/<MISSION>.json` schema + `MissionIntent`. *(existing)*
- **Verification evidence:** `runtime-verify.json`, `mission-report.json`, `DocumentationProof`,
  mission-standard artifacts. *(existing)*
- **Decision contract:** `ReleaseInputs` → `ReleaseManagerResult` (`src/contracts/release.ts`).
  *(existing, frozen 1.0.0)*
- **Lifecycle contract:** `state-machine.json` transitions via `authorizeMission`. *(existing)*
- **Trail:** `mission-ledger.json` append-only entries. *(existing)*

The Autonomy Capability defines **no new persisted contract**; it only reads and writes the shapes
above. Its own configuration surface is an in-memory `AutonomyContractVersion` (`1.0.0`) gate,
mirroring the Documentation Engine / Release Manager version-gate pattern.

---

## 6. Dependencies

**Satisfied (all present and green):**
- Per-mission pipeline `odg-run.js` / `pipeline-builder.js` → `PIPELINE SUCCESS` ✅
- Governance Kernel + `state-machine.json` (lifecycle authority) ✅
- Documentation Engine + `DocumentationProof` (evidence) ✅
- Release Manager + `ReleaseInputs`/`ReleaseManagerResult` (completion decision) ✅
- `odg-verify.js` (`build`/`typescript`/`gitClean`) ✅
- Mission Ledger (append-only trail) ✅
- Single-objective executor cascade `RuntimeAutopilot → … → RuntimeExecutor` ✅
- Mission Loader / Interpreter / Intent (contract assembly) ✅

**Remaining (integration-side, owned by the future IMPLEMENT mission — not this design):**
- The thin **Mission Selector** pure function (§2 Stage 1).
- The **Autonomy Cycle Controller** loop (§3) + `ReleaseInputs` assembler (§2 Stage 5).

No dependency is missing; both remaining items are glue over existing parts.

---

## 7. Risks

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | Loop invents architecture / scope creep | Only Master-Plan objectives are selectable; new structural decisions escalate to a human (Invariant 9) |
| R2 | Non-terminating loop | Ledger is append-only and excludes completed missions; finite Master Plan is strictly consumed; every non-RELEASE halts (§3) |
| R3 | Non-deterministic selection | Selection is a pure function of persisted evidence in Master-Plan order; no clocks/randomness/ranking (Invariant 4) |
| R4 | Advancing on incomplete evidence | Release Manager gates on complete, conformant evidence; `EVIDENCE_INCOMPLETE` halts (Invariant 5) |
| R5 | Confusing NO_RELEASE with an error | Inherited Release Manager model: NO_RELEASE is a certified halt (`ok:true`), only missing/malformed evidence is an error (§3) |
| R6 | Foundation drift | No new engine/state-machine/persistence; version-gated Capability only (Invariant 2) |
| R7 | Lost evidence on halt | Every halt preserves the ledger, artifacts and `rollbackRef` (Invariants 7–8) |

---

## 8. Coherence check (Constitution + Master Plan)

- **No new engine after v1.0** — satisfied: Autonomy is a Capability of the Runtime engine. ✅
- **Every feature is a Capability / extension** — satisfied. ✅
- **Reuse before create** — satisfied: all six stages map to existing components; only selection +
  loop glue is added. ✅
- **Determinism / reproducibility / evidence / immutability / rollback** — satisfied by delegation to
  the Release Manager, Governance Kernel, Mission Ledger and the frozen contracts. ✅
- **Never invent architecture / human validates structural decisions / stop on error** — satisfied by
  Invariants 9–10. ✅
- **No I/O or foundation introduced by the design** — satisfied: this document adds no code and no
  new foundation. ✅

Every autonomy stage has a concrete existing owner; the only additions are a pure selection function
and a deterministic, terminating loop, both classified as a Capability. No open structural decision
remains for a human at design time.

**AUTONOMY ARCHITECTURE READY**

---

## 9. Freeze

This architecture is **FROZEN** at Autonomy Contract Version `1.0.0`. The founding invariant (the loop
never judges quality and never decides completion — the **Release Manager** is the sole completion
authority), the six-stage → existing-component mapping, the deterministic selection function, the
control-flow with its halting guarantee, and the reuse-only / no-new-foundation constraint are
contractual and immutable. Any change requires a **new** Autonomy Contract Version, never an in-place
edit (`ARTIFACTS_ARE_IMMUTABLE`). Implementation must conform to this document exactly: it adds only
the Mission Selector, the Autonomy Cycle Controller and the `ReleaseInputs` assembler as a Capability,
reuses every other component unchanged, and never modifies the existing pipeline's business logic.
