# V12.4 — V35: LOT B2 — Mission outcome evidence (success AND failure) to un-bias calibration (2026-11-10)

CTO V35 authorizes LOT B2 (was PROPOSED). Builds the mechanism to record REAL per-attempt outcomes — including FAILURES —
so calibration (V34) can be fed an UNBIASED sample. No parallel memory: it composes the ledger-store seam + calibration.ts.
V31–V34 preserved, not interrupted.

## §2 — Audit: the canonical point to record outcomes
reuse-ledger records REUSE outcomes (deltas); the closure-register records governance CLOSURE decisions (no failures, the
V34 bias). Neither records a per-attempt mission EXECUTION outcome. The demonstrated gap ⇒ a thin append-only
`mission-outcome-ledger` over an injected store (same seam as reuse-ledger — NO new DB), feeding calibration.

## §3 — Distinct outcome kinds (never conflated) — `mission-outcome-ledger.ts` (PURE, fail-closed, gate suite)
Records SUCCESS / FAILURE / BLOCKED / CANCELLED / DEFERRED / UNKNOWN per (missionId, attempt), with metier, type, evidence,
provenance, independentVerification, componentVersion, timestamp. **A POLICY BLOCKED is NOT a technical failure (censored);
a never-executed mission is NOT an execution failure (censored); a failed attempt followed by a success keeps BOTH events.**

## §4/§5 — Provenance + composition with calibration
`classifyForCalibration` counts ONLY an INDEPENDENTLY-VERIFIED success/failure; BLOCKED/CANCELLED/DEFERRED/UNKNOWN and any
unverified outcome are CENSORED (never silently counted). `buildCalibrationSample(outcomes, {basis})` produces
{successes, failures, censored, unverified} WITHOUT double counting — **attempt basis** (every verified attempt, keeping a
failure+retry as two) vs **mission basis** (the FINAL verified outcome of the latest attempt). This feeds
`calibration.calibratedEstimate` / `brierScore` directly. The UNKNOWN/BIASED/DEGRADED/CALIBRATED states are preserved; an
estimate never authorizes a mission. **The V33/V34 history is NOT rewritten** — this adds a forward record.

## §6 — Falsifications caught (tested)
verified success · verified failure · failure-then-retry-success (attempt keeps both; mission uses the final) · POLICY-
blocked (censored, not a failure) · never-executed CANCELLED/DEFERRED (censored) · UNKNOWN (censored) · unverified
success/failure (EXCLUDED, no artificial confidence) · duplicate (missionId,attempt) (deduped) · malformed/unknown-outcome
(rejected, not stored). None produces artificial confidence.

## §7 — Progress measurement (honest)
**Mechanism proven:** a FAILURE-inclusive VERIFIED sample (30 success / 10 failure, 40 obs) runs through
`calibratedEstimate` ⇒ **CALIBRATED** (uncertainty reported), whereas the V34 all-success sample (20/0) ⇒ **BIASED**. So
recording failures REMOVES the survivorship bias and unlocks a usable calibration. **Honest caveat (real data):** the real
closure-register still has **0 recorded failures**, so a calibration over REAL current data remains BIASED/DEGRADED/UNKNOWN
until genuine per-attempt outcomes accumulate in THIS ledger. The ledger is the mechanism to accumulate them going
forward; **no calibration is claimed on insufficient/biased real data** (§7). Brier/reliability re-measure is meaningful
only once the ledger holds a representative verified sample — deliberately not faked on synthetic data presented as real.

## §8/§9 — Scope, governance, closure
`mission-outcome-ledger` : REGISTERED + CONNECTED (feeds calibration) + CALLABLE (gate) + EXECUTED (sample built) +
**VERIFIED** (falsifications). Not DEPLOYED/OPERATIONAL (in-repo capability; wiring the mission lifecycle to emit outcomes
here is a later authorized step). Provenance: provider-authored framework (record/statistics control-logic deterministic +
fail-closed). Restrictions intact (Truth Lock, 9 primitives, permissions, private VPS, SSH:22 only, edg-core loopback, no
spend/secret/exposure/Docker; no auto-delegation; FDIR-live NOT activated; Program C stays PROPOSED).

## Boussole + next (LOT C proposed, not authorized)
Register reconciled (new item `serie30-v35-mission-outcome-ledger`). HEAD=origin/main=`44042ad`. **Proposed next: LOT C —
intelligent coordination of the fifteen métiers** (dynamic selection of the relevant subset, dependency ordering, cross-
verification, measured collaboration gain) — WITHOUT reopening the closed V17–V23 qualification; built on the existing
metier-parcours orchestrator (improve, no new orchestrator). Status: PROPOSED (needs CTO authorization). A separate
authorized step would wire the real mission lifecycle to emit outcomes into this ledger (the true calibration data source).
