# ODG_ECOMMERCE_OPPORTUNITY_TO_CASH_V1 — Dossier index (Phase-1: research/analysis only)

**Status:** Phase-1 study COMPLETE (research, analysis, model, plan). **No purchase / order / payment / account
/ listing / ad / commit / system change occurred.** Commercial implementation = separate CTO decision (Phase-2).

**Read in order:** [00 Cinema bilan](00_CINEMA_BILAN.md) · [01 Opportunity register](01_OPPORTUNITY_REGISTER.md)
→ [02 Ranking & recommendation](02_RANKING_AND_RECOMMENDATION.md) → [03 Suppliers](03_SUPPLIER_DOSSIER.md) ·
[04 Channels](04_CHANNELS.md) → [05 Financial model](05_FINANCIAL_MODEL.md) · [06 €10k budget](06_BUDGET_10K.md)
→ [07 Risks & compliance](07_RISKS_COMPLIANCE.md) · [08 Operational plan](08_OPERATIONAL_PLAN.md) ·
[09 Capability/delegation + technical costs](09_CAPABILITY_DELEGATION_REGISTER.md) ·
[10 KPI & decision](10_KPI_DASHBOARD_AND_DECISION.md) · [11 Assumptions/unknowns](11_ASSUMPTIONS_UNKNOWNS.md) ·
[12 Sources](12_SOURCES.md) · [recomputable model](model/model.mjs) + [output](model/model-out.json).

## Prepared vs Verified vs Unknown (honest separation)
- **PREPARED (this phase):** the full dossier + the recomputable model + unsent quote-request drafts.
- **VERIFIED (this phase):** FR fiscal/compliance facts, channel fees, supplier *identity + terms*, pet-market
  size, Claude/Amazon published tariffs (all sourced, `12`); the model's arithmetic consistency (12/12 invariants).
- **UNKNOWN until Phase-2 + real observation:** actual supplier SKU prices/MOQ (quote), actual sold prices/ranks
  (marketplace pull), real sell-through/returns/conversion, and therefore **real sales, margin and profit**.

## Operator phase (ODG_ECOMMERCE_OPERATOR_V1 — build)
- [13 Storefront build + state](13_STOREFRONT_BUILD.md) · built prototype: [shop/index.html](shop/index.html) +
  tested [cart-logic.mjs](shop/cart-logic.mjs) (7/7).
- [14 €10k month-1 feasibility verdict](14_REVENUE_10K_FEASIBILITY.md) · [15 Ad plan](15_AD_PLAN.md) ·
  [16 Action register & STATUS](16_ACTION_REGISTER_AND_STATUS.md).
- **STATUS: BUILD_IN_PROGRESS.** €10k/month-1 is NOT a base case (marketplace-conditional top-range only); an
  independent cold shop cannot support it profitably. Storefront prototype built+tested; publish/payment/ads
  BLOCKED on authorizations; supplier cost + demand still NON_VERIFIED.

## Niche discovery V2 (ODG_ECOMMERCE_NICHE_DISCOVERY_V2) — single niche selected
- [17 Niche register (11 niches + grid)](17_NICHE_REGISTER_V2.md) → selected **indoor-plant care & accessories**.
- [18 Catalogue (15 candidates → 9 + bundles)](18_PLANT_CATALOGUE.md) · [19 Suppliers + quote drafts](19_PLANT_SUPPLIERS.md)
  · [20 Model + launch + STATUS](20_PLANT_MODEL_LAUNCH_STATUS.md) · model: [model2.mjs](model/model2.mjs).
- **STATUS: GO_FOR_VALIDATION.** Demand observed (Amazon badges 10K+/3K+/1K+ per month); catalogue coherent;
  suppliers verifiable (Ankorstore Net-90). Costs NON_VERIFIED; cheap SKUs lose money singly (bundle/anchor
  strategy); **€10k/month-1 not reached even favorable (M1 ≈ €8.5k)**. Next = zero-capital validation (quotes +
  marketplace pull), then investment go/no-go.

## One-line recommendation
Lead **B — premium indoor-cat enrichment accessories**, sourced via **Ankorstore (Net-60)** + BigBuy, launched
**FBM on Amazon.fr**, under micro-entreprise VAT franchise — **evidence-led but NOT profit-proven**: the prudent
scenario LOSES ~€356/3mo and everything hinges on NON_VERIFIED unit economics. Decision needed: authorise the
two decisive validations (supplier quotes + marketplace pull), still with **zero capital committed**.
