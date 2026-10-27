# ODG — Monthly 12-month revenue model + stress (V1, 2026-10-27)

`runtime/core/revenue-schedule.ts` (suite 10) — month-by-month, lag-aware, not an annual total. **€500k is a TARGET;
prices/conversions HYPOTHESIS; pipeline is EMPTY (0 real opportunities, 0 cashed).** This models timing an annual
aggregate hides.

## Ambitious scenario, modelled monthly (42 prospects/mo · €18k one-off + €2k/mo · lags 1/1/1 · churn 5%)
| metric | € |
|---|---|
| signed bookings (one-off) | 299,376 |
| invoiced within 12 mo | 391,592 |
| **cashed within 12 mo** | **342,014** |
| recurring recognised within 12 mo | 119,432 |
| gross margin (30% cost) | 239,410 |
Monthly cashed ramps 0,0,0 → ~27k → ~47k (m11); cumulative cash m11 = **€342,014**.

## KEY honest finding (sharper than V8)
Even the **ambitious** scenario — the only one V8 found solo-plausible — **cashes only ≈€342k within 12 months**, NOT
€500k, because sales + delivery + payment lags push revenue beyond month 11. **⇒ €500k CASHED in the first 12 months is
NOT solo-reachable.** €500k is realistic only as a **signed-bookings / exit run-rate** target, or with partners. Year-1
**cash** lands ~€342k best-case.

## Stress test (delay signings +2mo, delivery +1mo, churn +10%)
cashed within 12 mo **342,014 → 213,102** (**−€128,912, −38%**); margin €239k → €149k. The plan is **highly sensitive to
timing**: a 2-month sales slip + higher churn removes ~38% of year-1 cash. Break-even vs any fixed cost moves out
several months.

## What this changes (decisions)
- Treat €500k as **signed bookings / run-rate**, report **cash separately** (~€342k year-1 best-case, ~€213k stressed).
- Price is the dominant lever (V8); **timing/churn is the dominant risk** (this model). Prioritise fast delivery +
  retention, and front-load acquisition (early-month signings cash within the window).
- Partners/subcontracting needed to exceed solo cash capacity.

## Pipeline status (Mission D — honest, empty)
Real pipeline today via `commercial-pipeline`: **0 DETECTED → 0 CASHED**; `revenue-dashboard`: **NO_DATA, gap = full
€500k**. No weighted pipeline is shown because there are **no real opportunities** — showing zero rather than artificial
indicators. Observed conversion rates will populate only when real data exists.

## Linkage
`revenue-schedule` (monthly) ← assumptions from `revenue-scenarios` (annual feasibility) → `commercial-pipeline`
(evidence-gated funnel) / `pipeline-ledger` (realized cash) → `revenue-dashboard`. All figures HYPOTHESIS until real
pipeline data exists; nothing invented.
