# ODG Opportunity Intelligence — Cycle V1 (2026-10-26, budget €0)

First rigorous cycle of the OPPORTUNITY_INTELLIGENCE master mission. Budget €0 (no paid calls, no Replicate).
Everything below is real + reproducible; nothing is claimed beyond its evidence level. Conclusion labels per §5:
`FAIT VÉRIFIÉ` / `RÉSULTAT EXPÉRIMENTAL` / `ESTIMATION` / `HYPOTHÈSE` / `INCONNU` / `BLOQUÉ`.

## §13.1 Capability inventory (fiches, with evidence level)
Levels: L1 absent · L2 present-untested · L3 tested-in-sim · L4 real-env · L5 operational-e2e · L6 unavailable (access/data).

| Capability | Module | Mechanism | Test / evidence | Level |
|---|---|---|---|---|
| Opportunity processing (normalize/dedupe/grade/rank) | `opportunity-detector` | PURE; caller collects (network) | 8/8 subset PASS | **L3** (L4 on real data — see §exp) |
| Opportunity figure-classification | `opportunity-policy` | OBSERVED/CALCULATED/INFERRED/UNKNOWN, invents no value | test PASS | L3 |
| Research ranking | `research-ranking` | weighted score + fail-closed on missing provenance | test PASS | L3 |
| Unit economics | `unit-economics` | 4 time-buckets, never imputes ODG's own time; composes economic-unit | test PASS + live demo §13.6 | **L4** (computed real margins; capacity UNPROVEN flagged) |
| Economic extraction / price | `economic-extractor`, `price-resolution` | pure | tests PASS | L3 |
| **License inspection** | **`license-policy` (NEW)** | SPDX-family classifier + adoptionVerdict, fail-closed | **20/20 benchmark** + live GitHub qualification | **L4** |
| Web collection / external research | `external-research-live/-transport` | network + provider | — | **L6** (provider/credential-gated; see §13.9) |
| Public GitHub/PyPI/SPDX read | adapter via global fetch | HTTPS public APIs | live 200s this cycle | **L4** |
| Commercial lead discovery | `opportunity-detector` (lead-grade) | needs real company/buyer data | fixtures only | L3 / L6 for real leads (ethics/data) |
| Finance (markets) | `finance-sim/paper` | SIMULATION-ONLY | tests PASS | L3 (sim by design) |

## §13.2 Reproducible benchmark + results
**`runtime/core/license-policy.test.ts` — 20/20 PASS** (positive: MIT/Apache-2.0/BSD/ISC/CC0 ⇒ permissive/public-domain,
commercial+proprietary OK; negative: GPL ⇒ no proprietary redistribution, AGPL ⇒ no closed-SaaS, CC-BY-NC ⇒ not
commercial; weak-copyleft LGPL/MPL ⇒ conditional; **ambiguous/unknown ⇒ FAIL-CLOSED null**). Stable case set; a
composite is intentionally avoided — per-dimension verdicts only. **FAIT VÉRIFIÉ.**

## §13.3 Gap ranked + improvement actually made + proof
**Gap (highest impact × frequency × low-risk × high-reuse):** ODG's license inspection was **ad-hoc** — hardcoded
per-case strings (the flux-schnell "Apache-2.0 commercial OK" / flux-dev "NON-COMMERCIAL" from the model-selection
lot), no systematic basis, no fail-closed for unknown, not reusable. License-compat gates EVERY technical/OSS
opportunity (§6).
**Improvement:** `runtime/core/license-policy.ts` — deterministic SPDX-family classifier (permissive / public-domain /
weak- / strong- / network-copyleft / non-commercial / unknown) with two decision dimensions (`commercialUseOk`,
`proprietaryRedistribution`) + a target-aware `adoptionVerdict`; FAIL-CLOSED on unknown. SPDX-calibrated (v3.29.0,
740 ids / 154 OSI, fetched read-only).
**Before/after (measured):** before = 2 hardcoded strings, 0 fail-closed, 0 benchmark, not reusable; after = family
coverage over SPDX space + explicit unknown-handling + **20-case benchmark** + reusable across missions. Regression
proof: the capability **reproduces the earlier manual flux finding** (Apache-2.0 ⇒ adoptable; FLUX.1-dev ⇒ not) — now
systematic. **RÉSULTAT EXPÉRIMENTAL.**

