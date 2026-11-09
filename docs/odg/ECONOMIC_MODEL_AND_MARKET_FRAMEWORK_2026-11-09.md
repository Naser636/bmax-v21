# V12.4 — Economic Model & Market-Study Framework (CTO Continuation §5 + §7, 2026-11-09)

**Honest separation (mandatory, §7):** every figure is tagged **`[OBSERVED]`** (measured/known in-repo),
**`[ASSUMPTION]`** (a parameter the owner sets), **`[MARKET-RESEARCH-REQUIRED]`** (`[MR]` — external, not fabricated),
or **`[FORMULA]`** (computed from the others). **No theoretical potential is presented as acquired revenue.** ODG has no
internet and external research is owner-gated, so **no market number, competitor price, or tender figure is invented** —
those cells stay `[MR]` until the owner supplies dated sources.

## §5 — Market-study framework (to be filled from sourced external data)

Per métier, the §5 study must collect (each cell `[MR]`, with a dated/traceable source — public bodies, statistics,
competitor catalogs, tenders): observable demand · enterprise pain points · client segments · direct/indirect competitors ·
offers & prices · client dissatisfactions · search trends · public tenders · tech trends · regulations · under-exploited
opportunities. **Scope:** France (priority) → Europe → relevant international. **No prospect contacted, no real sale (§5).**

> This framework is the *container*; it is intentionally empty of numbers. Filling it requires the owner to authorize
> external research or provide the sources. Fabricating any cell is refused.

## §7 — Economic model (calculable once inputs are supplied)

### Cost structure — what is actually known

| Item | Value | Tag |
|---|---|---|
| Hosting | the existing single VPS (already provisioned; no new spend to operate the current stack) | `[OBSERVED]` |
| Software stack | Next.js / Node / tsx / open-source modules — **no license fee** | `[OBSERVED]` |
| ODG engineering labor | autonomous (near-zero marginal cost per additional unit of built software) | `[OBSERVED]` |
| Provider/API costs (LLM, GPU, billing) | per-use; **owner-gated, not yet enabled** | `[ASSUMPTION]` (0 until enabled) |
| Acquisition cost (CAC) | depends on channel | `[MR]` |
| Sub-contracting | 0 unless the owner engages it | `[ASSUMPTION]` |

### The model (formulas — fill the `[MR]`/`[ASSUMPTION]` inputs to compute)

Per métier *m*, per month:
```
price_per_delivery[m]        = [MR]           # from competitor pricing + positioning
deliveries_per_month[m]      = [ASSUMPTION]   # bounded by max_delivery_capacity (below)
variable_cost_per_delivery[m]= [ASSUMPTION]   # provider/API use per delivery (0 until enabled)
revenue[m]        = [FORMULA] price_per_delivery[m] * deliveries_per_month[m]
gross_margin[m]   = [FORMULA] revenue[m] - deliveries_per_month[m] * variable_cost_per_delivery[m]
```
Global:
```
monthly_revenue   = [FORMULA] Σ revenue[m]
annual_revenue    = [FORMULA] 12 * monthly_revenue            # steady-state; ramp handled by scenario
recurring_revenue = [FORMULA] Σ (subscription_price[m]*active_subs[m])   # [MR]/[ASSUMPTION] inputs
fixed_costs       = [OBSERVED ~ small] hosting + any owner-enabled subscriptions
net_result        = [FORMULA] gross_margin_total - fixed_costs - CAC_total
break_even_units  = [FORMULA] fixed_costs / (price_per_delivery - variable_cost_per_delivery)
max_delivery_capacity = [ASSUMPTION] bounded by ODG throughput (measured: CI ~246s/PR, gate ~190s) and owner review time
```

### Three scenarios (structure — numbers pending inputs)

| Scenario | Deliveries/mo | Price basis | Revenue | Net | Tag |
|---|---|---|---|---|---|
| **Prudent** | low `[ASSUMPTION]` | below-market `[MR]` | `[FORMULA]` | `[FORMULA]` | computed when inputs set |
| **Central** | medium `[ASSUMPTION]` | market `[MR]` | `[FORMULA]` | `[FORMULA]` | computed when inputs set |
| **Ambitious** | at capacity `[ASSUMPTION]` | premium `[MR]` | `[FORMULA]` | `[FORMULA]` | computed when inputs set |

### What is honestly stated now (no fabrication)

- **Cost side is favorable and partly `[OBSERVED]`:** infra exists, stack is free, labor is autonomous → low fixed costs
  and near-zero marginal software cost. This is a *real* structural advantage.
- **Revenue side is entirely `[MR]`/`[ASSUMPTION]`:** no price, no demand, no client is known or invented. Therefore
  **no revenue figure, first-month or annual, is asserted** — the model computes them only after the §5 study + owner
  pricing decisions supply the inputs.
- **Capacity is bounded by measured ODG throughput + owner review time**, not by imagined scale.

**Per-métier consolidation** follows the same template (15 instances of the per-*m* block) and sums to the global model.
Provided empty-but-calculable so the owner can drop in sourced numbers and get results immediately — the §7 deliverable is
the *calculator*, honestly, not invented outputs.
