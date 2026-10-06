# Skill — GOVERNED_TEST_PROOF_ANALYSIS

- **Skill id:** `GOVERNED_TEST_PROOF_ANALYSIS`
- **Lifecycle:** **TESTED** (TESTED but **NOT CERTIFIED**) — promoted from CANDIDATE on two independent
  genuine-gap + verified-minimal-test-only-closure applications (see §7)
- **Classification:** Read-only test/evidence-coverage analysis procedure (NOT a new engine, primitive,
  registry, runtime, or authority)
- **Authority:** Observation / design only — no write, commit, push, or production-code authority. It is
  explicitly SEPARATE from authority and grants no permission to edit, commit, push, or alter runtime code.
- **Provenance:** five independent applications across both outcome branches —
  gap-find-and-close: (1) `DISCOVER_EVIDENCE_TEST_COVERAGE_V1` → `FIX_VALIDATION_ENGINE_FAILED_ACTION_TEST_V1`
  (released `d6a6365`, closeout §17/§12-lineage); (2) `DISCOVER_RUNTIME_EXECUTOR_DISPATCH_COVERAGE_V1`
  (released `cbbd0e4`, closeout §22). Disprove-as-benign / reject stale premise:
  `DISCOVER_MISSION_CLI_DISCARDED_PLAN_V1`, `DISCOVER_ECONOMIC_ENFORCEMENT_RUNTIME_ACTIVATION_V1`,
  `DISCOVER_LOCAL_RESOLVER_ALLOCATOR_ACTIVATION_V1` (closeout §21). Recorded alongside the sibling skill
  `GOVERNED_CAPABILITY_CONNECTION` (`docs/SKILL_GOVERNED_CAPABILITY_CONNECTION_v1.md`).
- **Scope:** Discovery + design only. Every test addition or repair it specifies requires a separate,
  human-authorized WORK_ITEM contract (PROPOSED → AUTHORIZED).

---

## 0. Purpose

A bounded, repeatable procedure for **investigating a test/evidence-coverage claim** (typically an audit
finding of a "missing test" or "missing coverage") and determining honestly whether it is a real defect, a
real-but-benign observation, a stale finding, or already adequately covered — then, only if a genuine gap
remains, specifying the **smallest honest test-only closure**. It does not grant the ability to change
runtime code; it describes how to analyse coverage and specify a minimal test for separate authorization.
Its guiding rule: **a green build is never sufficient proof, and a named-file absence is not the same as a
missing invariant.**

## 1. Preconditions

Clean working tree; Truth Lock MATCH (branch=main, upstream=origin/main, clean); a coverage/audit claim to
investigate; read access to the implementation under claim, its tests, and git history. Read-only discovery
is performed first, always. No runtime change is proposed unless a concrete runtime defect is reproduced.

## 2. Required inputs

The implementation module named by the claim; its test harness(es); the invariant set the module enforces
(enumerated from source, not assumed); relevant audit/closeout references; git history for provenance and
staleness checks.

## 3. Procedure (ODG chain: INSPECT → REPRODUCE → MEASURE → LOCALIZE → REPORT)

1. **Locate the named artifact** and separate two distinct questions: is the named *file* absent, versus is
   the *invariant* it would cover actually unproven? A missing `X.test.js` is NOT itself a defect.
2. **Identify the real test harness.** Determine how the module is actually exercised: a directly
   `require()`-able unit, a **top-level script tested by subprocess spawn** (e.g. `validation-engine.js`,
   which `process.exit`s on load and must be spawned, not required), or covered transitively by a caller.
   A unit-test-file absence is expected and correct for a top-level script.
3. **Enumerate the module's invariants** from source (e.g. the AND-terms of a verdict), and map each to its
   coverage.
4. **Classify each invariant's coverage** as exactly one of: **direct** (a test asserts it in isolation),
   **transitive** (asserted only as a side effect of another case), **probe-level** (a probe unit test),
   or **real-producer E2E** (driven through the genuine producer→artifact→probe→evidence path). Name the
   file:line of the covering assertion, or declare the invariant uncovered.
5. **Detect stale findings.** Compare the audit claim against current code; a finding that was true at an
   earlier commit but is now covered (or benign) is reported as **stale/disproven**, with the covering
   evidence cited.
