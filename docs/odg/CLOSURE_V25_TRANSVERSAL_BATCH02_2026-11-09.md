# V12.4 — V25: Transversal Batch 02 — L4 / Recovery / Learning-loop (measured) 2026-11-09

Executes the three V24-prepared chantiers with REAL measurements, independent assurance (distinct verification paths),
and mandatory falsifications. All fixtures/histories are SYNTHETIC and unblock nothing canonical.

## A. Initial state
HEAD=origin/main=`60f14bd`; tracked tree clean (5 stashes / 6 untracked preserved). Reused the REAL mechanisms (not
rebuilt): `repair-workflow.makeWriteSetGuard`, sha256-sealed checkpoints, `reuse-ledger` + `improvement-baseline`. VPS:
only SSH:22 public; radar timer active; edg-core loopback. These chantiers are pure in-repo measurement harnesses — no VPS
deploy applicable (justified §7).

## B. Chantier 1 — L4 native engineering benchmark (measured)
`runtime/core/l4-engineering-benchmark.ts` measures the GOVERNED accept/reject decision over 7 SYNTHETIC seeded defects,
using the REAL write-set guard + an INDEPENDENT verifier (distinct from the proposer's initial check) as the arbiter.
**Mandatory cases — all correct:** simple-correct ⇒ ACCEPT · complex-with-deps ⇒ ACCEPT · regression-bad-fix ⇒ REJECT ·
partial-fix ⇒ REJECT · out-of-write-set ⇒ REJECT (write-set guard) · passes-initial-fails-independent ⇒ REJECT (false
success caught) · unresolved ⇒ UNRESOLVED (recognized, not a false success).
**Measures (denominator published):** denominator 7, resolvable 6, excluded 1 (unresolved); acceptance-rate-of-should-
accept **1.0**; bad-fix-rejected-rate **1.0**; **false-success-survived = 0** (the governance caught every bad fix,
including the one that passed an initial check); write-set-violations-blocked 1; verdict-accuracy **1.0**.
**Limit:** the repair PROPOSER is a seam (the live local-model repair path was proven separately, L0-L4); this benchmark
measures the GATE's ability to recognize an incorrect fix — which is the "reconnaître un correctif incorrect" requirement.

## C. Chantier 2 — Recovery & rollback drill (measured, isolated)
`runtime/core/recovery-drill-benchmark.ts` — ISOLATED in-memory only (never touches real VPS data/services/checkpoints).
Checkpoints are sha256-sealed; the restored state is compared to an INDEPENDENT reference snapshot (not the mechanism's
self-report). **Mandatory cases:** interrupt-before-checkpoint ⇒ resume REFUSES; interrupt-after-checkpoint & during-
modify ⇒ resume restores the checkpoint; repeated resume & rollback ⇒ idempotent; corrupt/incomplete checkpoint ⇒
DETECTED ⇒ REFUSED. **Measures:** corrupt-detected **true**; resume-idempotent **true**; rollback-idempotent **true**;
restored-matches-independent-reference **true**; refuses-when-not-recoverable **true**; **silent-losses = 0**.
**Falsification:** a tampered checkpoint fails verification ⇒ resume refuses (fail-closed).

## D. Chantier 3 — Learning-loop efficacy (measured, real reuse-ledger)
`runtime/core/learning-loop-benchmark.ts` — composes the REAL `reuse-ledger` over a SYNTHETIC precedent history in an
injected in-memory store (never the real ledger). **Groups:** A (no ledger — control), B (ledger — suppress net-
regressors), C (adversarial history). **Independent assurance:** net-regression is re-derived directly from raw deltas
(`improvement-baseline.measureDelta`, a path distinct from the ledger flag) and must AGREE with the ledger.
**Measures:** ground-truth regressors = {net-regress, local-win-global-loss, stale-once-good}; **all 3 SUPPRESSED** by the
ledger; regressions-if-no-ledger 3 → regressions-avoided **3** (net improvement over control **1.0**); regressors-missed
**0**; genuine-wins-wrongly-suppressed **0** (the genuine-win precedent stays reusable); ledger-agrees-with-independent
**true**. **Falsifications caught:** a local-improvement/global-regression precedent is suppressed (a one-metric win is
NOT a universal rule); a once-good-now-failing precedent is suppressed.

## E. Independent assurance (common)
Each chantier uses a verification path DISTINCT from the tested mechanism: C1 an independent verifier ≠ the proposer's
initial check; C2 an independent reference snapshot ≠ the recovery self-report; C3 a raw-delta recomputation ≠ the ledger
flag. All falsifications (bad fix / tampered checkpoint / net-regressor) are REJECTED. Results distinguish PASS (all three)
with no FAIL/BLOCKED/NOT_MEASURABLE. Gate 408/408; all three suites in the canonical gate.

## F. Integration & VPS
Integrated canonically (3 modules + 3 tests on main, gate 408/408, tsc clean, CI). **VPS: not applicable** — these are
pure in-repo measurement harnesses, not deployed services (§7 justification). No service created/changed; no public port;
no deploy claimed.

## G. Remaining defects / limits
- None introduced. C1's live local-model repair rate is not re-measured here (proven separately; the live model is slow +
  non-deterministic, so the reproducible gate benchmark uses a proposer seam — stated honestly, not hidden).
- Synthetic histories/defects are explicitly SYNTHETIC and unblock nothing canonical.

## H. Next batch prepared (V26, audited — NOT executed)
1. **Live local-model L4 micro-run** — a BOUNDED, measured real repair of ONE seeded defect via the local 3B model end-to-
   end (detect→generate→write-set guard→independent test), reporting tok/s + accept/reject + a falsification. Prereq:
   ollama-provider + l4-campaign; bounded timeout. Acceptance: ≥1 real-model repair independently verified, measured.
2. **Governance self-audit coverage** — measure how much of ODG's own governance (Truth Lock, permissions, write-set,
   promotion-assurance) is independently test-covered, and close the largest real gap. Reuse: the gate + architecture-audit.
3. **VPS operational reliability probe** — a read-only measured check of the private services' health/persistence/recovery
   on the VPS (radar timer firing history, preprod health, audit-chain integrity on disk), with no mutation.

Each reuses existing capabilities; synthetic stays SYNTHETIC. Execution deferred to V26.

## I. Boussole
Register reconciled (new item `serie30-v25-transversal-batch02`). Gate 408/408. HEAD=origin/main=`60f14bd`. §10
restrictions intact (Truth Lock, 9 primitives, permissions/write-sets, private VPS, SSH:22 only, edg-core 127.0.0.1:8080,
no net, no spend, no secret, no deletion, no background task). Three chantiers CLOSED = PASS (contract satisfied, positive
+ negative pass, falsifications caught, independent assurance conclusive, measures documented).
