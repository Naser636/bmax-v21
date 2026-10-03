# P0-078 — Runtime State Verification (FORENSIC + REPRODUCTION)

- **Identifier:** P0-078
- **Status:** **EVALUATED — NO RUNTIME DEFECT; proof gap closed with one committed test (CAS B).**
  Runtime state verification is faithful to the canonical state and **does detect a real divergence**;
  the one missing piece was a *committed* end-to-end/divergence test, now added (test-only). **No
  runtime source change.** P0-079 remains `PLANNED — NOT AUTHORIZED`.
- **Authorization scope:** INSPECT → REPRODUCE → MEASURE → LOCALIZE → CLASSIFY → PROVE ROOT CAUSE,
  plus a test strictly necessary to the proof. No runtime/schema/contract/API change authorized or
  performed.
- **Evaluated at:** HEAD `857a16b1e6fbebe4c23c818568734da1f2b8653b`, branch `runtime/mission-context-builder`
- **Preceded by:** P0-069/C03, P0-071, P0-072–P0-077 (all closed NO-CHANGE NEEDED).

## 1. The question P0-078 asks

Not "do the tests pass?" but: *can we demonstrate that what the runtime asserts as state is the
canonical applicable state, and that the verification mechanisms would detect a real divergence?*
Required distinction: **TESTED ≠ RUNTIME VERIFIED**; runtime proof must show
`STATE_BEFORE → ACTION → OBSERVED_EFFECT → STATE_AFTER` with real evidence and verification state.

## 2. Canonical → runtime → verification map (no second source of truth)

```
CANONICAL SOURCE        runtime/governance/state-machine.json   (linear CREATED…ARCHIVED chain;
                                                                 "every transition produces evidence")
   │  TRANSFORMATION     runtime/core/mission-lifecycle.js :: computeLifecycle
   │                     walks the chain, advancing ONLY while the ENTERED state's evidence predicate
   │                     (a pure function of real on-disk artifacts) holds AND governance-kernel
   │                     authorizes the step → emits additive C03 records (toC03Records)
   ▼
RUNTIME STATE           runtime/generated/mission-lifecycle.json (achieved state + c03Transitions);
                        runtime-model.js is a deterministic read-only snapshot (no writes, no clock)
   │  VERIFICATION       evidence predicates (contract / mission-plan / decision+patch / READY /
   │                     mission-report.validated / patch-execution) + governance gate; C03 validator
   │                     (I1–I7); final-report.summarizeC03 consumes the records
   ▼
PROOF                   achieved state is a pure function of the real evidence; it cannot be asserted
                        without the artifact that justifies it
```

The runtime does **not** maintain a second state authority: `runtime-model.js` is a snapshot, the
lifecycle recomputes from evidence each run, and C03 only *records* the walk (P0-073 finding).

## 3. Reproduction — RUNTIME path, not fixtures (executed this session)

A sandbox copied the **real** authority files into a throwaway cwd and drove the **real**
`computeLifecycle` / `governance-kernel` against a controlled evidence chain:

| # | Property | Result |
|---|---|---|
| 1 | full evidence ⇒ runtime achieves **RELEASED** | **PASS** |
| 2 | one C03 record per transition, runtime-produced | **PASS** |
| 3 | confirmed advances are `VERIFIED` with ≥1 evidence_ref | **PASS** |
| 4 | C03 `evidence_refs` are the **real on-disk evidence strings** (mission-plan / patch / report / contract) — not fixtures | **PASS** |
| 5 | every produced record passes the real validator | **PASS** |
| 6 | **DIVERGENCE DETECTED** — removing `mission-report.json` drops the runtime state `RELEASED → PREPARED` | **PASS** |
| 7 | the block names the missing evidence (`PREPARED→VALIDATED: mission not validated`) | **PASS** |
| 8 | the blocked C03 record is honestly `UNVERIFIED` (never a fabricated `VERIFIED`) | **PASS** |
| 9 | **FIDELITY** — a foreign-mission report cannot make the runtime claim RELEASED | **PASS** |
| 10 | **FIDELITY** — `validated:false` is never upgraded | **PASS** |
| 11 | determinism — identical evidence ⇒ identical runtime state | **PASS** |

Independent confirmation from an actual prior run: `runtime/generated/mission-lifecycle.json`
(`P0071_C03_INTEGRATION_PROBE`) shows `achieved=CREATED` with a single `UNVERIFIED` blocked record
("no mission contract") — the runtime honestly reporting it could not qualify a mission whose contract
was not on disk. This is runtime behavior, not a fixture.

## 4. Finding

- **No runtime defect.** The runtime-asserted state is a faithful, deterministic function of the
  canonical evidence; it cannot over-claim (fidelity cases 9–10), and the verification **detects a real
  divergence** by construction — removing or forging the evidence drops the asserted state and records
  the block honestly (cases 6–8). This directly satisfies P0-078's "would it detect a divergence?"
  requirement — "no divergence observed" is **not** the basis of the verdict; a *detected, reproduced*
  divergence is.
- **Proof gap (test-only).** The committed `mission-lifecycle.test.js` exercised `toC03Records` against
  **fixture** transitions and called `computeLifecycle` once against ambient disk — it did **not** drive
  the evidence-driven walk to RELEASED, nor test divergence detection or mission-scoped fidelity. Under
  P0-078's TESTED≠RUNTIME-VERIFIED bar that is a genuine gap.

## 5. Action (CAS B — test-only, inside the authorized write-set)

Reproduced first (§3), then committed the reproduction as a deterministic regression test:
`runtime/core/mission-lifecycle.verify.test.js` (test-only; no runtime source touched). It runs the
real module in a throwaway cwd and asserts the eleven properties above.

- Determinism/isolation verified: **3/3 standalone runs**, process-isolated `chdir`.
- Regression: full `runtime/core` suite **26/26** (was 25 + this file).

## 6. Classification & verdict

**CAS B — no runtime defect; a strictly-necessary proof was missing and is now committed.** Runtime
state verification is demonstrably faithful and divergence-detecting; the durable proof now exists as a
committed runtime-path test. **No runtime/schema/contract/API change.**

## 7. Authority frontier

No runtime source change performed. P0-079 is NOT AUTHORIZED and is not analyzed. Execution returns to
the authority frontier.

## 8. Evidence index

- Surfaces: `runtime/governance/state-machine.json`, `runtime/core/mission-lifecycle.js`
  (`computeLifecycle`/`toC03Records`), `runtime/core/governance-kernel.js`, `runtime/core/runtime-model.js`,
  `runtime/core/state-transition.js`, `runtime/core/final-report.js`.
- **New test:** `runtime/core/mission-lifecycle.verify.test.js` (11 assertions, deterministic 3/3).
- Full `runtime/core` suite 26/26; independent runtime artifact `mission-lifecycle.json` (prior run).
