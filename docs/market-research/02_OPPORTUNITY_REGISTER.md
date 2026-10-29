# ODG Opportunity Register — sourced (Market Study V1, 2026-10-22)

**Legend:** FACT = externally sourced (URL+date in `03…SOURCES`). HYP = ODG hypothesis/estimate. ODG-fit from `01_…CAPABILITY_INVENTORY`. No figure here is ODG-acquired revenue. Prices in source currency.

---
## OPP-1 — Software Technical Due-Diligence / Code & Supply-Chain Audit (evidence pack) — *best quick-win fit*
- **Costly problem (FACT):** M&A/PE buyers need fast, defensible code/architecture/licence/security risk reads before investing; a tainted OSS licence or hidden debt can kill or reprice a deal.
- **Buyer / trigger:** PE funds, corp-dev, acquirers, VCs; trigger = a live deal (time-boxed, ~5 days).
- **Demand & price (FACT):** light $5–15k; standard $15–40k; deep (regulated/late-stage) $40–150k+; specialist firms $300–600/hr, full review $35–95k; mid-market 5-day read $10–25k (≈$15k midpoint); rule-of-thumb 0.3–0.7% of deal size (madewithlove; papermark; sparkletechnologies; asyncadvisor; growthshuttle — 2026).
- **ODG capability (PROVEN substrate):** SBOM inventory, provenance stamping, JS/TS parity (no-drift proof), own-repo static/clean scans, mission-ledger audit trail → a reproducible **tech-DD evidence pack**. Gaps: must run on the TARGET's repo (external-repo execution NOT yet demonstrated — HYP risk); findings need a **human reviewer** (ODG generates evidence, a human signs the opinion); DEF-GAMMA false-success must be disclosed/guarded.
- **Deliverable:** fixed-fee 3–5-day "evidence read": SBOM + licence/dependency risk + reproducibility/parity findings + debt/hotspot scan + structured risk memo. Acceptance: pack reproducible + reviewer-validated.
- **Pricing (HYP):** diagnostic €5–8k; standard 5-day read €10–20k; deep €25–40k. **Fastest path to a first invoice.**
- **Costs/margin (HYP):** mostly ODG compute + a human reviewer day(s); gross margin high (software-generated), contributive margin depends on reviewer cost. NOT net profit.
- **Barriers:** references/credibility for deal-critical work; liability; access to target repo under NDA; reviewer sign-off.
- **Missing proof before selling:** ONE external-repo evidence-pack run end-to-end + an independent reviewer validating the findings.
- **Repeatable:** YES (productizable, per-deal). **Confidence demand: HIGH; ODG-exec: MEDIUM.**

## OPP-2 — SBOM + Build-Provenance Evidence Pack for CRA readiness — *proven real artifact*
- **Problem/regulatory (FACT):** EU CRA vulnerability/incident reporting in force **2026-09-11**; SBOM obligations apply **2027-12-11**; manufacturers must produce/maintain an SBOM (CycloneDX/SPDX) in technical docs (anchore; fossa; cloudsmith; sota.io — 2026).
- **Buyer / trigger:** EU software/product manufacturers & SaaS; trigger = CRA deadline + customer/procurement SBOM demands.
- **Demand & price (FACT):** tooling €399/mo (Venvera) to €1,500/product/yr (Legalithm); most platforms hide pricing → room for a **service/evidence-pack** rather than SaaS.
- **ODG capability (PROVEN):** 489-component CycloneDX SBOM reproduced + provenance stamping. Gaps: **SLSA L2 BLOCKED** (self-signed only); "readiness, not conformity"; must run on client artifact.
- **Deliverable:** per-product SBOM + provenance attestation + a CRA-SBOM-readiness note. Acceptance: SBOM reproducible + maps to CRA Annex requirements.
- **Pricing (HYP):** €3–8k per product (one-off) or small retainer for refresh.
- **Barriers:** SaaS incumbents cheaper for pure tooling; ODG differentiator = reproducible evidence + provenance, not a dashboard. Liability for "compliance" claims (avoid — sell readiness).
- **Missing proof:** a client-artifact SBOM run + legal review of claim wording.
- **Repeatable:** YES. **Confidence demand: HIGH (regulatory); ODG-exec: MEDIUM-HIGH (artifact proven).**

