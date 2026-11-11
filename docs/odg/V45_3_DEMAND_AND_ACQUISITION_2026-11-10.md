# V45.3 — Real demand measurement + acquisition/profit validation — 2026-11-10

> CTO V45.3. Question: can ODG reach **≥ €500k NET profit (after FR IS) in year 1 with revenue < €1,000,000 HT**? Honesty: **no authorized prospecting ⇒ observed conversion = 0**; every funnel rate below is a **SIMULATED assumption**, not a measurement. Prior V45.1/V45.2 assumptions are kept as history, not re-asserted as validated. Reproducible model: `runtime/bin/odg-acquisition-model.ts` → `docs/odg/V45_ACQUISITION_MODEL_OUTPUT.json` (sha256 `a52192f845be22bf`).

## A. Demand (real, sourced)
| Métier | Affected population (real) | Source |
|---|---|---|
| **P3 — CRA/SBOM** | **615,272 manufacturers** (EU) with products with digital elements; **€29B** total compliance cost ⇒ **~€47,000 avg/manufacturer**; no size threshold (a 5-person SW SME is in scope) | [EU Commission estimate](https://www.coditrust.com/cyber-resilience-act-editeurs-logiciels-france-2026), [Industrial Cyber](https://industrialcyber.co/regulation-standards-and-compliance/eu-cyber-resilience-act-reporting-rules-take-effect-putting-vulnerability-disclosure-and-product-security-in-focus/) |
| **P11 — e-invoicing** | **~5.18M French companies** must *receive* e-invoices (INSEE Esane 2024); 4.8M in franchise-en-base (micro); PDP registrations 375k→1.1M in 6 mo (+300%) | [socialmag/INSEE](https://www.socialmag.news/24/07/2026/facturation-electronique-obligatoire-des-septembre-2026-plus-de-sept-millions-dentreprises-concernees/) |
| **P10 — compliance** | overlaps P3/P11 + NIS2/AI-Act; same buyer base | regulatory |

**Reading:** demand is **large and regulation-forced with dates**. P3's **€47k avg compliance cost** validates ODG's price points (an SBOM-readiness slice = a few k€). P11's 5.18M is mostly **micro (tiny budgets)** — the *paying* SAM is the SME-that-issues + integrators/expert-comptables, far smaller.

## B. Market funnel (TAM → SAM → SOM → paying)
- **TAM** (France): P3 ~60–90k (French share of 615k EU manufacturers/SW makers, **estimate — verify**); P11 ~5.18M receivers, but **~0.7–1.5M** SMEs that *issue* with real IT complexity.
- **SAM** (reachable, right-sized, budget): P3 ~10–20k French product/software SMEs; P11 ~100–300k issuing SMEs + ~20k expert-comptables/integrators (channel).
- **SOM year-1** (realistically winnable solo-start): **tiny** — a few hundred *qualified* at best, **~100 closeable** at a strong funnel.
- **Paying (observed):** **0** (no prospecting authorized, €0 clients).
- Rule kept: **recensées ≠ prospects qualifiés ≠ clients**.

## C. Conversion calculator — results (SIMULATED rates; observed = 0)
From the reproducible model (avg one-off €8k, 35% recurring attach @ €800/mo, 4 delivery-days/deal, MA loaded €24.5k/FTE, FR overhead €73k, CAC €1,200/deal):
| Scenario | New clients | Revenue | Opex | EBT | **NET** | Team | net≥500k | rev<1M | BOTH |
|---|---|---|---|---|---|---|---|---|---|
| Prudent | 14 | €133k | €159k | −€26k | **−€26k** (loss) | 2 FTE | ✗ | ✓ | ✗ |
| Central | 63 | €584k | €218k | €366k | **€279k** | 2 FTE | ✗ | ✓ | ✗ |
| Ambitieux | 205 | €1.89M | €461k | €1.43M | **€1.07M** | 5 FTE | ✓ | **✗ (>€1M)** | ✗ |
| **SOLVER (both constraints)** | **~107** | **€989k** | ~€230k | ~€686k | **€525k** | **3 FTE** | **✓** | **✓** | **✓** |

**Both constraints ARE simultaneously satisfiable** at **~107 closed deals / €989k revenue / 3-FTE Morocco team** — the unit economics close because the Morocco delivery cost is low and ~35% of deals carry recurring. Delivery is feasible (≤12 FTE). **This is a feasibility proof of the MATH, not of the demand.**

## D. Offer optimization (profit, not revenue)
- **Most profitable:** **recurring** (SBOM gate / e-invoice support) — near-zero marginal delivery after setup; the ~35% attach is what lifts Central→solver.
- **Optimal mix:** P3-Pro + P11-Pro one-offs (~€8–11k, 3–5 days, ~85% gross) as the **engine**, each converting to **€300–1,000/mo recurring**. Entry tiers (€1.5–3k) = low-friction door-openers / lead magnets, not the profit center.
- **Automatable (ODG native):** the SBOM build, license audit, EN16931 validation, round-trip, report generation — already demonstrated ⇒ **human time per deal is low** (why 3 FTE can deliver ~107 deals).
- **Headcount:** ~3 FTE delivery (MA) suffices for ~107 deals; the real staffing gap is **SALES/marketing**, not delivery.

## E. 12-month monthly model
Per-month funnel + P&L is in the dataset (`scenarios.*.monthly`). Shape: cash-negative in months 1–3 (ramp + fixed costs before revenue), crossing to profit around mid-year in Central/solver. **BFR/cash:** the SAS fronts MA salaries monthly before 30–60-day client payment ⇒ a **~€30–80k working-capital buffer** is required or hiring stalls (not a P&L cost, a cash need).

## F. Honest verdict
- **Mathematically: YES** — €500k NET with revenue **< €1M is satisfiable** (solver: ~107 clients, €989k revenue, €525k net, 3 FTE, deliverable). This **refines** V45.2 (which flagged €500k net as not year-1-realistic): the *financial structure* works with the Morocco cost base.
- **In practice: UNPROVEN and acquisition-bound.** Reaching ~107 closed deals in year 1 from **€0 clients, L2 demonstrators, no reference, no authorized prospecting** requires a **working acquisition engine** generating ~**650 qualified-reach/mo by month 12** — which does **not exist** and whose conversion rates are **entirely simulated (observed = 0)**.
- **Missing conditions (the real gaps):** (1) ≥1 **reference client / case study**; (2) an **authorized acquisition channel** (content + outbound/partners) and the spend for it; (3) **validated prices** (3 real quotes); (4) a **cash buffer** for BFR; (5) **permission to prospect**. Delivery capacity and unit economics are **not** the blockers.
- **Conclusion:** the €500k-net / <€1M-revenue target is **feasible on unit economics but not yet demonstrated on demand**. The next real step is **evidence of conversion** (a reference client + a measured funnel), not more modeling. **No result is fabricated: observed conversion remains 0.**
