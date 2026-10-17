# ODG — PRIVATE-SECTOR OPPORTUNITY DOSSIERS (GATE D, evidence-linked)

> CTO directive @ `aa25c9f`. Provisional context: **B2B software supplier, France/EU, private clients**
> (legal/fiscal status TBC before any firm offer). Web research executed this session (SEARCH→OPEN→EXTRACT→
> SOURCE-CHECK→VERIFY). **Public-sector / government / public-procurement opportunities EXCLUDED** (directive).
> **No fabrication:** every market figure carries a retrieved source (publisher + URL + consulted 2026-10-17);
> contract-size and financials are **estimates with explicit method + confidence + tagged assumptions**, NOT
> quoted deals or guaranteed revenue. The €500k threshold = plausible GROSS value of a defined private program
> (readiness + implementation + managed service), not total market size and not acquired revenue. Market-size
> figures vary 2–10× across analysts (methodology differences) — treated as demand signals, not precise TAM.

## Methodology + confidence
Longlist built from the ten families; each candidate scored on demand-evidence, plausible contract size,
ODG-capability fit (C01–C10 substrate, see `ODG_CAPABILITY_ENGINEERING_AND_OPPORTUNITY_GATE.md`), gaps,
risk, confidence. Sources are secondary market analyses + vendor pricing pages (not primary buyer contracts);
**confidence is therefore MEDIUM at best** on amounts. A firm offer requires: ODG legal/fiscal identity (C1–C10
of `HUMAN_INPUTS_REQUIRED.md`), named-buyer discovery, and the external accesses (A1–A5). No client contacted.

## Sources (retrieved 2026-10-17; claim each supports)
1. Gartner — securing-AI market ~$2.8B (2026) / $4.8B (2027) — https://www.gartner.com/en/newsroom/press-releases/2026-08-26-gartner-forecasts-the-market-for-securing-ai-will-reach-almost-5-billion-in-2027
2. IDC via InfotechLead — 16.7% of AI budgets to agent security/governance; 1.2bn agents by 2029 — https://infotechlead.com/artificial-intelligence/ai-agent-governance-emerges-as-cio-priority-idc-says-16-7-of-ai-budgets-now-go-to-security-as-1-2-bn-ai-agents-expected-by-2029-97494
3. MarketsandMarkets — agentic-AI-security market — https://www.marketsandmarkets.com/Market-Reports/agentic-ai-security-market-97017233.html
4. ENISA — SBOM adoption state of play (2026) — https://www.enisa.europa.eu/sites/default/files/2026-06/SBOM%20Adoption%20State%20of%20Play%202026.pdf
5. Mordor — software supply-chain security platforms $5.53B(2025)→$10.1B(2030) — https://www.mordorintelligence.com/industry-reports/software-supply-chain-security-platforms-market
6. DigiCert — state of software supply-chain security (43% expect SBOM requirement) — https://www.digicert.com/content/dam/digicert/pdfs/report/the_state_of_software_supply_chain_security_report.pdf
7. Kellton — legacy modernization ($40k/yr/system; 25–35% infra savings) — https://www.kellton.com/kellton-tech-blog/what-makes-legacy-modernization-business-priority
8. Fortune Business Insights — Cloud FinOps $16.79B (2026) — https://www.fortunebusinessinsights.com/cloud-finops-market-112227
9. FactMR — AI FinOps/inference cost-opt services $0.7B(2026)→$22.5B(2036) — https://www.factmr.com/report/ai-finops-and-inference-cost-optimization-services-market
10. BrightDefense — EU AI Act pushing ISO/IEC 42001 — https://www.brightdefense.com/news/eu-ai-act-pushes-iso-iec-42001-into-ai-compliance-planning/
11. CSA — EU AI Act ↔ prEN 18286 ↔ ISO 42001 (42001 alone ≠ AI Act) — https://labs.cloudsecurityalliance.org/research/csa-research-note-eu-ai-act-pren-18286-iso-42001-20260428-cs/
12. alicelabs — EU AI Act consulting day rates ~$1,800–3,500 — https://alicelabs.ai/en/insights/eu-ai-act-compliance-consultants-2026
13. The Business Research Company — continuous testing ~$3.19B (2026) — https://www.thebusinessresearchcompany.com/report/continuous-testing-global-market-report
14. MarketsandMarkets — observability tools/platforms ~$11.91B (2026) — https://www.marketsandmarkets.com/Market-Reports/observability-tools-and-platforms-market-69804486.html
15. Mordor — AIOps ~$14.44B (2026) — https://www.mordorintelligence.com/industry-reports/aiops-market
16. Roadie — platform engineering 2026; Backstage 100-eng deploy $450–700k yr1 — https://roadie.io/blog/platform-engineering-in-2026-why-diy-is-dead/
17. Mordor — intelligent process automation ~$17.88B (2026) — https://www.mordorintelligence.com/industry-reports/intelligent-process-automation-market
18. Superblocks — AI governance platforms (Collibra ~$170k/yr; custom enterprise) — https://www.superblocks.com/blog/ai-governance-platform
19. Dark Reading — EU CRA SBOM (machine-readable) obligations from Sept 2026 — https://www.darkreading.com/application-security/sboms-in-2026-some-love-some-hate-much-ambivalence