## §13.4 Opportunity portfolio (honest)
Real discovery run (§13.5) over `api.github.com/search/repositories` (query "spdx license detection…", 1483 found,
12 qualified live, each license classified by `license-policy`). **Honest result: NO qualified technical opportunity
emerged.** The naive full-text query had **low discovery-relevance** — it returned popular generic repos
(awesome-rust/CC0, nlohmann-json/MIT, polars/MIT, zed/"Other") rather than actual license-detection tools. The
license-QUALIFICATION was correct (permissive ⇒ adopt=true; "Other"/CC-BY-SA ⇒ adopt=null fail-closed). Per §13, no
opportunity is invented. **Documented next gap: discovery-relevance (query precision / capability-matching).**
Conclusion: `RÉSULTAT EXPÉRIMENTAL` (qualifier works) + `INCONNU` (no relevant candidate found at this query precision).

## §13.5 Real experiment executed
Real, €0, read-only, inspection-only (no repo cloned/executed): live SPDX fetch (740 licenses) + live GitHub search
+ live license qualification of 12 real repos via the new capability. fetchedAt 2026-10-26T19:52Z. **RÉSULTAT
EXPÉRIMENTAL** — the discovery→qualify cycle runs end-to-end on real public data.

## §13.6 Financial model (explicit assumptions) — DEMONSTRATION
`unit-economics.computeUnitEconomics` on a representative "automated code-audit + fix pack" engagement, ALL figures
`HYPOTHÈSE`: direct cost €20 (compute/API, assumed), ODG-active time NOT charged as human time, human €60/h.
Scenarios → contribution margin: PRUDENT €900→€880 · CENTRAL €1500→€1480 · FAVORABLE €2500→€2480. The module
**flags CAPACITY_UNPROVEN** (durations are estimates, not a demonstrated SLA). **No revenue, no clients, no validated
demand** — a capability demonstration with explicit hypotheses, not a market claim.

## §13.7 Learning capture + reuse (proven)
CAPTURED+STORED: the flux license finding (model-selection lot). **REUSED+CONFIRMED:** generalized into
`license-policy`, whose benchmark asserts the capability reproduces that finding systematically — a proven
reuse→improvement (ad-hoc → tested reusable policy). Memory: `[[replicate-first-paid-benchmark-2026-10-26]]` (flux
licenses) → this capability.

## §13.9 Capabilities impossible to test — reason · owner · action
| Capability | Why BLOCKED | Owner | Unblock action |
|---|---|---|---|
| External research / web collection (live) | provider/credential-gated; network-provider deliberately off | CTO | authorize a collection provider + credential (bounded) |
| Commercial lead discovery (real companies/budgets) | needs real B2B data; ethics/ToS | CTO | authorized data source + outreach permission |
| Video model comparison | Replicate exposes no pricing API | external data | official verifiable Replicate price |
| Any paid experiment | budget €0 | CTO | separate chiffré authorization |
| Real demand validation | needs real customer signals / contact | CTO | authorize a market test |

## Verdict
Delivered: a real, tested, reusable capability improvement (`license-policy`, L4, 20/20) closing the ad-hoc
license-inspection gap; a reproducible benchmark; a real €0 discovery+qualify experiment on live public data; an
honest portfolio (no opportunity invented); a financial-model demonstration with explicit hypotheses; proven
learning-reuse. No market/revenue/demand claimed. Discovery-relevance (query precision) is the top next gap; live
external collection + paid experiments remain CTO-gated.
