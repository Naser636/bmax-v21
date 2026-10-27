# ODG — €500k provable plan V2 (2026-10-27)

Supersedes V1 with a reproducible model (`runtime/core/revenue-scenarios.ts`, suite 9) + the 12-stage evidence-gated
funnel (`runtime/core/commercial-pipeline.ts`, suite 10). **€500k is a TARGET, not a forecast or a result.** All figures
are HYPOTHESIS until measured against real pipeline data. Current reality: **0 detected→cashed; dashboard NO_DATA.**

## Fact vs hypothesis ladder (mandate §1)
market-size estimate → detected opportunity → **verified prospect** → interest → proposal sent → signed → delivery
accepted → invoiced → **cashed** → margin/profit. **Verified status today:** 23 companies **QUALIFIÉ = real + ship an AI
feature** (not demand, not intent); **0 verified buying intent; 0 signed; 0 cashed.**

## Scenarios (explicit assumptions; conversions NOT tuned to the target)
Overall conversion = prospect→interested × interested→proposal × proposal→signed. Value/contract = one-off + recurring
(lag-aware ≈2-month ramp over 12 months). Computed by `revenue-scenarios.ts`.

| scenario | price assumption | conv (p→i,i→p,p→s) | value/contract | contracts | prospects (12 mo) | /month | margin | feasibility |
|---|---|---|---|---|---|---|---|---|
| **Prudent** | €3k one-off | 0.08·0.40·0.30 | €3,000 | **167** | **17,396** | 1,450 prospects · 14 sign | 65% | **INFEASIBLE_SOLO** |
| **Central** | €9k + €1k/mo | 0.12·0.50·0.35 | €19,000 | **27** | **1,286** | 108 prospects · 3 sign | 70% | **STRETCH** |
| **Ambitious** | €18k + €2k/mo | 0.18·0.50·0.40 | €38,000 | **14** | **389** | 33 prospects · 2 sign | 70% | **PLAUSIBLE_HYPOTHESIS** |

Solo-capacity ceiling (HYPOTHESIS): ~120 prospects/mo, ~4 signings/mo, ~3 concurrent deliveries.

## Honest conclusion (the model's real message)
€500k **solo in 12 months is only plausible at HIGH contract value + recurring** (ambitious ≈ €38k/contract, ~14
contracts). **Low-price volume play is INFEASIBLE solo** (prudent needs ~1,450 prospects/month). ⇒ To pursue €500k
either (a) sell **high-value + recurring** engagements, and/or (b) add **partners/white-label/subcontracting** capacity
(a separate budget authorisation). **Arithmetic possibility ≠ demonstrated demand** — no scenario is validated.

## Market price anchor (real, sourced)
A real competitor, **EuroAIGuard**, publishes productised tiers **€490 / €990 / €2,290 per month** (3/15/50 AI systems)
— evidence that **recurring** AI-governance pricing exists in-market (supports the central/ambitious recurring
assumption). Most competitors do NOT publish prices (devis). ISO 42001 project estimates €30k–80k (third-party, not quotes).

## The funnel (evidence-gated — `commercial-pipeline.ts`)
DETECTED → VERIFIED → QUALIFIED → INTERESTED → PROPOSAL_PREPARED → PROPOSAL_AUTHORIZED → **PROPOSAL_SENT (human-gated)** →
NEGOTIATION → **SIGNED (human-gated)** → DELIVERY_ACCEPTED → INVOICED → CASHED. **No auto-advance** (each step needs
`criterionMet`); send + sign require explicit human authorisation. Anti-conflation enforced in code: a **prepared**
proposal is not **sent**; **sent** is not **signed**; **signed** is not **invoiced**; **invoiced** is not **cashed**.
`funnelTotals` counts nothing before SIGNED as revenue and surfaces `preparedNotSent`.

## Cash / margin / risk distinctions
Signed ≠ invoiced ≠ cashed ≠ gross margin ≠ net. Recurring recognised lag-aware. Risks: client concentration (few
high-value contracts), delivery capacity (solo ceiling), payment lag/non-payment, churn on recurring, and **regulatory
relief risk** (Digital Omnibus may reduce SME AI-Act obligation intensity → demand risk, not tailwind).

## Linkage
`revenue-scenarios` (this plan) → `commercial-pipeline` (real funnel, evidence-gated) / `pipeline-ledger` (realized
cash) → `revenue-dashboard` (gap vs €500k, NO_DATA) → `launch-budget` (€10k cap / €5k reserve). Validate every
assumption against real pipeline data before trusting any number.
