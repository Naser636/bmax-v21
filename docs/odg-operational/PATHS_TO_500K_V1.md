# ODG — Channel paths to €500k (V1, 2026-10-27)

`runtime/core/revenue-channels.ts` (suite 10) layered on the monthly model. **€500k is a TARGET; all rates HYPOTHESIS;
pipeline empty (0 real).** Net is CONSERVATIVE: channel cost (commission/subcontract) is ADDED to ODG's own direct cost.

## Channel comparison (base: 40 prospects/mo · €18k + €2k/mo · lags 1/1/1 · churn 5%)
| channel | gross cashed (12 mo) | channel cost | net cashed | net margin | margin % |
|---|---|---|---|---|---|
| **A SOLO** (one-off only) | €233,280 | 0 | €233,280 | €163,296 | 70% |
| **B SOLO_RECURRING** | €325,727 | 0 | €325,727 | **€228,009** | 70% |
| **C PARTNER** (30% commission, 1.5× volume) | **€488,591** | €146,577 | €342,014 | €195,436 | 40% |
| **D SUBCONTRACT** (40% cost, 2× capacity) | **€651,455** | €260,582 | €390,873 | €195,436 | 30% |

Ranked by **net margin**: **SOLO_RECURRING > PARTNER ≈ SUBCONTRACT > SOLO.**

## Honest reading
- **Solo-recurring = best net margin (€228k)** but caps gross cash (~€326k) — cannot reach €500k cash at this volume.
- **Partner / subcontract reach high GROSS cash (€489k / €651k)** — the only way to approach/exceed €500k cash — but
  their channel cost cuts net margin to ~€195k. **Scale needs a channel; the channel taxes margin.**
- **To CASH €500k solo** at this high price point requires **~62 prospects/month** (within the ~120 solo ceiling **IF**
  the assumed conversions/prices hold — unvalidated; and V9 stress shows timing fragility). `requiredForTargetCash` =
  62/mo, within ceiling, note "unvalidated".

## The four scenarios (mandate §3)
A solo one-off: lowest, INFEASIBLE for €500k. B solo+recurring: best margin, ~€326k cash cap. C partner: reaches €500k
gross via borrowed market access, 40% margin. D subcontract: highest gross via added capacity, 30% margin, needs cash to
pay subcontractors (working-capital risk). **Break-even/stress:** per V9, a 2-month sales slip + higher churn removes
~38% of year-1 cash in any scenario — timing is the dominant risk across all four.

## Strategy implication
Start **B (solo + recurring)** for margin and to prove delivery; use the **paid-pilot wedge** (SALES_CYCLE_RESEARCH_V1)
for the first reference; add **C/D (partner/subcontract)** only to scale toward €500k cash once delivery is proven —
accepting the lower net margin as the cost of capacity. **No channel validated; nothing signed.**
