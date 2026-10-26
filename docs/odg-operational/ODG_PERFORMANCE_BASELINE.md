# ODG Performance Baseline & Hyper-Speed Ledger

Measured, reproducible gate timings and the optimizations applied on top of them. Every claimed gain is
measured before/after, cold and warm, with repetition — never promised ahead of measurement (CTO WORLD-CLASS
+ HYPER-SPEED mandate §4). A cache or selected/parallel run NEVER replaces the proof it accelerates: the
classification, authorizations and evidence are identical to the sequential gate.

## Environment (baseline capture)
- Date: 2026-10-26 · HEAD baseline `afdf557` (origin/main)
- Node v22.22.1 · tsc 5.9.3 · tsx 4.23.0 · 8 vCPU · 23 GB RAM
- Tracked `.ts/.tsx`: 1139 (src 716, runtime 354, scripts/poc ~5+)

## Baseline — key gates (wall-clock seconds, reproducible via scratchpad/profile.sh)
| Gate | Cold | Warm | Notes |
|------|------|------|-------|
| root `tsc --noEmit -p tsconfig.json` | 10.80 | 5.24 | `incremental:true` + `./tsconfig.tsbuildinfo` already live locally (~2× warm). CI is always cold (fresh `npm ci`). |
| `build:runtime` (tsx build-runtime-guard) | 8.26 | 1.79 | content-fingerprint short-circuit (V71) — already optimal on no-change. |
| strict-leaves `tsc` | 2.94 | — | 23-file scoped gate. |
| **`test:report` (59 classified suites)** | **95.10** | — | **was fully sequential** (`spawnSync` per suite). CI's longest step + per-lot regression gate. |
| cold-start CLI (`odg health`, compiled dist) | 0.23 | — | already fast. |

## Optimization #1 — parallel classified test gate (race-free, opt-in, proven)
**Change:** `runtime/bin/odg-test-report.ts` gains an opt-in parallel scheduler behind `ODG_TEST_WORKERS`
(default 1 = the untouched sequential path, byte-identical). Safety is by construction, not by hope:
- `suiteIsHazard()` flags any suite whose source can touch GLOBAL mutable state — `process.chdir`, `.listen`,
  or a repo-relative `runtime/...` write — and runs those **strictly sequentially** (phase 1, never concurrent
  with anything). Partition on the current gate: **20 hazard (serial) / 39 hermetic (parallel)**.
- Hermetic suites run with bounded concurrency (clamped to CPU count), **each in an isolated `TMPDIR`** so
  `os.tmpdir()` fixed-name temp files cannot collide. They never mutate repo-relative state, so they cannot
  race each other nor produce state a phase-1 suite consumes; the two phases never overlap.
- Results are re-sorted to the ORIGINAL input index → the persisted `test-report.json` is order-identical.

**Proof (scratchpad/equiv.sh, HEAD `afdf557`, 8 cores):**
| Mode | Result | Time | Classification vs sequential |
|------|--------|------|------------------------------|
| sequential (unset) | 59/59 PASS | 95.4 s | baseline |
| `ODG_TEST_WORKERS=6` run 1 | 59/59 PASS | 48.8 s | IDENTICAL (class + order) |
| `ODG_TEST_WORKERS=6` run 2 | 59/59 PASS | 49.0 s | IDENTICAL |
| `ODG_TEST_WORKERS=6` run 3 | 59/59 PASS | 51.1 s | IDENTICAL |

**Measured gain: 95.4 s → ~49 s = ~1.95× (−48%), stable across 3 repetitions, zero classification drift.**
The 20-suite serial phase is the floor (parallelizing it safely needs per-suite repo isolation — a future lot).
Contract test: `odg-test-report.test.ts` (38 assertions) proves `suiteIsHazard` partition, `parseWorkers`
clamp-to-cores, and `runSuitesParallel ≡ runSuites` (identical classification + order) via an injected runner.
CI wired to `ODG_TEST_WORKERS: 8` (clamped to the runner's real core count; falls back to 1-equivalent).

## Not changed (measured as already-optimal; no speculative infra)
- `build:runtime` warm (1.79 s) — fingerprint short-circuit already present.
- root `tsc` incremental — `tsBuildInfoFile` already emitted locally; CI is cold by design (`npm ci`).
- No Docker / RAMFS / remote cache introduced — none justified by the profile (addendum §4).
