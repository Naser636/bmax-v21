# €10,000 Budget Allocation — ODG_ECOMMERCE_OPPORTUNITY_TO_CASH_V1

Hard cap €10,000, all-in. Principle (mandate §7): **do not spend because the budget exists** — a large reserve
is deliberate given the **NON_VERIFIED unit economics** and the prudent-scenario loss. Allocation shown for the
**CENTRAL** plan; scenario variants noted. Nothing is spent in Phase-1 (study only).

| Envelope | Central | Rationale | Scenario variants |
|---|--:|---|---|
| Initial stock (500u @ €8 EST) | **€4,000** | enough SKU breadth (8–10 SKUs) to test demand without over-committing unverified economics | Prudent €3,200 (400u) · Favorable €4,800 (600u) |
| Inbound transport/sourcing | **€150** | Ankorstore free >~€300; small inbound buffer | €100–200 |
| Packaging & outbound logistics materials | **€200** | boxes, mailers, labels, printer consumables (outbound postage is per-order in the model, not here) | €150–250 |
| Tools & technical | **€300** | Amazon Pro €39×3 + listing tools €20×3 + Claude Code incremental €25×3 ≈ €252, rounded (see `09`) | fixed |
| Customer acquisition (Sponsored) | **€450** | small test budget only (≈€150/mo); NOT a growth assumption | Prudent €150 · Favorable €900 |
| Admin & compliance | **€300** | GPSR labelling, legal-mentions/CGV template, basic accounting tool; micro-entreprise registration is free | €250–350 |
| **Reserve / contingency** | **€4,600** | absorbs: cotisations due on revenue regardless of profit, returns/refunds, reorders before the ~14-day payout lands, and the risk the real quote is worse than €8 | **never below €1,500** (model keeps ≥€1,500 before any reorder) |
| **TOTAL** | **€10,000** | = cap (not exceeded) | all variants ≤ €10,000 |

## Why the reserve is this large (justification, per §7)
1. **Unverified unit economics:** if the supplier quote is €10 not €8, central margin nearly vanishes — the
   reserve is what lets the activity survive a bad quote without a second capital injection.
2. **Payout delay:** Amazon pays ~every 14 days, so a reorder in month N is funded from the reserve, not from
   that month's not-yet-collected sales.
3. **Loss months are possible:** the prudent scenario loses ~€356 over 3 months; the reserve absorbs that.
4. **Returns/refunds** hit cash immediately while stock may not be resaleable.
A smaller reserve would convert a normal setback (slow first weeks + one bad reorder) into insolvency.

## Guardrails
- Total spend is **capped at €10,000**; the model (`05`) proves initial stock + reorders never exceed it and
  cash never goes negative in any scenario.
- Reorders are demand-triggered (only buy what the first weeks' sell-through justifies), not calendar-triggered.
- **No envelope is released in Phase-1.** Any actual spend is Phase-2 (separate authorization).
