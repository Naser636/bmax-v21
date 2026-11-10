# V12.4 — V37 LOT E: Per-dimension measured intelligence (no global score) — LOCAL 2026-11-10

CTO V37 LOCAL campaign (no push/VPS). LOT E composes the EXISTING benchmarks' measured results into an honest
per-dimension scorecard. HARD RULE honored: no single global score.

## Capability — `intelligence-scorecard.ts` (PURE, fail-closed, gate suite)
`buildScorecard(dimensions)` — each dimension carries value + denominator + data kind (REAL/SYNTHETIC/SIMULATED/
ADVERSARIAL, never conflated) + a measurability flag. **No single global score** (would mask the weakest dimension); the
WEAKEST measurable dimension is surfaced; a no-denominator dimension is NOT_MEASURABLE (never scored favourably); a
SYNTHETIC/SIMULATED/ADVERSARIAL result is flagged as NOT real operational performance. `comparePredictionToOutcome`
measures a prediction vs the real result (prediction↔reality, §6). 

## Measured honest view of this program (self-applied)
Applying the scorecard to the session's real measures: native-3-file-build = REAL (3/3); repair-false-success / recovery-
no-silent-loss / FDIR-0-false-success = SYNTHETIC (flagged, not real operational); calibration-on-real-data = NOT_MEASURABLE
(the register has 0 recorded failures — V34/V35 bias). The weakest/least-demonstrated area is honestly surfaced, not
averaged away: **real operational calibration remains un-measurable until failure outcomes accumulate** (V35/V36 mechanism).

## Falsifications caught
no global score · weakest surfaced · no-denominator ⇒ NOT_MEASURABLE · synthetic flagged (not real operational) · unknown
kind ⇒ UNSPECIFIED · prediction-vs-outcome compared.

## Scope / provenance (LOCAL ladder)
`intelligence-scorecard` : REGISTERED + CONNECTED + CALLABLE + EXECUTED + **VERIFIED (local gate)**. NOT DEPLOYED/
OPERATIONAL. Provider-authored framework. LOCAL commit only — NOT pushed, NOT origin/main, NOT VPS.
