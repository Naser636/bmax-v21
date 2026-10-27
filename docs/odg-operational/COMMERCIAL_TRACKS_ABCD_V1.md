# ODG — Commercial tracks A/B/C/D (voies) V1 (2026-10-27)

Four parallel commercial tracks so the €500k program does not depend on one offer/client/channel. Consolidated by
`runtime/core/commercial-portfolio.ts` (suite 7, reuses `revenue-schedule`). **€500k is a TARGET; prices HYPOTHESIS;
pipeline empty; nothing invented.**

## ⚠ A/B/C/D naming — collision disclosure (mandate §1.5, NOT silently replaced)
"A/B/C/D" is overloaded in this repo; these V11 **voies** are a NEW, distinct meaning and do **not** replace the others:
- **niche-scoring `switchDecision`**: A/B/C/D = fallback *strategies* (HOLD_A / STAY_A / CONTINUE_A / SWITCH_B/C/D).
- **revenue-channels**: A/B/C/D = *GTM scenarios* (SOLO / SOLO_RECURRING / PARTNER / SUBCONTRACT).
- **FIELD_DOSSIER**: A–F = *niches* (A cyber/ISO, B AI-governance, …).
- **These voies (V11)**: A/B/C/D = *mission-size tracks* (below). Labels are caller-supplied in the portfolio model.

## The four voies (fiches)
### Voie A — small fixed-scope missions / first cash
Client: SME eng/compliance lead. Trigger: questionnaire, regulation, incident. Deliverable: limited audit / SBOM /
dependency+license check / provenance / short remediation / reproducible diagnostic on authorised data. Scope tight;
exclusions: no cert/guarantee. Acceptance: SBOM per ecosystem + findings w/ evidence. Capability proof: gated SBOM/
provenance/license/audit-log. Human time: low (automatable + review). Price (HYP): €500 / €1.5k / €3k / €5k. Margin: high.
Recurrence: low; **upgrade → Voie B/C**. *Fastest first cash (paid pilot wedge).*

### Voie B — intermediate missions
Fuller audit / reliability / automation / API integration / evidence production, with explicit scope + delay + acceptance.
Price (HYP): €5–8k (A-offer) / €8–15k (C-offer). Margin ~70%. Upgrade: → recurring (Voie C) after acceptance.

### Voie C — large contracts + recurring
High-value projects + recurring assurance/monitoring + integration. Verify delivery capacity, real need, observable
budget, trust reqs, concentration + payment-lag risk. Price (HYP): project €18k+ / recurring €1–2k/mo. **Never assume a
€20k/€40k+ contract is won.** Contribution/cost/cash computed in the monthly model.

### Voie D — partners & alternative channels
Agencies / integrators / ESN / cyber & DPO firms / platforms / public tenders. Reuse `PARTNER_DISTRIBUTION_RESEARCH_V1`
(11 real candidates, 0 accepted) + platform study (`MISSION_PLATFORMS_RESEARCH_V1`). Commission/white-label reduces net
margin (revenue-channels: 40%/30%). No partnership acquired before a real agreement; no contact without authorisation.

## Consolidated portfolio (illustrative; HYPOTHESIS mix A+B+C)
| voie | cashed within 12 mo | share |
|---|---|---|
| A-small (30 prospects/mo, €2k) | €14,175 | 18.8% |
| B-intermediate (12/mo, €9k) | €25,515 | 33.9% |
| C-big+recurring (6/mo, €18k+€2k/mo) | €35,626 | 47.3% |
| **consolidated** | **€75,316** | 100% |
Concentration **MEDIUM** (47.3% max share) · delivery **within solo capacity**. (This modest illustrative mix cashes
~€75k; scaling to €500k needs higher volume/price or channels — see PATHS_TO_500K_V1.)

## Substitution & continuity (mandate §3 — no single point of failure)
Per voie: prerequisites / assumptions / evidence / progress signals / blockers / **fallback** / stop-revise-accelerate
criteria. If **big contracts (C) delay** → keep running small missions (A) + channels (D). If **direct sales blocked** →
analyse platforms/partners/tenders (D). If a **partner doesn't fit** → pursue others, none assumed acquired. If an offer
**can't be delivered** with proven capability → reduce scope or mark BLOCKED, never sell as operational. If a **CTO
decision** is needed for an external act → keep the draft, continue internal work. Thresholds are HYPOTHESIS, revised
from real data (NO_DATA today).

## Honesty
€500k TARGET; 0 real opportunities (NO_DATA); signed≠invoiced≠cashed≠margin; concentration flagged; partners 0 accepted;
no contact/purchase; nothing invented. Reuses revenue-schedule/channels/scenarios/pipeline — no second architecture.
