# P0-C#3 part 2 (absent-verify) — GATE A DESIGN (design-only) V1, 2026-10-31

**Status:** GATE A (design). **NOT implemented. Awaiting CTO/ODG Gate B.** Truth Lock at authoring: `main @ b77680b`.
Closes the deferred half of C#3: the ENGINEERING build/TS gate FAIL-OPEN when `runtime/generated/runtime-verify.json`
is absent (`validation-engine.ts:176-177` default `buildOk=typescriptOk=true`). Part 1 (stale cross-mission guard)
is already ACCEPTED+merged (#299).

## 1. Why the naive fix fails (the constraint this design must satisfy)
Simply requiring `gatesEvaluated` (verify present) for engineering missions **false-BLOCKs a legitimate
committed-deliverable re-validation** — `validation-engine-engineering-proof.test.ts` case 3 runs an engineering
mission with NO `runtime-verify.json` by design and must still validate. Root cause: the odg-run pipeline has **no
stage that produces `runtime-verify.json`** (confirmed: `pipeline-builder.ts` stages = … Patch Executor(71) →
Validation Engine(72) → Mission Ledger(76); no verify stage), so on the direct-odg-run autonomy route the gate is
read with verify ABSENT (fail-open) or STALE. The forensic's safe envelope is **Option D: produce fresh this-mission
build/TS evidence inside the pipeline**, then the gate can require it.

## 2. Proposed design (forensic Option D)
**(a) New pipeline stage "Build/TS Evidence"** inserted **between Patch Executor(71) and Validation Engine(72)**.
It runs the SAME build + `tsc --noEmit` checks odg-verify runs and writes `runtime/generated/runtime-verify.json`
stamped `mission = <this mission>` — but **build/TS ONLY, NOT gitClean**: at this pipeline point the deliverable is
applied-but-UNCOMMITTED (the commit happens later at the S4 / Mission-Lifecycle gate), so the tree is legitimately
dirty and a gitClean check here would wrongly fail. (gitClean stays enforced at its existing commit/release point.)
This also closes the **pre-patch-staleness residual** the forensic flagged (odg-verify in the shell pre-flight
computes build/tsc BEFORE the patch; a post-patch stage reflects the patched tree).

**(b) Enable the absent-verify BLOCK in `validation-engine.ts`**, scoped to `isEngineering`, reusing the part-1
`verifyEvidenceOk`: extend it to also require PRESENT this-mission evidence —
`verifyEvidenceOk = !isEngineering || ((gatesEvaluated || recovery!==null) && !verifyStaleCrossMission)`.
V68-SAFE: still presence + mission-identity only, NO timing/mtime comparison.

**(c) Test-fixture reality update:** the direct-VE unit tests (engineering-proof, recorded-noop, fidelity-gate, …)
that invoke the compiled validation-engine WITHOUT the pipeline must now stamp a this-mission `runtime-verify.json`
(as engineering-proof case 9 already does) to reflect the new pipeline reality — a legit engineering mission ALWAYS
has fresh this-mission evidence. This is a fixture update, not a semantic weakening.

## 3. PROOF the post-patch stage does NOT reject legitimate committed-deliverable re-validation
- A legit re-validation's deliverable is already-committed + previously-validated ⇒ it **compiles** ⇒ the Build/TS
  Evidence stage produces a GREEN this-mission `runtime-verify.json` ⇒ `gatesEvaluated=true`, `verifyStaleCrossMission=false`
  ⇒ `verifyEvidenceOk=true` ⇒ **NOT blocked**. The re-validation passes exactly as before.
- The ONLY newly-blocked case is an engineering mission whose deliverable **does not build / does not typecheck** —
  which SHOULD block (that is the fail-open being closed). This is the desired behavior, not a regression.
- Read-only / AUDIT missions (`isEngineering=false`) are untouched (`verifyEvidenceOk` short-circuits true).

## 4. MANDATORY V68 full-pipeline smoke (acceptance gate — `npm test` does NOT exercise the odg-verify→odg-run order)
Run a REAL benign ENGINEERING mission end-to-end through BOTH front doors under BOTH runtimes; assert NO false-BLOCK:
1. `odg-local-pipeline.sh <MISSION>` under `ODG_RUNTIME=ts` ⇒ "PIPELINE SUCCESS / MISSION SUCCESS" (not BLOCKED).
2. same under `ODG_RUNTIME=js` ⇒ SUCCESS.
3. direct `odg-run <MISSION>` (autonomy route) with no pre-existing verify ⇒ the new stage produces fresh verify ⇒ SUCCESS.
4. a deliberately build-BREAKING engineering mission ⇒ BLOCKED with the honest build-red reason (closes the fail-open).
5. a stale prior-mission verify present ⇒ BLOCKED (part-1 guard, regression).
6. read-only AUDIT mission with no verify ⇒ SUCCESS (unaffected).
Each must be observed on the REAL pipeline, not a synthetic-timing bench (the exact gap that let V68 escape CI).

## 5. Proposed WORK_ITEM_CONTRACT (for Gate B)
- **write_set:** `runtime/core/pipeline-builder.ts` (register the stage) + a new `runtime/core/stage-build-ts-evidence.ts` (or reuse odg-verify's build/tsc core, build/TS-only, mission-stamped) + `runtime/core/validation-engine.ts` (enable the absent-verify term) + the affected direct-VE test fixtures + a new full-pipeline V68 smoke test (in `runtime/__bench__/`) + register.
- **invariants:** V68-safe (no timing); build/TS-only at the new stage (no gitClean there); scoped to isEngineering; the stage writes `runtime-verify.json` mission-stamped; no change to the 9 primitives; reversible (drop the stage + the gate term).
- **acceptance:** §4 V68 smoke all green under BOTH runtimes; full VE regression + mission-lifecycle + pipeline suites green; tsc BOTH tsconfigs; build OK; independent verification by a separate agent (implementer never self-accepts).
- **stop_conditions:** if the new stage cannot produce a this-mission green verify for a legit re-validation (smoke case 1/2/3 false-BLOCKs) ⇒ STOP, do not ship (that would be a V68 repeat).
- **risks:** consequential (adds a build+tsc run to every engineering pipeline run — latency; the stage must honor the same offline/skip rules odg-verify uses); the fixture updates touch several VE tests (mechanical, mirror case 9).

## 6. Gate-B decision requested
Authorize implementing part 2 under §5, OR adjust scope (e.g. stage-only without enabling the BLOCK until the smoke
is observed green). No implementation proceeds until this contract is authorized and the §4 smoke is wired.
