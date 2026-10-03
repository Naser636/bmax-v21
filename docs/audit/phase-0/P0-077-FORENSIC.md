# P0-077 — Canonical State Regression Suite (FORENSIC + REPRODUCTION)

- **Identifier:** P0-077
- **Status:** **EVALUATED — NO-CHANGE NEEDED (CAS A).** The canonical-state (C03) invariants are already
  covered by a real, bounded, **load-bearing** regression suite. No test gap, **no runtime change**,
  and no new test justified. P0-078 / P0-079 remain `PLANNED — NOT AUTHORIZED`.
- **Authorization scope:** INSPECT → REPRODUCE → MEASURE → LOCALIZE → CLASSIFY → PROVE ROOT CAUSE,
  plus a regression test *only if strictly necessary to the proof*. No runtime/schema/contract/API
  change authorized or performed.
- **Evaluated at:** HEAD `949da4015c55037b620e0f91be40f6b6b6fb45fa`, branch `runtime/mission-context-builder`
- **Preceded by:** P0-069/C03, P0-071, P0-072–P0-076 (all closed NO-CHANGE NEEDED).

## 1. The question P0-077 asks

Build **only** the regression coverage justified by actual C03 behavior; scope must remain bounded.
Required areas: valid transition, malformed transition, version conflict, missing evidence, missing
verification, deterministic validation, repeated transition, compatible existing behavior, failure
recovery.

## 2. Canonical-state invariants (from existing authority — not invented)

The invariants are C03's own, declared in `runtime/core/state-transition.js` (`C03_CONTRACT`):

- **I1** all required fields present and well-typed
- **I2** `state_version_after` **strictly >** `state_version_before` (monotonic; rejects version conflict/replay)
- **I3** `evidence_refs` is an array of strings
- **I4** `verification_status` is a known controlled-vocabulary member
- **I5** proof-requiring status (`VERIFIED`/`REJECTED`) ⇒ ≥1 `evidence_ref`
- **I6** a version advance implies a real change (`state_after !== state_before`; no-op rejected)
- **I7** deterministic / pure (no clock, no randomness, no I/O; stable error order)

No new invariant was introduced — every area below maps to one of these or to documented
producer/consumer behavior.

## 3. Coverage matrix — each required area → committed, protective test

| P0-077 area | Covered by (committed) | Protective assertion |
|---|---|---|
| valid transition | `state-transition.test.js` | well-formed ⇒ ok, normalized frozen record |
| malformed transition | `state-transition.test.js` | non-object; each missing required field; empty action/observed_effect ⇒ rejected |
| **version conflict** | `state-transition.test.js` (I2) | `after==before`, `after<before`, non-integer, negative ⇒ rejected |
| missing evidence | `state-transition.test.js` (I5) | `VERIFIED`/`REJECTED` with empty `evidence_refs` ⇒ rejected |
| missing verification | `state-transition.test.js` (I4) | missing / unknown status ⇒ rejected |
| deterministic validation | `state-transition.test.js` (I7) | same input ⇒ identical ok/errors; `canonicalize`/`computeDifference` order-independent; no mutation |
| **repeated transition** | `mission-lifecycle.test.js` + `state-transition.test.js` | `toC03Records` deterministic; double-validate identical; replay at same version rejected (I2) |
| compatible existing behavior | all three | runtime-model snapshot fits `state_before/after`; existing lifecycle fields preserved (additive); `summarizeC03` tolerates missing/malformed field (backward compat) |
| **failure recovery** | `mission-lifecycle.test.js` + `state-transition.test.js` | blocked advance ⇒ `UNVERIFIED` (never fabricated/SUCCESS); `REJECTED`-with-evidence accepted as an honest failure record |

All nine areas are covered. Committed assertion counts: `state-transition.test.js` **36**,
`mission-lifecycle.test.js` **20**, `final-report.test.js` **7** — **63** C03 assertions, all green.

## 4. Not nominal — invariants proven *load-bearing* (reproduction this session)

Per the directive ("a test that passes but does not actually protect the invariant is not sufficient
proof"), a mutation probe exercised each invariant by **violating** it and confirming rejection, plus
the positive/failure/replay cases:

| Check | Result |
|---|---|
| valid transition accepted | **PASS** |
| malformed (missing `state_after`) rejected | **PASS** |
| version conflict — replay at same version (`after==before`) rejected | **PASS** |
| version conflict — regress (`after<before`) rejected | **PASS** |
| malformed `evidence_refs` (non-array) rejected | **PASS** |
| missing / unknown `verification_status` rejected | **PASS** (both) |
| missing evidence on `VERIFIED` / `REJECTED` rejected | **PASS** (both) |
| no-op (identical before/after) rejected | **PASS** |
| failure-recovery — `REJECTED`-with-evidence accepted | **PASS** |
| repeated transition — double-validate identical | **PASS** |
| validator does not mutate input | **PASS** |

**13/13 — every invariant is load-bearing**: a violation is actually caught, so the committed tests
genuinely protect the canonical state, not merely pass.

## 5. Why no test is added (bounded scope)

The campaign authorizes building *only* the coverage *justified by actual C03 behavior*. Every required
area already has a committed, protective test (§3), each proven load-bearing (§4). Adding further tests
would be unjustified coverage — the opposite of the campaign's "scope must remain bounded" rule. This is
**CAS A**, not CAS B: there is no proof gap to fill.

## 6. Classification & verdict

**CAS A — canonical state correct AND regression proof sufficient.** No defect, no missing coverage,
no runtime change, no new test. The existing suite is bounded, complete over the required areas, and
load-bearing.

## 7. Authority frontier

No runtime / schema / contract / API change performed; no test added. P0-078 / P0-079 are NOT
AUTHORIZED and are not analyzed. Execution returns to the authority frontier.

## 8. Evidence index

- `runtime/core/state-transition.js` (`C03_CONTRACT`, I1–I7).
- Tests: `state-transition.test.js` (36), `mission-lifecycle.test.js` (20), `final-report.test.js` (7)
  — 3/3 files green, 63 assertions.
- Mutation probe: 13/13 invariants load-bearing (this session).
