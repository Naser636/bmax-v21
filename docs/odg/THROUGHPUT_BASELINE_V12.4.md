# V12.4 — Engineering Throughput Baseline (reproducible) & bottleneck ranking

**CTO Engineering Throughput Optimization §3/§9/§11.** No optimization is proposed without a reference measurement
(§3); no % gain is promised without a comparative experiment (§9). Measurement is done with the EXISTING instruments —
`gate-instrumentation.statsOf/decompose/speedupTarget` + `performance-observability.compareReproducible` — **no new
measurement engine was built** (§10 anti-gas-factory; building one would duplicate `decompose`, which already does
per-stage P50/P95 + bottleneck ranking + fail-closed NOT_MEASURED exclusion).

## Measured data points (reproducible, 2026-11-09)

| Metric | Measured | Method (reproducible) |
|---|---|---|
| tsx cold-start (per invocation) | **1.59–1.87 s** | `time npx tsx -e "process.exit(0)"` ×3 |
| one real test suite wall-clock | **1.66–1.75 s** | `time npx tsx runtime/core/architecture-audit.test.ts` ×3 — ~95%+ is tsx startup, not assertions |
| **CI wall-clock per delivery** | **244 s, 246 s** | GitHub Actions runs for PR #414 (244s) and #413 (246s) — "build + typecheck + parity + tests" |
| local FULL gate (383 suites) | ~187 s | `ODG_TEST_WORKERS=10 odg-test-report` across 8 cores |
| suites in the gate | **383** | `package.json test:report` |

The per-suite cost is **dominated (~95%) by tsx cold-start**, not by the assertions — confirmed by the near-identical
noop-tsx and real-suite timings. This is a known, recorded fact, now re-measured fresh.

## Top bottlenecks (ranked by measured cost)

1. **Per-PR serial CI wait ≈ 245 s — paid once per DELIVERY, blocking and serial (rank #1).** With one mission per PR,
   N missions cost N×245 s of pure wait ("temps d'attente sans progrès", §3). This is the single largest lever on
   throughput (missions validated per unit time), and it is wait, not work.
2. **Local FULL gate ≈ 187 s, ~95% tsx cold-start.** Already mitigated for the DEV loop by `targeted-verify`
   (demonstrated 383 → 1 impacted suite); FULL remains mandatory at certification (§6C) and is NOT reduced.
3. **Per-mission bookkeeping round-trips** (register + manifest + compass + campaign-controller + gate + commit + push +
   PR) — fixed per-delivery overhead; its weight scales with the NUMBER of deliveries, same as #1.

Bottlenecks #1 and #3 share a root cause: **cost is per-DELIVERY, and today delivery == mission.** Reducing the number
of deliveries (without reducing controls) attacks both at once.

## Most profitable justified improvement (§5/§11.5) — coherent delivery lots

**`runtime/core/delivery-batch-coherence.ts`.** When several queued missions are **technically related** (shared
write-set, dependency edge, or shared impacted module via the existing `change-impact-graph`), they are delivered as
**one coherent lot**, paying CI **once** instead of once-per-mission. Controls are **identical**: the same FULL gate
runs once over the combined lot; no suite is skipped; no assertion is removed; no NOT_RUN is presented as PASS.

- **Fail-closed (§5):** independent missions are **MUST_SEPARATE** (never grouped — regression risk); a mission with no
  declared write-set is **never batched** (relatedness unprovable); a related group larger than `maxBatch` is split
  (bounded blast radius).
- **Gain is a COUNT, not a promised %:** a proven-coherent lot of `k` related missions saves `k−1` CI waits.
  Arithmetic, not speculation (§9): e.g. 3 related sub-missions sharing core files → `3×245 s` CI → `1×245 s` CI =
  **≈ 490 s wait removed per such lot**, with the identical gate. The module never claims a global throughput %;
  it reports `ciWaitsSaved` only for groups whose relatedness it has proven.

### Before/after is measured, not promised

The before/after comparison uses the EXISTING `gate-instrumentation.speedupTarget` over the measured 245 s CI unit:
`before = k×245`, `after = 1×245`. Quality is held constant by construction (same FULL gate), satisfying §9's rule that
a speed gain with any reliability loss is rejected — here reliability is unchanged because the controls are literally
the same run.

## What is NOT claimed (honesty, §3/§9)

- Per-stage timings for planning / context / analysis / dev / doc are **NOT instrumented** for past missions, so they
  are reported as **NOT_MEASURED** (not fabricated). `decompose` correctly excludes NOT_MEASURED steps from the ranking.
- No global "X% faster" figure is asserted. The only credited gain is the arithmetic CI-wait reduction on
  **proven-coherent** lots.
- Targeted-verify accelerates the DEV loop only; the certification gate stays FULL (§6C). Speed comes from method
  (fewer, coherent deliveries + targeted dev loop), never from fewer checks.

## Discipline

V12.4 remains the single roadmap; the Boussole the operational guide. Nine primitives, Truth Lock, 15 métiers,
permissions and evidence requirements intact. Reuses Engineering Intelligence + scheduler + validation-selector + cache
+ replay + observability + architecture components; the one new component (`delivery-batch-coherence`) fills a
demonstrated gap (nothing decided coherent delivery lots) and is itself fail-closed.