6. **Detect dishonest/vacuous coverage.** Flag impossible-input fixtures, always-true assertions, and tests
   that bypass the real path. Distinguish **honest simulation** (e.g. `fs.utimesSync` to age an artifact for
   a freshness unit test) from fabricated impossible state — the former is legitimate; the latter is not.
7. **Verify determinism/side-effects** of any code claimed equivalent or harmless (read source for
   `Date`/`Math.random`/`randomUUID`/IO/spawn) before asserting "benign" or "equivalent".
8. **Propose the smallest honest closure** ONLY if a genuine gap remains: prefer adding a single assertion
   to an EXISTING test seam (reusing its helpers, no refactor) over any new file or runtime change.
9. **Refuse runtime changes** when no runtime defect is reproduced; say so explicitly and recommend
   no-action / documentation-only as appropriate.

## 4. Acceptance criteria (for the separately-authorized test closure this Skill specifies)

Every claimed invariant is traced to a concrete covering assertion (file:line) or declared uncovered; every
stale/false claim is refuted with evidence; any proposed closure is **test-only, minimal, reuses an existing
seam, and verifies green** (focused test + relevant regression suites + `tsc --noEmit` where applicable);
no runtime production file is modified; the closure blocks for the RIGHT reason (an honest attribution
assertion, not an incidental pass).

## 5. Limitations

Analysis/design only — it finds and (when authorized separately) closes *test-proof* gaps; it does not by
itself prove runtime correctness, grant authority, or modify production code. It depends on an accurately
enumerable invariant set and on honest source inspection; it cannot certify behaviour it cannot exercise.
It is not a coverage-percentage tool and does not pursue unrelated test cleanup.

## 6. Authority boundary (what this Skill is explicitly NOT authorized to do)

Observation/design only. It must NOT write, commit, push, or repair production code; must NOT modify runtime,
Resolver, Allocator, authority model, Expert/Profile/Instance, registry, or learning paths; must NOT broaden
into unrelated test cleanup; must NOT claim a runtime defect without a reproduction. Any test addition or
repair it describes is a separate human-authorized work item (PROPOSED → AUTHORIZED).

## 7. Promotion CANDIDATE → TESTED — SATISFIED

The promotion test — the distinctive **gap-find-and-close** outcome proven by **two independent applications
that each (a) reproduced a genuine coverage/proof gap AND (b) landed a verified minimal test-only closure**,
mirroring the sibling skill's two-independent-instances convention (`GOVERNED_CAPABILITY_CONNECTION`) — is
**now satisfied**:

1. **`FIX_VALIDATION_ENGINE_FAILED_ACTION_TEST_V1`** (released `d6a6365`) — genuine gap: a `FAILED` execution
   entry ⇒ Validation Engine `BLOCKED`/`validated=false`/exit 1 was proven by no VE-subprocess test (the
   no-FAILED-actions invariant). Closure: one case added to `validation-engine-recorded-noop.test.ts`,
   verified green (focused + regression + `tsc`).
2. **`DISCOVER_RUNTIME_EXECUTOR_DISPATCH_COVERAGE_V1`** (released `cbbd0e4`, closeout §22) — genuine gap: a
   producer that THROWS on the live `LocalMissionRunner` path ⇒ `{ok:false}` ⇒ the ledger recorder is NEVER
   called ("records nothing") was asserted by no test. Closure: one case added to
   `local-mission-runner-ledger.test.ts`, verified green (focused + regression + `tsc`).

The Skill also demonstrated the **disprove-as-benign / reject-stale-premise** branch across three further
independent applications (`DISCOVER_MISSION_CLI_DISCARDED_PLAN_V1`,
`DISCOVER_ECONOMIC_ENFORCEMENT_RUNTIME_ACTIVATION_V1`, `DISCOVER_LOCAL_RESOLVER_ALLOCATOR_ACTIVATION_V1`),
each correctly ending in no-action with cited evidence and no unnecessary change.

Lifecycle is therefore **TESTED**. The Skill is **TESTED but NOT CERTIFIED**: certification remains a separate
lifecycle step requiring broader evidence and scope than these applications (e.g. sustained use across the
roadmap and across modules beyond the LOCAL execution/validation surface). This document does not claim the
Skill is CERTIFIED.