## OPP-3 — CRA / EU-AI-Act / ISO-42001 Readiness Gap Diagnostic — *tool exists; advisory*
- **Problem/regulatory (FACT):** firms need structured readiness before costly certification; EN ISO/IEC 42001:2026 adopted **2026-03-18** but **no harmonised AI-Act standard yet cited in the OJ** (certification ≠ AI-Act presumption of conformity).
- **Demand & price (FACT):** ISO 42001 cert total $85k (SME) → $650k (large); consultants $800–£1,500/day; **gap assessment $5–15k**; implementation support $20–80k (elevateconsult; axipro; certify.consulting — 2026).
- **ODG capability (PARTIAL):** deterministic readiness-matrix tool (10/10 tests). Gaps: ODG is **NOT a certifier/auditor**; output is a gap scorecard, not conformity.
- **Deliverable:** readiness gap report + prioritized remediation backlog. Pricing (HYP): €4–12k gap diagnostic.
- **Barriers:** crowded consultancy field; credibility; must not overclaim. **Confidence demand: HIGH; ODG-exec: MEDIUM.**

## OPP-4 — Continuous QA / Release-Validation Gate (managed) — *high potential, needs defect fix*
- **Demand & price (FACT):** Western-EU QA senior €500–750/day, specialist €750–1,200/day; managed QA $15–50k/month; automation-framework build $75–200k over 2–3 months (deviqa; qamadness; totalshiftleft — 2026).
- **ODG capability (PROVEN substrate / REPORTED gate):** equivalence/parity benches are a genuine release-assurance asset. **Blocker:** DEF-GAMMA false-success (a QA product that can report false success is unsellable until fixed); external-repo proof missing.
- **Deliverable:** parity/regression evidence gate wired into a client CI. Pricing (HYP): pilot €8–15k; managed €8–20k/mo.
- **Missing proof:** fix DEF-GAMMA; prove on a client repo/CI. **Confidence demand: HIGH; ODG-exec: LOW-MEDIUM (defect-gated).**

## OPP-5 — Legacy Modernization / TS-Migration-with-Parity Lot — *high € but biggest gap*
- **Demand & price (FACT):** modernization $50k–$2M+; mid $150–500k; enterprise $2M–10M+; AI-assisted from $250k; 67% of projects exceed budget >35% (fullstack; radixweb; mobisoft — 2026).
- **ODG capability (PROVEN self / NOT_IMPLEMENTED external):** parity benches + own-repo TS migration are a real differentiator (provable no-drift), but **never shown on an external/large client repo** (HIGH gap) and ODG cannot staff a multi-month program solo.
- **Deliverable:** bounded "modernize-with-parity-evidence" lot. Pricing (HYP): €40–150k bounded lot (not the full program).
- **Barriers:** team/references/delivery capacity; needs consortium/subcontracting for €500k+. **Confidence demand: HIGH; ODG-exec: LOW (capacity+external-proof gaps).**

## OPP-6 — Agentic-AI Governance / Evidence Audit — *market hot, ODG trust-gaps*
- **Demand & price (FACT):** enterprise AI-governance market $2.2B(2025)→$4.9B(2030); LLM-observability $1.97B(2025)→$2.69B(2026, 36% CAGR)→$9.26B(2030); tooling $50–100k+/yr enterprise, Datadog Pro $160/mo, Braintrust from $249/mo (guptadeepak; nops; truefoundry — 2026).
- **ODG capability (PARTIAL):** governance-kernel/truth-lock/ledger/evidence are thematically on-point, BUT `authorityEnforced:false` and crowded tooling (90+ vendors). ODG fit = *governance-evidence audit* of someone's agent stack, not a platform.
- **Pricing (HYP):** €6–20k audit. **Confidence demand: HIGH; ODG-exec: LOW-MEDIUM (authority gap, crowded).**

## Lower-fit / de-prioritized (market real, ODG capability weak/absent)
- **Cloud/GPU FinOps (D):** demand strong (30–40% GPU savings; 5:1–10:1 ROI — spheron; cloudkeeper; prosperops 2026) but **ODG has no billing/cloud integration** → analyze-only. DEFER.
- **IDP / platform engineering (O8):** Backstage 100-eng ≈ $450–700k yr1 (roadie) but ODG = SPECIFICATION_ONLY. DEFER.
- **Observability/AIOps platform (O7):** crowded tooling; ODG not a platform. DEFER.
- **Autonomous web-research-as-a-service:** ODG autonomous egress BLOCKED (`a.test`). NOT_SELLABLE now.

## Public-procurement channel (primary-source note)
BOAMP (France official journal) + UGAP tender "Conseil et audit en sécurité" (planned Jan 2026, commercialization ~Oct 2026) confirm a real public audit-services channel (boamp.fr; ugap.fr; francemarches 2026). **A specific attributed amount for an SBOM/software-audit lot was NOT retrieved this pass** → logged as a next-validation (consult BOAMP/UGAP directly). Public tenders also demand references/certifications/insurance ODG lacks → not a quick-win channel.
