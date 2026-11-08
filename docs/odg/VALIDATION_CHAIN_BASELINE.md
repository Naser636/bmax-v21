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

## E-COLDSTART (measured + adversarial, 2026-11-08)

- **tsx cold-start ≈ 1.85 s/suite** vs **node ≈ 0.18 s** — tsx startup is **≈95 % of each suite's time** (test bodies run in ~0.05 s). Per-suite times are uniform (~1.8–1.9 s), confirming cost ≈ cold-start, not test logic.
- **Reconciliation:** 369 × 1.85 s ≈ **683 s serial**; the **~187 s gate** = parallelism across **8 cores** (nproc=8). The earlier ~727 s figure used the 1.98 s lightest suite; the real average is ~1.85 s.
- **Worker scaling (20-suite subset):** W=4 → 8.67 s, W=10 → 6.77 s; beyond cores (8) extra workers don't help. **Recommendation: workers ≤ cores (≈ cores−1).**
- **ADVERSARIAL REJECTION — esbuild-bundle+node (REJECTED_UNSAFE):** bundling a suite and running it on node is ~11× faster (0.17 s) BUT (a) a failing `assert.ok(false)` exited **0** — it **swallowed the failure**, and (b) it broke the dual CJS/ESM export interop (`selectValidation is not a function`). **A speed win that masks a failure is forbidden (§4) — NOT adopted.**
- **Conclusion:** the safe, demonstrated win is **test-impact selection** (validation-selector, ~97 % dev-loop) + **worker cap at cores**. The per-suite tsx cost is real but no correctness-preserving replacement has yet been proven; `coldstart-model.ts` gates any future runner strategy on correctness, not speed.
