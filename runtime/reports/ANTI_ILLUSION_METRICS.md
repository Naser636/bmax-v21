# ODG — Anti-Illusion Metrics Catalog (Phase D)

**Date:** 2026-10-18 · **Base:** targeted gap-fill milestone (post-afa1cad).
**Purpose:** a single honest definition of every operational indicator ODG reports. Each row carries
*definition · numerator · denominator · data source · period · limits · proof*. **No indicator is
aggregated into a single global "ODG score".** The deterministic benchmark and the live autonomy rate are
measured and reported **separately** and must never be conflated. Values below are "last observed" — refresh
from the cited artifact; treat each as a reading, not a standing claim.

> Reuses existing components only (`autonomy-measure`/`autonomy-rate`, `capability-registry`,
> `self-diagnostic`, `odg-cockpit`, `scripts/odg-autonomy-benchmark`). No new primitive; the 9 primitives
> are unchanged. This catalog is documentation over those sources, not a new measurement engine.

---

## 1. Autonomy — LIVE (production-measured)

| field | value |
|---|---|
| **Definition** | Share of *autonomy-eligible* objectives that ODG executed AND that were independently evidence-verified (`ODG_EXECUTED_VERIFIED`), per mission. |
| **Numerator** | objectives with attribution verdict `EVIDENCED` (status `EXECUTED` + non-null evidence + non-empty evidence probe). |
| **Denominator** | objectives declaring genuine `authorization:{eligible:true,authorized:true}` (the eligibility gate) — NOT all objectives. |
| **Data source** | `runtime/generated/autonomy-rate.json` (written by `odg-state` from `objective-attribution.json`). |
| **Period** | per mission run (last run only; not a rolling average). |
| **Limits** | Per-mission denominators are small (1–3). **These are NOT generalizable to a single ODG-wide %.** `measurable:false` is reported honestly, never coerced to a number. |
| **Proof** | `autonomy-measure.ts` (numerator requires `verified===true`; null/ambiguous denominator ⇒ `notMeasurable`); bench `autonomy-capability-mission`. |
| **Last observed** | 3 missions at per-mission 100%: GOVERNED_DASHBOARD_OBSERVABILITY 1/1, CLEAN_RUNTIME_WORKSPACE 3/3, PROVIDER_ENABLED_SMOKE_V1 1/1 → **5 objectives VERIFIED**. 29 roadmap objectives have no verifying capability (left unmeasured, not fabricated); 2 are human-gated. |

## 2. Autonomy — BENCHMARK (deterministic scorer — DISTINCT from §1)

| field | value |
|---|---|
| **Definition** | Deterministic score of the autonomy classifier over a FIXED fixture set — a regression guard on the scorer, **not** a measure of live ODG behavior. |
| **Numerator / Denominator** | `ODG_EXECUTED_VERIFIED` fixtures / eligible fixtures = **2 / 8**. |
| **Data source** | `scripts/odg-autonomy-benchmark.js` (9 scenarios, provenance `cdf057f1fa3d1c1b`). |
| **Period** | fixed (changes only if the scorer or fixtures change). |
| **Limits** | **25% is a fixed fixture property, not ODG's live autonomy.** Never report it as "how autonomous ODG is." |
| **Proof** | `scripts/odg-autonomy-benchmark.test.ts`; provenance hash pinned. |
| **Last observed** | `autonomyPercent=25` (2/8). |

## 3. Objectives — executed/verified vs blocked vs no-capability vs human-gated

| field | value |
|---|---|
| **Definition** | Category breakdown of objective outcomes (the anti-illusion split: verified ≠ executed ≠ blocked ≠ not-run ≠ human-mandatory). |
| **Numerator/Denominator** | each category count / total classified (per mission). |
| **Data source** | `autonomy-rate.json:measure.categories`; `objective-attribution.json`. |
| **Period** | per mission run. |
| **Limits** | "no capability" objectives are deliberately **left unmeasured** (no probe/capability) — they are NOT counted as failures and NOT fabricated into eligibility. |
| **Proof** | `autonomy-measure.ts` classify(); cockpit AUTONOMY attribution line. |
| **Last observed** | across the roadmap: 5 VERIFIED, 29 no-capability (unmeasured), 2 human-gated. |

## 4. Capability coverage

