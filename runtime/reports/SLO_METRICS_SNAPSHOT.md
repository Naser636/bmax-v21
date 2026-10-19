# SLO Metrics Snapshot (verified, point-in-time)

**Date:** 2026-10-19 · **HEAD:** `7d08099`+ (uncommitted Phase 17 work) · **Source:** `runtime/generated/mission-attempts.jsonl`
(git-ignored REAL telemetry — every LOCAL-route + autonomy-loop mission attempt, recorded at closure incl. failures/ERROR).
Produced by `mission-attempt-log.metricsSnapshot` (reuses `summarizeAttempts`; NO parallel counter) + `latency-measure`.
Values are a point-in-time reading and change as missions run — re-derive, never copy forward as "current".

> **HONESTY CAVEAT (registry contamination).** The attempt log is git-ignored and the **test harness appends to it on
> every `npm test`** (synthetic ids: `M0000`, `ENG2`, `ECO`, `__COVERAGE_INVARIANT__`, `__ER_*__`, …). Its absolute counts
> are therefore **non-deterministic and dominated by synthetic test missions** — NOT operational missions. Crossing the
> N=20 threshold here is a **test artifact, not a validated SLO**. The rate SLOs stay **NOT VALIDATED** until ≥20 *real,
> distinct operational* missions exist. No real-mission rate is claimed.
>
> **FIXED GOING FORWARD (§4.3):** the attempt-log path is now env-overridable (`ODG_ATTEMPTS_LOG`, default unchanged) and
> `npm test` redirects it to a throwaway temp file — a full suite run now leaves the real registry **unchanged (114→114,
> proven)**. Existing historical entries are PRESERVED (no deletion/reset — unauthorized). All 21 distinct ids currently in
> the registry are test/benchmark artifacts (`M0000`×27, `ENG2`, `__COVERAGE__`, `TEST_CONSEQUENTIAL_EXEC_GATE`, …): there
> are **0 real operational missions** recorded ⇒ the real-mission SLO denominator is effectively empty today.

## Counter (point-in-time, test-contaminated)
- **Before (prior snapshot):** 46 attempts / 14 distinct.
- **Now:** ~110 attempts / 21 distinct (grew purely from this session's suite runs — synthetic ids). Window
  2026-10-19T15:27:47Z → 21:59:59Z. Outcomes: RECORDED 69 · SKIPPED:FAILED 34 · SKIPPED:ERROR 7 (failures representable).

## Rate SLOs (CTO targets; honest verdicts)
| SLO | Target | Measured (contaminated) | Verdict |
|---|---|---|---|
| MISSION_SUCCESS_VERIFIED | ≥0.95 | 16/21 | **NOT VALIDATED** — denominator is synthetic test ids, not ≥20 real missions |
| MISSION_SUCCESS_FIRST_ATTEMPT | ≥0.90 | 15/21 | **NOT VALIDATED** — same reason |
| FORBIDDEN_ACTION_BLOCK | =1.0 (binary) | 0 executed forbidden effects | **PASS** (separate binary gate, never averaged) |

`metricsSnapshot` now returns `measurable:true` at N=21 ≥ 20; that is **mechanically correct but operationally meaningless
here** because the sample is test-generated. Do not read it as a validated success rate.

## §17 — TOTAL mission duration per run (reprises incl.) — NEW, DISTINCT from per-attempt latency
- `runId` is created once per logical execution and reused by every attempt/retry of that run (both routes:
  `LocalMissionRunner.run`, autonomy `runPipeline → runLocalPipeline`/`recoverLocally`). `metricsSnapshot.totalByRun`
  groups attempts by `runId`: **wall** time from the earliest `startedAt` to the latest `endedAt` across the run.
- **Observed:** ~61 runs now carry a `runId`; **49 historical attempts remain UNATTRIBUTED** (no `runId` — never
  reconstructed, per the measurement contract pt.4). All observed runs are **single-attempt** (no retry occurred in this
  data), so each run's total = its one attempt. The **multi-attempt** case (wall-total ≠ sum-of-latencies, reprise gap
  included) is proven by unit test (`totalDurationByRun`), **not yet by a live retry** — flagged, not fabricated.

## §17 — recovery/rollback duration
- `recoveryDurationFromIncidents(incidents.jsonl)` is wired (pure; caller does the fs read). The repo has no
  `runtime/generated/incidents.jsonl` (recovery runs are release-local) ⇒ **`measurable:false` — "incidents source absent
  or empty"** (honest; never fabricated). Proven measurable from a valid fixture by unit test.

## Speed baseline (per-attempt, MEASURED — targets reserved to the CTO)
- Per-attempt latency (all attempts carry real start/end): **median ≈42.5 ms · p95 ≈197.6 ms · max 237 ms** (n≈110,
  measurable ≥ minSampleN). Category = **uncategorized** (synthetic ids declare no `category`). This is a technical-control
  per-attempt latency — **NOT** total mission duration. Latency TARGETS remain unset (reserved); no threshold invented.

## Category taxonomy (§16/§17)
Categories derive STRICTLY from the mission contract's `category` (taxonomy: reliability-recovery, backup-restore,
deployment-release, security-governance, observability-slo, runtime-capability, testing-validation; default
uncategorized). §17 added durable `category` tags to the **2 git-tracked** contracts whose content is unambiguous:
`DEPLOY_BMAX_DASHBOARD_PROD_V1` → deployment-release, `AUTONOMOUS_PATCH_RECOVERY` → reliability-recovery. (Auto-generated
contracts are git-ignored/regenerated, so durable tagging of those requires a contract-factory change — deferred, not in
this write-set.) All current *recorded* attempts are synthetic ids with no category ⇒ **uncategorized** (not retrofitted).
