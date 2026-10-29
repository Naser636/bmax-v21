# End-to-End Operational Plan (A→Z) — ODG_ECOMMERCE_OPPORTUNITY_TO_CASH_V1

Per step: **who executes** (ODG-native / provider-delegation / human / external-integration) + **acceptance
evidence**. Honest constraint: **ODG cannot natively buy, pay, open accounts, publish listings, photograph, or
ship** — those need a human and/or integrations not present. ODG natively does analysis, calculation,
verification, document/listing-copy generation, and bookkeeping.

| # | Step | Who executes | Acceptance evidence |
|---|---|---|---|
| 1 | Validate opportunity + supplier | ODG-native (analysis) + provider (web) ; **human** confirms | this dossier + ≥2 quotes (Phase-2) |
| 2 | Request quotes + check documents | **human sends** (ODG drafts; mandate: not sent in Phase-1) | quote emails + sample invoice + resale-rights proof |
| 3 | Sourcing + QC on receipt | **human** (physical) | goods received, QC checklist, invoices archived |
| 4 | Catalogue, pricing, product sheets | ODG-native (copy/pricing from model) ; **human** approves | GPSR-compliant listing drafts + CM/unit ≥ floor per SKU |
| 5 | Photos + commercial content | **human / external** (ODG cannot shoot images) | product photos meeting marketplace specs |
| 6 | Go-live + compliance rules | **human** publishes (account needed) ; ODG drafts CGV/mentions/GPSR fields | live listings; compliance checklist signed |
| 7 | Order + payment processing | **external-integration** (Amazon handles) ; ODG reconciles | order + payout records |
| 8 | Prep, shipping, tracking, returns | **human** (pick/pack/ship) ; ODG generates labels-data/returns flow | dispatch within SLA; tracking; return log |
| 9 | Customer service + refunds | **human** (decisions) ; ODG drafts replies/macros | response-time KPI; refund log |
| 10 | Operational accounting + reconciliation | ODG-native (reconcile payouts vs fees vs COGS) ; **accountant** validates | monthly reconciliation = marketplace statements |
| 11 | Reorder per observed sell-through | ODG-native (recommend) ; **human** authorises spend | reorder proposals tied to sell-through + reserve rule |
| 12 | Margin/stock/cash/profit dashboard | ODG-native (recompute from real data) | `10_KPI` populated with actuals; model re-runs |
| 13 | Stop / correct / scale criteria | ODG-native (evaluate vs thresholds) ; **human** decides | decision log vs `10` thresholds |

**Reality check (mandate §9):** ODG does **not** claim it can buy, cash in, publish, or ship autonomously. Every
money- or account- or physical-touching step is human/external and is **Phase-2** (separate authorization). ODG's
honest operating role is the analytical + document + verification + reconciliation spine around those human steps.