| field | value |
|---|---|
| **Definition** | Registered/ready capabilities vs declared-but-missing. |
| **Numerator/Denominator** | ready / (ready+missing). |
| **Data source** | `runtime/generated/capability-registry.json`. |
| **Period** | per `odg-state` refresh. |
| **Limits** | "ready" = registered + resolvable, **NOT** "exercised on an execution path." Execution-path coverage is a separate, partially-covered concern (see §8). |
| **Proof** | `capability-registry.ts`; `capability-metrics` success-rate store. |
| **Last observed** | ready **185**, missing **24**. |

## 5. Regressions / divergences (expected-vs-observed)

| field | value |
|---|---|
| **Definition** | Count + severity of divergences between the mission's expected state and observed execution. |
| **Numerator/Denominator** | divergences / checks in the catalogue. |
| **Data source** | `runtime/generated/self-diagnostic-report.json`. |
| **Period** | per `odg diagnose` run. |
| **Limits** | Divergence categories are bounded to the implemented catalogue; absence of divergence ≠ global correctness. **New this milestone:** `tampered-evidence` (stamped evidence whose digest fails) and a required-proof **existence fallback** when completion is expected without a probe. |
| **Proof** | `self-diagnostic.ts` detectDivergences; `self-diagnostic.test.ts` (64 assertions incl. the 2 new classes). |
| **Last observed** | `NO_DIVERGENCE`, converged, 0 divergences. |

## 6. Recovery / resume

| field | value |
|---|---|
| **Definition** | Whether the runtime can recover (dist → rebuild → committed-JS fallback → fail-closed) and resume from checkpoints. |
| **Numerator/Denominator** | n/a (capability predicate, not a ratio). |
| **Data source** | `odg-recover` planner + `executeRecovery` seam; `checkpoint-engine`; `build-recovery-report.json`. |
| **Period** | on demand. |
| **Limits** | FAIL_CLOSED is honest refusal (exit 2), never a false success. **Fixed this milestone:** the CLI fallback branch now actually SPAWNS the committed-JS fallback instead of exiting 0 with nothing run. |
| **Proof** | `odg-recover.test.ts` (23 assertions incl. the execute-seam false-success cases); `idempotency-live.test.ts`. |

## 7. Learning — captured / persisted / reused / effective

| field | value |
|---|---|
| **Definition** | Whether proven repairs are captured, persisted, recalled, replayed, and whether reuse improved outcomes. |
| **Numerator/Denominator** | reused entries / recalled entries (reuseCount); effective = baseline deltas with no regression. |
| **Data source** | `patch-memory` (hit/list/reuseCount), `capability-learning`, `improvement-baseline` (measureDelta), `post-release-learning`. |
| **Period** | cumulative (autonomy-store). |
| **Limits** | **Known gap (deferred, documented):** patch-memory entries carry authorship provenance but **no source-revision stamp**; a content-digest *fail-closed* gate was evaluated and REJECTED as semantically unsound (record() runs post-fix; legitimate reuse replays against the pre-fix state, so a full-file digest would never match on genuine recurrence and would break reuse). Reuse-efficacy is not yet surfaced in the cockpit. |
| **Proof** | `patch-memory-reuse-accounting.test.ts`; `improvement-baseline.test.ts`. |

## 8. Execution-path coverage, cost/toil, SLO targets — honestly-stated GAPS

| indicator | status | honest note |
|---|---|---|
| Execution-path coverage | **PARTIAL** | capability *registration* is measured (§4); which capabilities are exercised on a live path is only partially known (guard sweeps exist for entrypoints, not all). Not a single number. |
| Cost / duration / toil-avoided | **DATA EXISTS, NOT SURFACED** | `live-cost-metering` (observationOf/deriveValuation) + checkpoint timestamps hold the data; no dashboard indicator yet. Deferred (no fabricated value in the meantime). |
| SLO target / error budget | **DELIBERATE NON-GOAL (for now)** | SLIs are reported with explicit denominators (§1–§5); **no target is asserted** because a defensible target has no basis yet. Reporting a target we can't justify would itself be an illusion. Recommendation: define targets with provenance before adding a WITHIN/BREACH evaluator (`evaluateObjective` design captured in the SRE audit). |

---

## Anti-illusion invariants (enforced)
1. **No global ODG %.** Only per-mission, per-indicator readings with denominators.
2. **Benchmark (25%, fixed) ≠ live autonomy.** Reported in separate rows; never summed or averaged.
3. **`measurable:false` stays false.** Never coerced to a number; no-capability objectives stay unmeasured.
4. **Verified ≠ executed ≠ declared.** PLAN/INTENTION/DECLARATION are never counted as executed.
5. **Small-sample 100% is not generalized.** §1's per-mission 100% applies to denominators of 1–3 only.
