# ODG — Pricing grid (V1, 2026-10-27)

From `runtime/core/pricing-grid.ts` (suite 10, fail-closed). **Every price is bound to a scope + day range + minimum
margin; all prices are HYPOTHESIS until validated by market demand + CTO. This grid publishes nothing.** The live site
is currently quote-only — this is an internal pricing instrument + a proposal to test public "starting-from" prices.

| offer | tier | scope | days | price band (HT) | implied day-rate | public? | exclusions |
|---|---|---|---|---|---|---|---|
| diagnostic | ENTRY | bounded diagnostic + options | 1 | €490–990 | €490–990 | **public** | remediation, client prod |
| audit-limited | ENTRY | limited audit + report + evidence (SBOM/deps/licenses) | 2–3 | €1,500–3,000 | €500–1,500 | **public** | fix implementation, certification |
| remediation-assurance | ENTRY | bounded remediation / assurance pack | 4–6 | €3,000–5,000 | €500–1,250 | quote | unbounded rework, legal opinion |
| deep-audit | INTERMEDIATE | deep audit / defined lot | 6–10 | €5,000–10,000 | €500–1,667 | quote | production hosting |
| reliability-integration | INTERMEDIATE | reliability / automation / integration | 10–18 | €8,000–15,000 | €444–1,500 | quote | open-ended scope |
| program | HIGH | multi-lot / extended | 20–36 | €15,000–30,000 | €417–1,500 | quote | scope beyond SOW |
| recurring-assurance | RECURRING | monthly assurance/monitoring (deliverable-based) | — | €1,000–2,000/mo | n/a (not day-rated) | quote | certification, guaranteed outcome |

Day-rate floor = €400/day (sub-floor bands are rejected). Verified market comparables: code-audit €4–12k, ISO-readiness
€3–6k, vCISO €3–20k/mo (COMMERCIAL_RESEARCH_V3) — the bands sit within these.

## Margin honesty (important)
Validation at **€0 marginal cash cost** (solo, own tooling): all entries valid; **diagnostic + audit-limited** are
publishable "starting-from". Validation at an **imputed €350/day delivery cost**: the thin entry-margins fall below
their 55–60% minimums (flagged) — i.e. **if you value a delivery day at €350, the lowest entry prices are thin-margin**.
⇒ either keep entry offers as loss-leaders to win the first reference (conscious choice), or raise entry prices. Honest
signal, not hidden.

## Public vs quote
**Publish (starting-from):** diagnostic (€490), audit-limited (€1,500). **Quote-after-scoping:** everything else
(deliberately, to avoid anchoring complex work on a number). Each engagement: deposit + milestone payments where legal/
appropriate. **No invented testimonial/client/result/reference.**

## Status
Internal grid ready; the decision to display public starting-from prices on the site is a **CTO decision** (prices
HYPOTHESIS, demand-test required). Nothing published.
