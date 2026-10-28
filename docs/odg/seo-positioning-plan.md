# ODG — Product Positioning & Organic-Visibility (SEO) Plan (Phase 6)

> PREPARED, NOT PUBLISHED. No site is live; no ranking is promised; keyword intents are hypotheses until real Search Console data exists. Generated from `runtime/core/seo-strategy.ts`. Honesty gates are enforced in code.

## Offer (grounded on the product dossier)
- **Offer:** code-health-check-v1
- **Segment:** small-to-mid software teams using JavaScript/TypeScript/Python that run CI and want fast, objective, evidence-backed pre-merge syntax/type verification
- **Problem:** compile/type errors reach CI/review, breaking builds and costing developer time; teams want a reproducible pass/fail with proof

## Search-intent hypotheses (keyword research — NOT measured volume)

| Query | Intent | Target page | Rationale |
|---|---|---|---|
| pre-merge code verification tool | commercial | product | buyers evaluating a packaged pre-merge check for JS/TS/Python |
| ci syntax check javascript typescript python | informational | docs | teams wiring syntax/type checks into CI — top of funnel |
| catch typescript type errors before ci | informational | article | problem-aware search; educational content demonstrating expertise |
| shareable code health evidence report | commercial | proof | the differentiator — an objective, shareable pass/fail with proof |
| tsc noemit vs paid code health check | commercial | comparison | honest comparison vs the strong FREE DIY alternative (disclosed, not hidden) |

## Site architecture

| Path | Type | Title | Links to |
|---|---|---|---|
| `/` | home | Code Health Check — objective pre-merge verification | /product, /docs, /proof |
| `/product` | product | Code Health Check for JS/TS/Python CI | /docs, /proof, /compare, /demo |
| `/docs` | docs | Documentation — how the check works | /product, /demo |
| `/demo` | demo | Live demo — run a check, get an evidence report | /product, /proof |
| `/proof` | proof | Evidence & limitations (what is and isn't verified) | /product, /compare |
| `/compare` | comparison | Code Health Check vs free DIY CI checks | /product, /proof |
| `/blog/catch-type-errors-before-ci` | article | How to catch TypeScript type errors before CI | /docs, /product |

## Structured data policy (schema.org)
- **Allowed (if content matches):** WebSite, Organization, SoftwareApplication, TechArticle, FAQPage, BreadcrumbList
- **Requires REAL verified reviews (refused otherwise):** Review, AggregateRating, Rating

## Instrumentation

| Metric | Source | Definition |
|---|---|---|
| impressions | Google Search Console | times a result appeared in search |
| clicks | Google Search Console | clicks from search results |
| ctr | derived | clicks / impressions |
| conversions | site analytics (consented) | demo-request or contact events |
| qualified_demand | demand-experiment | verified WTP signals (fail-closed; see demand-experiment) |

## Honesty caveats (enforced)
- no site is published; this is a plan, not live SEO
- keyword intents are HYPOTHESES until real Search Console data exists (no invented volume)
- no guaranteed ranking; follows Google Search Central guidance
- no review/rating structured data (0 verified reviews); no fabricated testimonials
- demand remains DEMAND_NOT_VALIDATED (see demand-experiment) — SEO does not substitute for willingness-to-pay

## Anti-overclaim (enforced by `reviewSeoCopy`)
Refused: guaranteed-ranking language, unbacked superlatives (via `excellence-policy`), fabricated social proof without a verified evidence reference.
