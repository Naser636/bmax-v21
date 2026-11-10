# V12.4 — V34: LOT B — Empirical estimation, calibration & selection-bias guard (2026-11-10)

CTO V34 rule honored: improve/compose, no new memory/registry/data-engine. The decisive result is HONEST: the V33
register-based success estimate was SELECTION-BIASED, and LOT B now measures calibration and REFUSES artificial confidence
from a biased source. V31–V33 preserved, not interrupted.

## §2 — Data audit / reconciliation (verifiable)
Register: **410 items — 395 ACCEPTED, 15 open (9 BLOCKED / 3 IN_PROGRESS / 3 DEFERRED), 0 REJECTED/FAILED.** The "409
observations / P=0.9633" from V33 = items(410) minus the 1 probe, treated as a success-rate. **Finding (the bias §2 asks
to detect):** the register records governed CLOSURE decisions; a mission that fails/stalls rarely becomes an ACCEPTED-
flippable item, and there are **0 recorded FAILED/REJECTED items**. Therefore the ACCEPTED-rate is a **survivorship-biased
proxy, NOT an unbiased P(success)** — using it as a prediction would be the "artificial confidence" §3 forbids.

## Capability — `runtime/core/calibration.ts` (PURE, fail-closed, gate suite)
Composes (does not replace) the estimator. Provides:
- **§4 calibration measurement:** `brierScore` (mean (p−outcome)², 0=perfect) + `reliabilityBins` (predicted-vs-observed
  curve) + `calibrationVerdict` (CALIBRATED only with a sufficient sample AND Brier ≤ bound; insufficient ⇒ not calibrated
  by default). **No single global score** that hides a weak category (§4).
- **§3 estimator guard — `calibratedEstimate`:** wraps a raw estimate and returns a QUALITY: **UNKNOWN** (no data),
  **BIASED** (observations but ~0 recorded failures — survivorship), **DEGRADED** (insufficient < 20 obs, or stale), or
  **CALIBRATED** (sufficient + failures represented). Uncertainty (~1/√n) is reported, never hidden. **A missing datum is
  never a success; an estimate NEVER authorizes a mission (`authorizes:false` always).**

## Before/after (the measured improvement = honesty + calibration)
- **V33 (before):** served `P(serie30)=0.9633` from the register as a success estimate.
- **V34 (after):** the SAME estimate is flagged **BIASED** by `calibratedEstimate` — "survivorship bias: 395 successes and
  0 recorded failures … NOT usable as calibrated confidence; authorizes:false." The planner's estimates are now
  **honestly quality-tagged** (UNKNOWN/BIASED/DEGRADED/CALIBRATED) instead of over-confident. This is the real gain: ODG's
  predictions become more RELIABLE by refusing to present a biased rate as a calibrated probability.

## §7 — Falsifications caught
empty ⇒ UNKNOWN · survivorship (0 failures) ⇒ BIASED · insufficient sample ⇒ DEGRADED · sufficient-with-failures ⇒
CALIBRATED · stale ⇒ DEGRADED · Brier low for calibrated / high for confident-but-wrong · insufficient predictions ⇒ not
calibrated by default · an estimate of ANY quality never authorizes a mission.

## §5 learning loop — honest status
The verified-only reuse-ledger (V25) is the existing mechanism; feeding it UNBIASED outcome labels requires recording
FAILURES too (the register does not). **The precise gap:** ODG lacks an unbiased mission-outcome dataset — the key
prerequisite for a genuinely CALIBRATED success model. Until failures are recorded (or a labelled outcome set exists),
the estimator correctly returns BIASED/DEGRADED/UNKNOWN. Recording per-mission outcomes (success AND failure) into the
ledger is the next LOT (no parallel memory) — flagged, not faked.

## §8 — Scope / VPS ladder
`calibration` : REGISTERED + CONNECTED (composes the estimator) + CALLABLE (gate) + EXECUTED (applied to the real
register) + **VERIFIED** (falsifications). Not DEPLOYED/OPERATIONAL as a live service. In-repo capability.

## Provenance & security
`calibration.ts` + test = provider-authored framework (statistical control-logic deterministic + fail-closed). §8
restrictions intact (Truth Lock, 9 primitives, permissions, private VPS, SSH:22 only, edg-core loopback, no spend/account/
secret/third-party/exposure/Docker; no auto-delegation; FDIR→planner live wiring NOT activated; Program C stays PROPOSED).

## Boussole + next
Register reconciled (new item `serie30-v34-calibration-bias-guard`). HEAD=origin/main=`46ba79c`. **Next recommended LOT
(PROPOSED, needs authorization):** record per-mission OUTCOMES (success AND failure) into the reuse-ledger to build an
unbiased calibration set, then re-measure Brier/reliability per mission type — the prerequisite to a genuinely calibrated
estimator. Dependencies: reuse-ledger (exists), this calibration module (built). Status: PROPOSED.
