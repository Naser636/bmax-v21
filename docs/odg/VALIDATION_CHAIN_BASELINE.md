# Validation-Chain Performance Baseline (Engineering Intelligence — E-MEASURE)

**Measured 2026-11-08, synchronous, `/usr/bin/time -f '%e'` (elapsed seconds), repeated runs.**

| Step | Samples (s) | P50 | Calls/gate | Gate contribution (P50) |
|---|---|---|---|---|
| per-suite `tsx` cold-start | 1.98 | 1.98 | **367** | **~727 s** (dominant) |
| `tsc --noEmit` | 6.40 / 6.27 / 6.18 | 6.27 | 1 | 6.3 s |
| `odg verify` (build+tsc+contracts) | 35.77 | 35.77 | 1 (cert points) | 35.8 s |
| campaign-controller (1 suite) | 1.64 / 1.77 | 1.70 | 1 | 1.7 s |
| `build:runtime` (pretest) | 1.80 | 1.80 | 1 | 1.8 s |

**Bottleneck (measured): `test:report` = 367 suites, each spawning a fresh `tsx` process (~2 s cold-start).**
The per-suite startup × 367 (~727 s serial; parallelized across workers) is **>90 % of total P50** and dwarfs tsc/verify.

**Highest-yield acceleration (next missions, in order):**
1. **Test-impact selection** — run only the suites affected by a change for TARGETED validation (honest: unrun suites are NOT declared PASS; full gate stays mandatory at certification). Reuses `affected-tests.ts` + `change-impact-graph.ts`.
2. **Reduce per-suite startup** — shared tsx runtime / batched execution instead of one cold process per suite.
3. **Verified result cache** — accept a cached suite result only with identical inputs/code/deps/config/env + provenance + freshness (§4).
4. Worker balancing, incremental computation, flaky-test intelligence, deterministic replay.

**Quality guardrail (§4, non-negotiable):** a test not executed in a targeted validation is NEVER PASS; mandatory controls + Truth Lock + full campaigns remain at their certification points; uncertainty WIDENS validation, never reduces it.
