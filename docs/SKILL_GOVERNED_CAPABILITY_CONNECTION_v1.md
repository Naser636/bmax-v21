# Skill — GOVERNED_CAPABILITY_CONNECTION

- **Skill id:** `GOVERNED_CAPABILITY_CONNECTION`
- **Lifecycle:** **CANDIDATE** (NOT TESTED, NOT CERTIFIED)
- **Classification:** Read-only engineering procedure (NOT a new engine, primitive, registry, or authority)
- **Authority:** Observation / design only — no write, commit, push, or repair authority
- **Provenance:** commits `473d172` (FIX_TS_EVIDENCE_PROBE_RESOLUTION_V1), `130f7f4`
  (CONNECT_FIRST_PRODUCER_CLEAN_WORKSPACE_V1), `b421f22` (ADD_PROBE_RUN_OWNERSHIP_V1); recorded in
  `docs/odg-master-v5/closeout/ODG_V5_CLOSEOUT_MATRIX.md` §11–§14
- **Scope:** Discovery + design only. Every implementation it describes requires a separate,
  human-authorized WORK_ITEM contract (PROPOSED → AUTHORIZED).

---

## 0. Purpose

A bounded, repeatable procedure for **discovering and designing** the connection of an *already
existing* capability producer to the LOCAL execution path so the loop
`producer → evidence → probe → verdict` closes — without inventing a producer, Resolver, Allocator,
authority, primitive, or provider. It does not grant the ability to perform the connection; it
describes how to investigate and specify one for separate authorization.

## 1. Preconditions

Clean working tree; Truth Lock MATCH (branch=main, upstream=origin/main, clean); an EXISTING producer
with an evidence artifact; a registered (or minimally-addable) probe; a mission contract whose
objective id dispatches that producer. Read-only discovery is performed first, always.

## 2. Required inputs

The producer registry (`runtime/core/capability-executors.js`), the probe registry
(`runtime/core/capability-probes.js`), the LOCAL executor (`src/runtime/runtime-executor.ts`), the
evidence assessor (`src/runtime/objective-evidence.ts`), and the candidate mission contract.

## 3. Procedure (ODG chain: INSPECT → REPRODUCE → LOCALIZE → ROOT CAUSE → MINIMAL REPAIR → REGRESSION → VERIFY → CHECKPOINT → PROMOTE)

1. **INSPECT** the producer registry; for each entry record `matches()`, `run()` side-effect class,
   and `writeEvidence` artifact.
2. **Classify** every finding as exactly one of: **producer** (does work + emits evidence),
   **resolver binding** (`resolve`/`matches`), **evidence** (`writeEvidence` artifact),
   **validator** (a probe that reads that artifact), or **dormant/disconnected** (no live caller).
3. **Distinguish evidence kinds:** `verify[].evidence` is a **probe NAME** (canonical, resolved via
   the probe registry) — NOT a filesystem path. Artifact-path evidence is a separate schema
   (`mechanical-acceptance` `evidence.required[].path`). Never conflate them.
4. **Contract analysis:** confirm a mission objective id already resolves (prefix match) and that the
   contract declares the probe in its `verify` block.
5. **Dispatch-scope analysis:** the executor dispatch must be **self-scoping** — only objectives
   matched by the registry execute; non-matching objectives are byte-identical to prior behavior.
6. **Evidence + run-ownership analysis:** an artifact-backed probe must bind evidence to THIS run.
   Reuse the existing `runStartedAtMs` concept (captured from `RuntimeState.startedAt` before
   dispatch, threaded via `probeCtx`); the probe requires `artifact mtimeMs >= runStartedAtMs`. A
   stale leftover must not satisfy the proof. Content-derived probes (e.g. `build-green`) need no stamp.
7. **Failure/recovery analysis:** a producer that throws propagates and fails the mission closed (no
   ledger write); absent/malformed/stale evidence ⇒ probe `{ok:false}` ⇒ FAILED. No rollback is
   required for read-only producers (nothing mutated).
8. **Architecture-integrity checks:** confirm zero references to Resolver (`capability-router`),
   Allocator (`resource-allocation-engine`/`allocate(`), `action-gate`, or `authorizeMission` are
   introduced on the executor path; no new framework/context model.
9. **REPRODUCE** any suspected gap empirically from a fresh process before proposing a repair.

## 4. Acceptance criteria (for the separately-authorized implementation this Skill specifies)

Loop closes end-to-end through the real `LocalMissionRunner` (producer runs → fresh evidence → probe
verdict → SUCCESS); non-match ⇒ no dispatch; absent/stale/malformed ⇒ FAIL closed; regression green
(focused e2e + probe tests + `objective-evidence`/ownership suites + `runtime/core/*.test.js` +
`tsc --noEmit`); diff = the minimum write-set; no generated/temp artifact pollution; the change is
recorded in the closeout matrix.

## 5. Limitations

Applies ONLY to existing read-only producers coupled to a dispatching objective. It does not design
new producers, authority, or execution semantics beyond the dispatch seam. **`CLEAN_WORKSPACE_1` is
the only proven instance**; generalization to any other producer is designed-but-unproven.

## 6. Authority boundary (what this Skill is explicitly NOT authorized to do)

Observation/design only. It must NOT write, commit, push, or repair; must NOT modify the Expert
Profile, Expert Instance, runtime, Resolver, Allocator, authority model, or capability registry; must
NOT reinterpret `verify[].evidence` as a filesystem path; must NOT invent a new ownership framework,
primitive, agent runtime, provider, or automated learning mechanism. Any implementation it describes
is a separate human-authorized work item.

## 7. CANDIDATE → TESTED promotion

Minimum promotion test: apply this Skill to connect a **second**, independently-authorized existing
read-only producer end-to-end and demonstrate the same green loop and run-ownership on a
non-`CLEAN_WORKSPACE` producer. One successful second instance moves the lifecycle CANDIDATE → TESTED.
This document does not claim the Skill is TESTED or CERTIFIED.