## OPPORTUNITY COMPARISON (10 — ranked by ODG fit × demand evidence)
| # | Opportunity (private B2B program) | Demand evidence (src) | Plausible gross contract (method, confidence) | ODG substrate reused | Main gap / blocker | Verdict |
|---|---|---|---|---|---|---|
| O1 | **Agentic-AI runtime governance & guardrails** (deny-by-default agent orchestration + audit) | agent-sec $1.65–1.8B 2026; 16.7% AI budgets (2,3) | €500k–1.5M/yr program (readiness+integration+managed; vs platform ACV ~$170k + services, 18) · MED | C01, C05, C08 (action-gate, dispatch-invariant, authz) | live LLM-I/O injection layer = SPEC; connectors BLOCKED (creds) | QUALIFIED |
| O2 | **EU CRA / SBOM + SLSA build-provenance automation** | CRA SBOM mandate Sept 2026 (19); 43% expect SBOM req (6); market $5.5B (5) | €500k–1M (pipeline integration + evidence automation + audit prep) · MED | C02/C04 (evidence-provenance=SLSA-adapted, build-dist-closure, migrate-ts gate) | per-client CI integration = SPEC/BLOCKED (access) | QUALIFIED |
| O3 | **EU AI Act / ISO 42001 readiness & evidence** (prep + pre-audit, NOT certification) | Aug-2 2026 milestone; 7% rev penalties; day rates $1.8–3.5k (10,11,12) | €500k–900k (multi-month readiness program; ~day-rate×team×duration) · MED | C02, C04, C05, C08 (evidence/validation/authz/diagnostic) | ODG is NOT a certifier; needs human legal + accredited auditor | QUALIFIED (prep only) |
| O4 | **Legacy→modern migration (parity-proven)** | $40k/yr/system; 25–35% infra savings (7); ISG leaders | €500k–3M (multi-system program) · MED | C06 (migrate-ts + equivalence benches + runtime-paths — ODG's OWN proof) | generalize beyond ODG's JS→TS; per-stack adapters = SPEC | QUALIFIED |
| O5 | **Cloud/AI FinOps + inference cost control** | FinOps $16.8B; AI-FinOps services $0.7B→22.5B (8,9) | €500k–1.2M (ingestion+attribution+optimization managed) · MED | C09 (live-cost-metering, economic-verification) | live cloud-cost ingestion = SPEC + external read access | QUALIFIED |
| O6 | **Continuous QA / release-gate as a service** | continuous testing $3.19B; large-ent 67% (13) | €500k–1M/yr (managed gate + migration parity) · MED | C04 (validation-engine, local-test-gate, 5-gate, benches) | per-client test-infra integration = SPEC | QUALIFIED |
| O7 | **Observability / AIOps incident-reduction** | observability $11.9B + AIOps $14.4B (14,15) | €500k–1.5M (correlation+evidence-linked diagnosis managed) · LOW-MED | C08 (self-diagnostic, incident-recurrence, cockpit) | OpenTelemetry correlation + anomaly = SPEC; data access | QUALIFIED (lower conf) |
| O8 | **Internal Developer Platform / golden-path build** | Backstage 100-eng deploy **$450–700k yr1** (16); IDP $10.4B 2026 | €500k–800k (build+golden-paths+year-1 run) · **MED-HIGH** (direct priced anchor) | C07 (mission-contract-factory, bootstrap) | C07 SPECIFICATION_ONLY — real build needed | QUALIFIED |
| O9 | **B2B workflow automation (governed, human-in-loop)** | IPA ~$17.88B 2026 (17) | €500k–1M (process automation program) · LOW-MED | C10, C01 (capability-executors, bounded-remediation, action-gate) | connectors + live actions BLOCKED (creds/authz) | QUALIFIED (lower conf) |
| O10 | **AI supply-chain security posture (securing-AI)** | Gartner securing-AI $2.8B 2026 (1); 17x under-spend gap | €500k–1.2M (posture assessment + guardrail integration) · MED | C05, C02 (authz/sandbox/provenance) | overlaps O1; distinct = AI-asset inventory + posture | QUALIFIED (overlap O1) |

**Threshold result:** 10 candidates pass a *plausible* ≥€500k gross-program bar on retrieved demand + pricing
anchors, at **MEDIUM confidence** (strongest: O8 direct priced anchor; O2/O3 regulatory-driven). This is NOT
10 verified deals — amounts are method-based estimates from secondary sources; named-buyer validation + a firm
pricing study remain required before any offer.

## Contract vs revenue vs margin vs net (framework — applied conditionally, not invented per-deal P&L)
Per directive §8, for any opportunity: **A** total client program value ≠ **B** ODG-accessible revenue (ODG
likely a specialist sub-scope or tooling+services layer, often 20–60% of A) ≠ **G** gross margin (A/B minus
**C** direct delivery + **E** partners/subcontractors + **F** infra/API/model/licence) ≠ **H** operating
result (minus **D** sales/support/maintenance/compliance/insurance) ≠ **net profit** (minus personnel + tax —
**NOT COMPUTABLE** without ODG legal form + fiscal regime). Three scenarios (prudent/central/favourable) must
tag every assumption (day rate, team size, duration, conversion, infra cost) with source/range; infra/API cost
is small vs labour and must never be mislabelled "net profit." No ROI/revenue guaranteed.

## PoC status (GATE §6)
**NOT RUN this pass** (deterministic local PoCs per opportunity = a separate build mission). The reusable
substrate already demonstrated locally (E2E governed mission 13/13, action-gate deny-by-default, evidence-
provenance, migrate-ts parity, FinOps cost-metering simulation, self-diagnostic) is the honest PoC starting
point; per-opportunity PoCs + test sets + one failure scenario each are specified but not yet executed.

## Certification caveat (O2/O3)
ODG prepares EVIDENCE + runs PRE-AUDIT/gap-detection + accompanies compliance — ODG is **NOT** an accredited
certification body and must never present as one. Official certification (ISO 42001, CRA conformity) is issued
by competent/accredited bodies; EU-AI-Act requirements/timing shifted (June-2026 Council delay, 11) and
ISO 42001 **alone does not satisfy** the AI Act (11) — verify current scope with official sources per engagement.

## Verdict
GATE D = **PARTIAL/QUALIFIED** — 10 evidence-linked private-sector candidates ≥€500k (plausible, MEDIUM
confidence, real sources), public-sector excluded, no fabrication. Firm qualification needs named buyers +
legal/fiscal identity + per-opportunity PoCs + the external accesses. Financials are conditional frameworks,
not quoted deals; no revenue/profit guaranteed.
