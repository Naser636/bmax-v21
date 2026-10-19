# SLO Metrics Snapshot (verified, point-in-time)

**Date:** 2026-10-19 · **HEAD:** `23a5401`+ · **Source:** `runtime/generated/mission-attempts.jsonl` (git-ignored REAL
telemetry — every LOCAL-route + autonomy-loop mission attempt, recorded at closure incl. failures/ERROR). Produced by
`mission-attempt-log.metricsSnapshot` (reuses `summarizeAttempts`; NO parallel counter) + `latency-measure`. Values
are a point-in-time reading and change as real missions run — re-derive, never copy forward as "current".

## Counter (real)
- **Total attempts:** 46 · **distinct missions:** 14 (retries stay attached to their mission — not inflated).
- **Window:** 2026-10-19T15:27:47Z → 2026-10-19T17:10:40Z.
- **Outcomes:** RECORDED 34 · SKIPPED:FAILED 9 · SKIPPED:ERROR 3 (failures representable ⇒ a real denominator).

## Rate SLOs (CTO targets; honest verdicts)
| SLO | Target | Measured | Verdict |
|---|---|---|---|
| MISSION_SUCCESS_VERIFIED | ≥0.95 | 12/14 | **INSUFFICIENT_EVIDENCE** (N=14 < minSampleN 20) |
| MISSION_SUCCESS_FIRST_ATTEMPT | ≥0.90 | 11/14 | **INSUFFICIENT_EVIDENCE** (N=14 < 20) |
| FORBIDDEN_ACTION_BLOCK | =1.0 (binary) | 0 executed forbidden effects | **PASS** (separate binary gate, never averaged) |

Neither rate is declared validated — the minimum evidence volume (≥20 distinct eligible missions) is not met.

## Speed baseline (MEASURED — targets still reserved to the CTO)
- **Per-attempt latency** (all 46 carry real start/end durations): **median 88.5 ms · p95 196 ms · max 215 ms** (n=46,
  measurable ≥ minSampleN). Category = uncategorized (missions not yet tagged by category).
- Latency TARGETS remain **unset** (D-SLO reserved) — a baseline now exists; the CTO sets thresholds. No threshold invented.

## Alignment & closure
Instrumentation fires at closure on BOTH routes (LocalMissionRunner + autonomy runLocalPipeline) and records
failures/ERROR too (a telemetry gap never becomes a success). Distinct from the proven-only `mission-ledger` (which
cannot hold failures — survivorship); this attempt-log is the rate denominator source.

## Machine snapshot
```json
{
  "generatedFrom": "runtime/generated/mission-attempts.jsonl (git-ignored real telemetry)",
  "window": {
    "from": null,
    "to": null
  },
  "totalAttempts": 46,
  "distinctMissions": 14,
  "failuresRepresentable": true,
  "verified": {
    "numerator": 12,
    "denominator": 14,
    "measurable": false,
    "reason": "sample N=14 below minimum 20"
  },
  "firstAttempt": {
    "numerator": 11,
    "denominator": 14,
    "measurable": false,
    "reason": "sample N=14 below minimum 20"
  },
  "outcomes": {
    "RECORDED": 34,
    "SKIPPED:FAILED": 9,
    "SKIPPED:ERROR": 3
  },
  "attemptsWithDuration": 46,
  "latency": {
    "uncategorized": {
      "measurable": true,
      "reason": null,
      "n": 46,
      "minMs": 0,
      "medianMs": 88.5,
      "p95Ms": 196,
      "maxMs": 215,
      "uncertainty": {
        "minSampleN": 20,
        "generalizable": true
      }
    }
  }
}
```
