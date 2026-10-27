# ODG — Paths to the €500k/12-month strategic TARGET (V1, 2026-10-27)

CTO strategic override: minimum target **€500,000 revenue in the first 12 months**. This is a **TARGET, not a validated
or guaranteed result.** Current evidence = **0 clients, 0 signed, 0 cashed** (pre-first-client). The maths below are
enforced by the testable model `runtime/core/revenue-model.ts` (gated suite 8/8); all euro inputs are **HYPOTHESIS**
unless cited. Figures kept strictly distinct: **signed / invoiced / cashed / margin / cash** (never conflated). No
fabricated client, order, or revenue.

## Why price-raising alone is insufficient (re-design, not a markup)
A €2.5–9k productized assessment (GTM V1) cannot reach €500k at any realistic volume for a solo launch. Reaching €500k
requires a **business-model shift toward high-value B2B contracts + recurring + partner distribution**, not a higher
sticker on the same small assessment. Four models are modelled; each states assumptions, confidence method, gaps.

## The maths (model: new contracts × value + recurring, no double-count, lag-aware)
`contractsForTarget(500000, v)` = ceil(500000 / v): €25k→20 ; €40k→13 ; €60k→9 ; €100k→5.

| model | shape (HYPOTHESIS) | signed-12 maths | reaches €500k? | key gaps / confidence |
|---|---|---|---|---|
| **M1 Productized assessment only** | ~€6k × volume | ~€48k at 8 pilots | **NO** (gap ~€452k) | honest floor / risk scenario — confidence low |
| **M2 High-value B2B programs** | ~13 × €40k governance/AI-Act readiness programs | ~€520k one-off | **YES (maths)** | needs enterprise sales motion + delivery capacity + trust proofs — confidence: hypothesis, unvalidated |
| **M3 Fewer flagship + recurring** | 8 × €40k + €2k MRR/client | ~€320k one-off + recurring | **approaches**; +2–3 contracts or higher MRR to clear €500k | recurring retention unproven — confidence: hypothesis |
| **M4 Partner/white-label distribution** | ODG powers N partner engagements (rev-share) | leverage × partner volume | **YES if partners convert** | needs signed partners + legal white-label terms — confidence: low until a partner signs |

**Honest verdict:** only **M2 / M3 / M4** can mathematically reach €500k, and **none is market-validated** — each is a
HYPOTHESIS with named missing capabilities. The €9k/48k/120k figures from GTM V1 are **RISK/comparison scenarios**
(explicitly labelled), not the program destination. The target is **not silently lowered** and **not claimed achieved**.

## What must be true for €500k (missing resources/capabilities — to close)
- **Enterprise sales motion** (pipeline, qualification, proposals, procurement/security-review handling) — partially
  prepared (`SALES_KIT_V1.md`); **unvalidated**.
- **Delivery capacity** for ~9–20 high-value engagements in 12 months — a solo founder cannot deliver all; needs
  subcontractors/partners (cost + management) → working-capital + CAC implications (model `launch-budget.ts`).
- **Trust proofs buyers of €40k+ require** — independent security validation / ISO readiness (EXTERNAL, see roadmap);
  without them, enterprise cycles lengthen and close-rates drop.
- **Distribution** — M4 needs signed partners + white-label legal terms (EXTERNAL, human).
- **Pricing validation** — no €40k price is market-tested; first paid pilot is the first real signal.

## Early indicators (confirm / invalidate — track from day 1)
qualified discovery calls booked → RFP/proposal requests → pilot acceptances → **first paid pilot cashed** → repeat/
upsell → partner LOIs. If, after the authorised first outreach batch, **no qualified signal** appears, the €500k path
via that segment is **invalidated** → re-orient (segment/offer/model) before any spend. Cash discipline stays under the
`launch-budget` model (€10k cap, €5k reserve, stop-threshold).

## Budget / cash (unchanged discipline)
€10k cap, €5k protected reserve, founder pay €0 (4 mo), fail-closed over-cap — `LAUNCH_BUDGET_V1.md` + `launch-budget.ts`.
Scaling to €500k delivery may require subcontracting spend that EXCEEDS the current cap → a **separate CTO budget
authorisation** would be required; not assumed.

## Grouped human decisions (none taken) & single priority
**Human-only:** (1) authorise first outreach send + legal review (pilot/pricing/white-label); (2) decide which model
(M2/M3/M4) to test first; (3) any spend / subcontracting / budget beyond €10k for €500k-scale delivery; (4) EXTERNAL
production + trust dependencies when enterprise clients require them.
**Single priority recommendation:** **test M2 (high-value B2B readiness programs) first** — highest €/contract, uses
ODG's demonstrable OWASP-ASI + regulatory-assurance differentiator, shortest credible path to a large first contract.
Concretely: authorise sending a **small first batch** of the already-prepared outreach to enterprise-leaning prospects;
a first paid €X pilot is the only credible validation that the €500k maths are reachable in THIS market. Until then,
€500k remains a **modelled target with an explicit, unclosed evidence gap — stated, not hidden.**
