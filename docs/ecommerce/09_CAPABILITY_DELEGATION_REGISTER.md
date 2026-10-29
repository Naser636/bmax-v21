# Capability & Delegation Register + Technical Costs — ODG_ECOMMERCE_OPPORTUNITY_TO_CASH_V1

## Native ODG vs delegation vs human (mission accounting)
| Function | ODG-native | Provider delegation (Claude, declared) | Human / external |
|---|:--:|:--:|:--:|
| Market/supplier/price research | — | ✅ (WebSearch; ODG egress BLOCKED a.test) | — |
| Opportunity analysis, ranking, scoring | ✅ | — | — |
| Financial model + recompute + invariants | ✅ (deterministic sandbox) | — | — |
| Document/listing-copy/CGV drafting | ✅ | (LLM assist) | human approves |
| Independent verification of outputs | ✅ | — | — |
| Sending quotes, buying, paying, accounts | — | — | ✅ (+ integrations) |
| Photos, pick/pack/ship, QC | — | — | ✅ |
| Legal/accounting sign-off | — | — | ✅ |

**Accounting rule honoured:** the web research is a **bounded provider delegation**, cited + logged, and is
**NOT counted as ODG-native autonomy**. ODG-native here = analysis, the recomputable model + 12/12 invariant
checks, and this bookkeeping.

## Technical costs (FACT where sourced; actual account plan NON_VERIFIED — not inspected/secrets untouched)
| Item | Cost (sourced 2026-10-23) | Type | Note |
|---|---|---|---|
| Claude Code — Pro | **$20/mo** ($17 annual) | fixed, likely already engaged | plan actually in use is **NON_VERIFIED** (not inspected; no auth change) |
| Claude Code — Max | **$100 / $200/mo** (5× / 20×) | fixed (if used) | only if heavy use |
| Claude API — Opus | **$4 / MTok in, $20 / MTok out** | per-use (if API, not subscription) | **subscription ≠ API billing — not interchangeable** |
| Amazon.fr Pro | **€39/mo** | fixed incremental | per marketplace |
| Listing/repricing/accounting tools | **~€20/mo** (EST) | fixed incremental | optional |
| Cdiscount (if added) | €39.99/mo | fixed | month 2–3 |
| Shopify (later) | ~€36/mo (EST) | fixed | only post-validation |

**Cost separation (mandate §8):** (a) **already-engaged fixed** = Claude Code subscription (whatever the real
plan is). (b) **incremental to this mission** = Amazon €39 + tools €20 + a modest Claude allocation €25 ≈
**€84/mo** (used in the model `05`). (c) **future estimated** = Cdiscount, Shopify, FBA, scaled ads.
**No purchase/subscription/API call is triggered in Phase-1.** If a current tariff can't be verified it is
tagged NON_VERIFIED (above). The environment's actual Claude plan was **not inspected** (no secrets read, no
auth change) — the published tariffs are shown instead.
