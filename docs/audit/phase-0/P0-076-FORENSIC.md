# P0-076 — Concurrency & Idempotence (FORENSIC + REPRODUCTION)

- **Identifier:** P0-076
- **Status:** **EVALUATED — NO-CHANGE NEEDED (CAS A), proof strengthened with one committed test.**
  Concurrency and idempotence mechanisms already exist, behave correctly, and need **no new
  concurrency infrastructure**. **No runtime source change.** P0-077…P0-079 remain
  `PLANNED — NOT AUTHORIZED`.
- **Authorization scope:** INSPECT → REPRODUCE → MEASURE → LOCALIZE → CLASSIFY → PROVE ROOT CAUSE,
  plus tests strictly necessary to the proof and this audit artifact. **No runtime/schema/contract/API
  change** authorized or performed.
- **Evaluated at:** HEAD `0b7fecb6cea2aff75a63b998225ed95783129770`, branch `runtime/mission-context-builder`
- **Preceded by:** P0-069/C03, P0-071, P0-072/P0-073/P0-074/P0-075 (all closed NO-CHANGE NEEDED).

## 1. The question P0-076 asks

Validate state-transition behavior under **concurrent or repeated** actions. Evaluate: compare-and-set,
atomic transition, deterministic merge, explicit conflict ownership, duplicate detection, idempotency
keys, reconciliation. Rule: *No new concurrency infrastructure unless repository evidence proves it is
required.*

## 2. Mechanisms that already exist (repository evidence)

| P0-076 concern | Existing mechanism | Surface |
|---|---|---|
| **compare-and-set / optimistic concurrency** | C03 invariant **I2** — `state_version_after` must be *strictly* greater than `state_version_before`; a stale/duplicate version is rejected | `runtime/core/state-transition.js` |
| **atomic transition / explicit conflict ownership** | `O_EXCL` (`wx`) atomic lock claim — exactly one process creates the lock, all others get `EEXIST` and skip; stale lock (TTL) reclaimed so a crashed holder cannot deadlock | `runtime/core/fleet-bridge.js` (`tryClaim`/`releaseClaim`) |
| **idempotency keys / duplicate detection** | Ledger dedup by `(mission, runId)`; `runId` reuses the Checkpoint Engine's per-run `startedAt` token (not invented); a redundant second finalizer returns a NO-OP (`DUPLICATE_RUN`) | `runtime/core/mission-ledger.js` |
| **idempotent repeated action** | Fixers are pure — *applying twice == applying once* | `runtime/core/local-fixers.js` |
| **replay / resume without double effect** | Checkpoint resume boundary — completed stages are not re-run | `runtime/core/checkpoint-engine.js` |
| **deterministic merge / reconciliation** | `computeDifference` — deterministic, sorted-key before→after diff; `canonicalize` is order-independent | `runtime/core/state-transition.js` |

No separate lock manager, transaction coordinator, or new concurrency subsystem exists — and none is
required (see §5).

## 3. Reproduction (executed this session)

**A. Concurrency — fleet-bridge atomic claim** (SHIPPED `tryClaim`/`releaseClaim`, throwaway temp dir):

| # | Property | Result |
|---|---|---|
| C1 | same `requestId` claimed twice ⇒ first wins, second refused (no double effect) | **PASS** |
| C2 | released claim is reclaimable | **PASS** |
| C3 | distinct `requestId`s are independent (no false conflict) | **PASS** |
| C4 | stale lock (crashed holder, TTL expired) is reclaimed — no deadlock | **PASS** |

**B. Idempotence — ledger dedup guard** (faithful reproduction of the verbatim guard
`entries.some(e => e.mission===m && e.runId===r)`):

| # | Property | Result |
|---|---|---|
| I1 | repeated `(mission, runId)` deduped — one entry, `DUPLICATE_RUN` | **PASS** |
| I2 | a NEW run (distinct `runId`) is **not** masked | **PASS** |
| I3 | a DIFFERENT mission (reused `runId`) is **not** masked | **PASS** |
| I4 | `null` runId preserves append-always (no false dedup on the legacy path) | **PASS** |

**C. Compare-and-set (C03)** — stale/duplicate version rejected (I2), no-op rejected (I6): already
reproduced in P0-075 and re-covered by `state-transition.test.js`.

## 4. Proof gap found — and closed (within the authorized write-set)

- **Gap:** the fleet-bridge atomic claim is the Runtime's **only** real cross-process concurrency
  primitive, yet it had **no committed regression test** — only this session's reproduction. Under
  P0-076's "sufficiently proven" bar that is a genuine coverage gap (not a behavioural defect).
- **Action:** added `runtime/core/fleet-bridge.test.js` (test-only; no runtime source touched),
  exercising the shipped exports — the four properties above as committed assertions.
- **Concurrency subtlety caught during this work (P0-076-relevant evidence):** the first draft of the
  stale-reclaim case used `lockTtlMs: 0`, which is **wall-clock-flaky** — when the lock's mtime lands
  in the same millisecond, `age > 0` is false and staleness is non-deterministic (it passed in a full
  run by luck and failed standalone). Fixed to `lockTtlMs: -1` so `age (≥0) > -1` is unconditionally
  stale. The committed test is now deterministic (**5/5 standalone, 25/25 full runtime/core suite**).

## 5. Why no new concurrency infrastructure (reuse-first)

Every P0-076 concern maps to an **existing** mechanism (§2), each now reproduced correct (§3). The real
ODG paths are not racy in the way new infrastructure would address:

- The two ledger finalizers (pipeline stage + archive) run **sequentially in one `odg-run` process**,
  not concurrently — the `(mission, runId)` dedup is the correct guard for that repeated-finalizer
  path. A multi-writer ledger race is **not a real ODG path** (one autonomy process per run), so
  building cross-process ledger locking would be infrastructure for a path that does not exist —
  forbidden by the campaign and by the reuse-first rule.
- Genuine cross-process contention (fleet instances) is already owned by the `O_EXCL` lock.

Adding compare-and-set/merge/lock infrastructure beyond this would be structure "because the Master
mentions it" — the anti-pattern P0-072/P0-074 rejected.

## 6. Remaining optional hardening (NOT a defect, NOT performed)

A committed end-to-end test of `mission-ledger.recordMission` dedup would require either a generated-
fixture harness (contract + report + checkpoint) or a one-line testability seam exporting the pure
guard — the latter is a **runtime change** and is **NOT AUTHORIZED**. The guard is a verbatim
predicate already reproduced correct (§3B), so this is optional hardening for a future authorized item,
not a blocker to the CAS A verdict.

## 7. Classification & verdict

**CAS A — concurrency/idempotence already correct and sufficient.** No reproducible defect; no new
concurrency infrastructure required. Proof was strengthened by committing the previously-missing
fleet-bridge concurrency regression test (test-only, no runtime source change).

## 8. Authority frontier

No runtime source / schema / contract / API change performed. P0-077…P0-079 are NOT AUTHORIZED and are
not analyzed. Execution returns to the authority frontier.

## 9. Evidence index

- Surfaces: `state-transition.js` (I2/I6/`computeDifference`), `fleet-bridge.js` (`tryClaim`/
  `releaseClaim`), `mission-ledger.js` (`(mission,runId)` dedup), `local-fixers.js`, `checkpoint-engine.js`.
- Tests: **new** `fleet-bridge.test.js` (6 assertions, deterministic, 5/5); full `runtime/core` suite
  **25/25**; C03 `state-transition.test.js` green; reproduction probes C1–C4 / I1–I4 all PASS.
