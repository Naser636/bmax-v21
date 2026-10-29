# Financial Model, Launch Prep & Status — Indoor-plant niche (ODG_ECOMMERCE_NICHE_DISCOVERY_V2)

Model: `model/model2.mjs` (recomputes; 4/4 invariants). Inputs EST/NON_VERIFIED. Blended AOV **€25.65**,
CM/order **€3.37**, **orders for €10k = 390**. Per-SKU economics: `18_PLANT_CATALOGUE.md`.

## 3 scenarios × 3 months (orders → revenue → result)
| | M1 | M2 | M3 | Q1 revenue | Q1 result (P&L) |
|---|--:|--:|--:|--:|--:|
| **Prudent** | 120 ord → **€3,078** | 150 → €3,848 | 170 → €4,361 | €11,286 | **+€1,231** |
| **Central** | 200 ord → **€5,130** | 260 → €6,669 | 300 → €7,695 | €19,494 | **+€2,309** |
| **Favorable** | 330 ord → **€8,465** | 380 → €9,747 | 420 → €10,773 | €28,985 | **+€3,556** |

(Q1 result = contributive margin − €84/mo fixed; **not** cash, **not** owner pay; excludes initial stock
outlay, which is capital→inventory. Reuse the cash/stock/profit separation + €10k budget from `05`/`06`.)

## €10,000-in-month-1 verdict (honest)
**NOT reached in month 1 even in the favorable scenario** (favorable M1 ≈ **€8,465**). €10k revenue appears only
by **~month 3 in the favorable case** (€10,773). Central M1 ≈ €5,130. **Honest month-1 expectation: €3–8.5k.**
The €10k/month-1 objective is an optimistic ceiling for a new account in this niche, not a base case — consistent
with `14` (a new seller cannot buy enough profitable cold traffic to force €10k). This is reported as-is, not
reduced to flatter the plan.

## Launch preparation (what's prepared vs built vs blocked)
- **Brand/positioning (prepared):** a curated "new-plant starter system" — curation + bundles + plant-care content;
  compete on coherence + repeat (plant food), not on commodity price. (Reuse storefront shell `shop/` → re-skin.)
- **Catalogue + pricing (prepared):** 9 SKUs + 3 bundles; pricing rule derived (bundles must clear €49 or carry
  buyer-paid shipping); anchors (stand, grow light, planter) carry the margin.
- **Site (built, reusable):** `shop/index.html` storefront prototype (cart logic tested 7/7) — re-themeable to
  plants; NOT published.
- **Acquisition (prepared):** organic-first (plant-care content/SEO + Amazon listings into observed demand) +
  capped Amazon Sponsored; stop-rule ACOS>35%; never buy cold traffic above CM/order (`15`).
- **Measurement (prepared):** KPI board `10` (sell-through, CM/unit, returns, ACOS, conversion, runway).
- **Ops (prepared):** Ankorstore Net-90 sourcing; FBM self-ship; ceramic-breakage packaging to confirm; returns
  14-day; CS macros.

## Capability / delegation / human / blocked
- **ODG-native (done):** niche register, decision grid, per-SKU + catalogue + scenario model (recomputed, 4/4),
  catalogue design, pricing-rule derivation, storefront reuse plan, bookkeeping.
- **Provider delegation (declared, cited):** web research + code/model authoring — NOT ODG autonomy.
- **Human/integration (blocked, Phase-2):** send quotes, create accounts, publish, payment (PSP), ads, photos,
  legal/accounting sign-off, buy stock.

## Risks specific to this niche
Ceramic breakage/returns in transit; grow light = electrical → CE/RoHS compliance + higher return/safety load;
cheap-SKU negative margin (mitigated by bundles/anchors); competition from commodity sellers (mitigated by
curation/content/repeat). General risks + compliance: `07`.

## STATUS: **GO_FOR_VALIDATION**
Demand is evidenced at the strongest level available publicly (**observed Amazon purchase badges**: 10K+/3K+/
1K+ per month), the complementary catalogue + bundles are coherent, suppliers are verifiable (Ankorstore Net-90),
and the model recomputes. **But** unit costs/margins are **NON_VERIFIED** and even the favorable case misses
€10k in month 1 — so this is **NOT an investment GO**. The justified next step is the **zero-capital validation**:
1. **Authorize sending Q1 + Q2 supplier quote requests** (`19`) → real unit cost + MOQ + ceramic-breakage policy.
2. **Authorize a structured marketplace pull** (top-50 listings per sub-category: price, rating count, badge,
   seller count) → real ASP + competition depth.
Then ODG recomputes `model2` on real inputs and returns a go/no-go on the first **capital-committing** step
(initial stock / listing / PSP). **No purchase, account, publish, or ad until that go.**

**Next action (exact):** CTO authorizes Q1+Q2 quote requests + the marketplace pull (both zero-capital). Proposed
investment decision after validation: commit the `06` €10k budget (stock €4,000, reserve €4,600) to a plant
catalogue IF validated central CM/order ≥ €3 and ≥5 SKUs with positive standalone or bundle margin.
