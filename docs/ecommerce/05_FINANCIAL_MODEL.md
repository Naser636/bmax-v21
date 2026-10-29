# Financial Model (3 months × 3 scenarios) — ODG_ECOMMERCE_OPPORTUNITY_TO_CASH_V1

**Recomputable + invariant-checked** by a deterministic ODG script (sandbox, cwd≠repo root). The script output
+ 12/12 invariant PASS is the verification; the numbers below are copied from that run. **The model LOGIC is
verified; the unit INPUTS are ESTIMATED/NON_VERIFIED** (unit cost €8, ASP €20–24 — replace with supplier quotes
+ marketplace pull before any capital). A PASS here proves arithmetic consistency, **not** market demand or
profit.

## Inputs (all EST / NON_VERIFIED unless noted)
- Capital cap **€10,000** (hard). Unit wholesale cost **€8** (NON_VERIFIED→quote). ASP €20 / €22 / €24 (prudent/
  central/favorable, NON_VERIFIED). Amazon referral **15%** (FACT range). Ship+packaging **€4.5/unit sold** (EST).
- Micro-social cotisations **12.3% of revenue** (EST; 2026 exact NON_VERIFIED). Returns 8% / 5% / 3%.
- Fixed/month: Amazon €39 + tools €20 + Claude Code incremental allocation €25 = **€84/mo** (see `09`).
- VAT: **franchise-en-base** (<€85k) → no VAT charged, **input VAT not reclaimable** (cost is TTC).
- Payout delay: ~half a month's net sales collected in-month, half the next (~14-day Amazon payout).
- Accounting rule enforced: **stock purchase = cash→inventory (NOT expense, NOT profit); recovered sales cash and
  unsold-stock value are NOT profit.** Profit = contributive margin − fixed. Cash ≠ profit ≠ stock.

## Key per-unit economics (computed)
| Scenario | Contributive margin / unit | Breakeven units / month (cover €84 fixed) |
|---|---|---|
| Prudent (ASP €20) | **€0.44** | 191 |
| Central (ASP €22) | **€2.39** | 36 |
| Favorable (ASP €24) | **€4.23** | 20 |

> The prudent CM/unit (€0.44) is the headline risk: at €20 ASP, fees+cotisations+shipping+returns nearly consume
> the gross margin, so even high volume barely covers fixed costs.

## PRUDENT — initial stock €3,200 (400 units); **3-month P&L = −€356 (LOSS)**
| Month | Units sold | Revenue | COGS | Amazon 15% | Ship+pack | Returns(+ret ship) | Cotis 12.3% | Ads | Fixed | Contrib. margin | **Accounting result** | End cash | Stock end | Deferred |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| M1 | 160 | 3,200 | 1,280 | 480 | 720 | 314 | 393.6 | 50 | 84 | −37.2 | **−121.2** | 6,726.8 | 1,920 | 1,232 |
| M2 | 196 | 3,920 | 1,568 | 588 | 882 | 384 | 482.2 | 50 | 84 | −34.3 | **−118.3** | 5,899.3 | 2,352 | 1,509 |
| M3 | 217 | 4,340 | 1,736 | 651 | 976.5 | 425 | 533.8 | 50 | 84 | −32.6 | **−116.6** | 5,356.9 | 2,616 | 1,671 |
End position: cash €5,356.9 + stock €2,616 (327u) + deferred €1,671 = **€9,644** (eroded from €10,000). Cumulative
P&L **−€356**. *This is a losing business as modelled — see "why prudent fails".*

## CENTRAL — initial stock €4,000 (500 units); **3-month P&L = +€1,094**
| Month | Units sold | Revenue | COGS | Amazon 15% | Ship+pack | Returns | Cotis | Ads | Fixed | Contrib. | **Result** | End cash | Stock end | Deferred |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| M1 | 300 | 6,600 | 2,400 | 990 | 1,350 | 398 | 811.8 | 150 | 84 | 500.7 | **416.7** | 6,176.7 | 1,600 | 2,640 |
| M2 | 270 | 5,940 | 2,160 | 891 | 1,215 | 358 | 730.6 | 150 | 84 | 435.6 | **351.6** | 6,952.3 | 1,440 | 2,376 |
| M3 | 258 | 5,676 | 2,064 | 851.4 | 1,161 | 342 | 698.2 | 150 | 84 | 409.6 | **325.6** | 7,447.5 | 1,376 | 2,270 |
End position: cash €7,447.5 + stock €1,376 (172u) + deferred €2,270 = **€11,094**. Cumulative P&L **+€1,094**
(≈€365/mo — a side-income, not a salary).

## FAVORABLE — initial stock €4,800 (600 units); **3-month P&L = +€3,084**
| Month | Units sold | Revenue | COGS | Amazon 15% | Ship+pack | Returns | Cotis | Ads | Fixed | Contrib. | **Result** | End cash | Stock end | Deferred |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| M1 | 480 | 11,520 | 3,840 | 1,728 | 2,160 | 410 | 1,417 | 300 | 84 | 1,664.6 | **1,580.6** | 5,897.4 | 960 | 4,723 |
| M2 | 296 | 7,104 | 2,368 | 1,065.6 | 1,332 | 253 | 873.8 | 300 | 84 | 911.5 | **827.5** | 8,903.5 | 592 | 2,913 |
| M3 | 259 | 6,216 | 2,072 | 932.4 | 1,165.5 | 221 | 764.6 | 300 | 84 | 760.1 | **676.1** | 10,015.7 | 520 | 2,549 |
End position: cash €10,015.7 + stock €520 (65u) + deferred €2,549 = **€13,084**. Cumulative P&L **+€3,084**.

## Verification (ODG deterministic recompute) — **12/12 invariants PASS**
Per scenario: initial stock spend ≤ €10k ✓ · total spend (initial + reorders) ≤ €10k ✓ · end cash never
negative ✓ · **cash + stock + deferred ≡ €10,000 + cumulative P&L** (no money invented, no double-count) ✓.

## Sensitivity (why the recommendation is fragile)
The result is dominated by **ASP − (fees 15% + cotisations 12.3% + unit cost + €4.5 ship)**. At the EST €8 cost:
- ASP €20 → CM/unit €0.44 (loss after fixed); ASP €22 → €2.39; ASP €24 → €4.23. **±€2 ASP swings the business
  between loss and modest profit.**
- If true wholesale cost is €10 (not €8), central CM/unit falls ~€2 → near-breakeven. **The quote is decisive.**
- Returns and the ~14-day payout delay don't break solvency here but slow cash; a worse payout delay or a bulky-
  SKU shipping cost would.

## Why the PRUDENT scenario could fail (as required)
Thin CM/unit means fixed costs + cotisations + returns turn a low-ASP, low-sell-through month into a loss; stock
stays tied up (€2,616 at M3) while cash erodes (€9,644 total, below €10k). **Real observations that would change
the forecast:** actual supplier quote (unit cost), a marketplace pull of actual sold prices + ranks, and a first
2–4 weeks of real sessions→conversion. Until those exist, treat even "central" as hypothetical.
