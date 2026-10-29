# Distribution · Assumptions · Autonomy accounting · Mission report (Study V2, 2026-10-22)

## 1. Acquisition & delivery strategy (NO external contact in this mission)
**Buyer profiles & triggers:**
- PE funds / corp-dev / acquirers → trigger: a live deal (tech-DD, time-boxed) → OPP-1.
- EU software/product manufacturers & SaaS → trigger: CRA SBOM deadline (2027-12-11), customer/procurement SBOM demands → OPP-2/3.
- CTOs/VPEng of scale-ups & ISVs → trigger: release-risk, audit, refactor/migration → OPP-4/5.
- Regulated-sector & enterprise buyers (via partners) → trigger: compliance/assurance obligations → Model C/D.

**Qualification criteria (to apply later, when contact is authorized):** named budget + a dated trigger + repo-access consent + a decision-maker + an acceptable liability frame. No buyer is qualified today; none contacted.

**Channels:** (a) **partner/subcontract** (SIs, consultancies, PE advisory firms who own clients) — primary, lowest CTO sales load; (b) direct productized diagnostics (inbound via content/evidence credibility); (c) marketplaces/OEM embed (later, R9/R5). Avoid public tenders early (references/insurance gap).

**Partner/buyer longlist — PUBLIC INFORMATION ONLY, NOT CONTACTED, NOT QUALIFIED, illustrative categories:**
- SBOM/supply-chain vendors (ecosystem/partner potential): Sonatype, JFrog, Snyk, Anchore, FOSSA (public market players — as channel/OEM references, not leads).
- PE/M&A technical-DD boutiques (subcontracting potential): category exemplars (e.g. madewithlove, Async Advisor) surfaced in sources — as *comparables/channels*, not qualified buyers.
- SIs/consultancies (subcontract delivery): category (global SI / regional ESN) — names to be researched when partnering is authorized.
> These are categories + publicly-listed firms for channel *planning*; contacting, pitching, or qualifying any of them is OUT OF SCOPE here and needs separate authorization.

**First external reference (the pivotal milestone):** obtain ONE consented, bounded engagement (a friendly scale-up/ISV or a partner's client) where ODG runs the evidence pack on a repo whose owner explicitly authorizes access; a human reviews+signs; deliver a reference + testimonial. **No client repo may be inspected without explicit owner authorization.** This converts proof → repeatable offer.

**Deliver solo vs supervised vs partner — decision criteria:** solo+reviewer for fixed-fee diagnostics on small repos; supervised (reviewer + exception plan) for recurring assurance; partner/subcontract for large lots, regulated clients, or anything needing certs/insurance/team ODG lacks.

## 2. Assumptions · unknowns · evidence needed (register)
| Assumption / unknown | Type | Status | Evidence needed |
|---|---|---|---|
| Conversion rate of diagnostics→paid | HYP | **NOT_MEASURABLE** | real outreach results (future) |
| ODG runs on external repos reliably | gap | UNPROVEN | R2 proof |
| A human reviewer is available/affordable | HYP | UNKNOWN | reviewer arrangement |
| Buyers accept "readiness/evidence" liability frame | HYP | UNKNOWN | legal/claim-wording review |
| ≥1 SI partner will subcontract ODG | HYP | UNKNOWN | partner conversations (future auth) |
| Recurring churn/retention | HYP | NOT_MEASURABLE | post-first-client data |
| Primary-source tender/award amounts | FACT-gap | NOT RETRIEVED | consult BOAMP/UGAP directly |
| €10M needs funding/product/channel | structural | ASSESSED | funding + design partner |
| Taxes/insurance/support unit costs | cost-gap | UNKNOWN | quotes when operational |

## 3. Autonomy accounting — who did what in THIS mission
- **ODG (orchestrator):** chose method, built the analysis plan, graded capabilities from repo evidence, constructed the models/scenarios/roadmap, separated FACT/HYP, flagged contradictions, updated the boussole.
- **Bounded technical provider (Claude Code):** executed the read-only repo inspection and the WebSearch calls (because **ODG's own autonomous web egress is BLOCKED** — `a.test`), under ODG's direction. Logged, not simulated.
- **Human (CTO):** none required for this research mission; required LATER for signatures, contact, liability, repo-access consent, partner deals (all out of scope here).
- **Autonomy caveat:** this division shows ODG can drive research/analysis/modeling with provider-executed I/O; it does NOT prove autonomous *delivery* (G10 NOT_MEASURABLE, egress BLOCKED). Study-quality ≠ general autonomy.

## 4. Mission report
- **Truth Lock (initial==final):** HEAD `84b68e2` == origin/main, 0↔0, 5 stashes preserved. V1 artifacts (`00–03`) preserved (uncommitted). No code/system/production change. Active technical missions untouched.
- **Files produced/updated (uncommitted, documentary):** `docs/market-research/04_STRATEGY_1M_10M.md`, `05_REVENUE_MODELS_12MO.md`, `06_CAPABILITY_TARGET_AND_ROADMAP.md`, `07_…` (this), `ODG_PROJECT_STATE.md` (boussole), contract `runtime/missions/MARKET_OPPORTUNITY_INTELLIGENCE_V2.json`.
- **Results:** two inventories (current vs target); 6 revenue models with 12-mo equations; a conditional €1M path (Model F + 6 prerequisites) and an assessed €10M path (product/channel, LOW/NOT_MEASURABLE in 12mo); gap→mission roadmap (R1–R10, tiered); distribution/partnership plan with no contact; assumptions register; autonomy accounting.
- **Tests:** none re-run (research-only). **Blocks:** ODG autonomous web egress BLOCKED; no primary-source award amount; families G/H/J/K/L/M/N at register level (PARTIAL). **Commit:** NOT done (§2.8 forbids commit/push under this mandate).
- **Status:** `PARTIAL` (models + strategy delivered on evidence; demand/conversion/delivery remain to be proven via real milestones). Nothing presented as acquired revenue.

## 5. Sources added in V2 (consulted 2026-10-22 via provider WebSearch)
- Managed security/compliance ARR & pricing: medhacloud.com/blog/managed-services-market-statistics-2026 · bennettfinancials.com/cyber-security-recurring-revenue-models · msspproviders.io/resources/how-much-does-an-mssp-cost/ · meriplex.com/managed-security-services-cost-2026/
- SI/partner & subcontracting economics: dealhub.io/glossary/partner-margin/ · elinkages.com/guides/si-vs-var-vs-msp · softwaremodernizationservices.com/insights/application-modernization-consulting-rates/
- Supply-chain security market & product ARR: mordorintelligence.com/industry-reports/software-supply-chain-security-platforms-market · futuremarketinsights.com/reports/sbom-management-and-software-supply-chain-compliance-market · aikido.dev/blog/sboms-everyones-generating-them-no-one-using-them
- Dev-tool SaaS pricing: withorb.com/blog/developer-tools-pricing-statistics · saaspare.org/research/saas-pricing-2026
(V1 source register in `03` remains valid; figures cross-checked across ≥2 sources per family where possible; secondary sources — displayed prices/analyst estimates — not contractual awards.)

## 6. Next action (single, highest-value — NOT executed; needs separate authorization)
Execute **Tier-0**: (R1) fix DEF-GAMMA false-success, then (R2) prove the evidence pack on ONE consented external repo with (R3) a human reviewer sign-off → (R4) first reference. This is the gate that turns the €1M Model-F path from conditional to credible. Each is a separate authorized engineering/commercial mission; no client contact or repo access without the owner's explicit authorization.
