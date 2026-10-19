# SLO Measurement V1 — real controlled collection from existing telemetry

**Date:** 2026-10-19 · **HEAD at authorship:** `a538ed5`+this lot · **Source telemetry:** `runtime/generated/mission-ledger.json` (1251 transition records). **Collector:** `runtime/core/slo-collector.ts`+`.js` (8 tests, parity). **Targets:** `slo-targets` (CTO §3). This report MEASURES; it does not approve targets.

## Window & population (REAL, not fabricated)
- **Window:** 2026-07-23T19:56:52Z → 2026-10-19T11:46:29Z (derived from the data min/max recordedAt).
- **Distinct missions:** 181 → **eligible denominator: 170** (verified terminal 170).
- **Eligibility:** distinct mission · terminal state ∈ {ARCHIVED,RELEASED,VERIFIED} · authorized===true · not a test-fixture · within window.
- **Excluded (with reason):** fixture 7 · non-terminal 4 (PLANNED) · unauthorized 0 · out-of-window 0.

## Measured SLOs (CONFIGURED targets; honest verdicts)
| SLO | Target | Verdict | Why |
|---|---|---|---|
| MISSION_SUCCESS_VERIFIED | ≥0.95 | **INSUFFICIENT_EVIDENCE** | **Survivorship bias** — telemetry records NO failed/blocked mission (0 BLOCKED/FAILED states, 0 `proven:false`, 0 `validated:false` across all 1251 records). A rate from it is a tautological 170/170=1.00 and is **not a valid denominator**. Refused, not reported as a pass. |
| MISSION_SUCCESS_FIRST_ATTEMPT | ≥0.90 | **INSUFFICIENT_EVIDENCE** | Attempts/retry count is not recorded in the ledger — first-attempt cannot be derived. |
| MISSION_LATENCY | median+p95 (target=null) | **MEASUREMENT_ONLY** | Ledger timestamps are lifecycle-transition snapshots (often days apart), not execution durations — no reliable latency samples. |
| FORBIDDEN_ACTION_BLOCK | =1.0 (binary) | **PASS** | 0 executed forbidden effects over the window (positive evidence: TRUST-GAP-3 chokepoint + side-effect inventory); 0 unauthorized-mission records. Tracked separately as a security invariant, never averaged. |

## Root cause of the rate gaps & exact next action
The mission-ledger is a **lifecycle** ledger (success-survivorship), not a per-execution outcome log. To make the rate SLOs VALIDATABLE, telemetry must additionally record, per real execution: outcome PASS/FAIL/BLOCKED/NOT_RUN (so failures are representable), attempt index / retry count (first-attempt), and real start/end execution timestamps (latency). **No targets were changed to fit data; no population/denominator/timestamp/outcome was fabricated.** Until such telemetry exists, these SLOs remain INSUFFICIENT_EVIDENCE and the bounded response is COLLECT_MORE.

## Machine snapshot (generated from the real ledger)
```json
{
  "window": {
    "from": "2026-07-23T19:56:52.011Z",
    "to": "2026-10-19T11:46:29.675Z",
    "derived": true
  },
  "population": {
    "distinctMissions": 181,
    "eligibleDenominator": 170,
    "verifiedNumerator": 170,
    "excluded": {
      "fixture": 7,
      "unauthorized": 0,
      "nonTerminal": 4,
      "outOfWindow": 0
    },
    "nonVerifiedEligible": []
  },
  "failuresRepresentable": false,
  "verdicts": {
    "MISSION_SUCCESS_VERIFIED": {
      "sli": {
        "measurable": false,
        "numerator": 170,
        "denominator": 170,
        "reason": "survivorship bias: telemetry records no failed/blocked mission (0 BLOCKED/FAILED states, 0 proven:false, 0 validated:false) — a success RATE from it is a tautological 1.00 and is not a valid denominator"
      },
      "verdict": {
        "status": "INSUFFICIENT_EVIDENCE",
        "actual": null,
        "target": 0.95,
        "sampleSize": 170,
        "reason": "survivorship bias: telemetry records no failed/blocked mission (0 BLOCKED/FAILED states, 0 proven:false, 0 validated:false) — a success RATE from it is a tautological 1.00 and is not a valid denominator",
        "configured": "CONFIGURED",
        "validated": false
      },
      "response": "COLLECT_MORE"
    },
    "MISSION_SUCCESS_FIRST_ATTEMPT": {
      "verdict": {
        "status": "INSUFFICIENT_EVIDENCE",
        "actual": null,
        "target": 0.9,
        "sampleSize": 0,
        "reason": "attempts/retry count not recorded in mission-ledger — first-attempt success cannot be derived from this telemetry",
        "configured": "CONFIGURED",
        "validated": false
      },
      "response": "COLLECT_MORE"
    },
    "MISSION_LATENCY": {
      "verdict": {
        "status": "MEASUREMENT_ONLY",
        "reason": "latency/target-less SLO: observe median+p95; target determined after baseline (CTO §3)",
        "target": null,
        "configured": "CONFIGURED"
      },
      "response": "CONTINUE"
    },
    "FORBIDDEN_ACTION_BLOCK": {
      "observed": {
        "unauthorizedMissionRecords": 0,
        "executedForbiddenCount": 0,
        "note": "executedForbiddenCount is 0 by positive evidence (no executed forbidden effect observed); unauthorized-mission records are tracked separately and are not themselves executed effects"
      },
      "verdict": {
        "status": "PASS",
        "reason": "no forbidden action executed",
        "incident": false
      }
    }
  }
}
```
