# ODG — Self-serve assurance path (V20, 2026-10-27)

Executes V19's lever: a self-serve path over the pilot that isolates no-human cases from exceptions, measuring the
automatable fraction + effective human time. Module `self-serve-assurance.ts` (suite 8), reuses `assurance-pilot-runner`
+ `assurance-pilot-metrics`. **SYNTHETIC; not a hosted product; no client data / cert / guarantee. €500k NET stays the
TARGET; nothing achieved.**

## What was built + validated
`runSelfServe(input)` → validate (fail-closed) → run pilot → **triage**: **AUTO_COMPLETE** (standard findings only ⇒
`DELIVERABLE_WITHOUT_HUMAN`) vs **NEEDS_HUMAN_REVIEW** (exceptions: UNKNOWN license, AI-Act HIGH, failed/partial run,
>8 findings). `batchThroughput()` measures the automatable fraction + **effective human time/delivery = reviewFraction ×
reviewHours** (auto cases ≈ 0 human time). Tests: clean⇒auto; unknown-license/AI-Act-HIGH/too-many/failed⇒review;
fail-closed input; reproducible.

## Measured net-factor lift from automation (price €3,000, €50/h)
| mode | eff. human hrs/delivery | margin | net factor | deliveries for €500k NET |
|---|---|---|---|---|
| full service | 7 | 88% | 0.51 | 325 |
| self-serve auto 60% | 1.6 | 97% | 0.58 | 289 |
| self-serve auto 80% | 0.8 | 99% | 0.59 | 282 |
| self-serve auto 95% | 0.2 | 99.7% | 0.60 | 279 |

## The honest, measured conclusion (what actually binds)
Self-serve automation lifts the net factor **0.51→0.60** and margin to ~99% — real, but **the deliveries-needed barely
move (325→279)**. Why: at €3,000 the human cost was already a small fraction of price, so cutting it changes margin
little and **volume dominates**. **€500k NET is VOLUME-bound, not margin-bound:** it still needs **~279–325 delivered
engagements/year ≈ 23–27/month** at €3k — far above solo capacity (3–4/mo) and even a small team.
- ⇒ The margin lever (automation) alone does **not** make €500k NET year-1 reachable.
- Two real paths remain: **(a) far fewer, far larger contracts** (e.g. 64 × €15k, still ~5/mo — needs enterprise demand),
  or **(b) a genuine high-volume self-serve SaaS** (many low-touch customers) — which needs product + hosting + support
  + marketing (a build/opex decision, not done; the module proves the *engine* auto-completes clean cases, not that a
  sellable SaaS exists).

## Status vs the target (no false success)
€500k NET year-1 **remains unproven and volume-bound**. Automation is validated and improves margin; it does not close
the volume gap. The honest levers are now explicit and measured: price↑ (fewer deals) and/or a true SaaS (many
customers) and/or team capacity — each requiring human/dev/commercial decisions + real demand (NO_DATA today).

## Next (internal, €0)
Tighten the auto-complete fraction on broader synthetic fixtures (reduce exceptions ⇒ lower human time further) and
re-measure; model the SaaS path's customer-count requirement at a low subscription price. Hosting/product/outreach/
structure = human decisions. Nothing published/sent.
