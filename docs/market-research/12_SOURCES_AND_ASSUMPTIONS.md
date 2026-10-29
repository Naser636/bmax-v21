# Sources, Assumptions & Autonomy Accounting (Study V3, 2026-10-22)

## 1. V3 sources (consulted 2026-10-22 via provider WebSearch; ODG autonomous egress BLOCKED)
- Enterprise framework / IDIQ / EA (scale ceiling): oracle.com/news/announcement/us-department-of-war-...-esi-2026-07-23 (DoW ESI 10-yr IDIQ $3.31B/5yr, $6.99B w/ options) · army.mil/article/291074 (Army enterprise consolidation) · sirion.ai/library/contracts/enterprise-service-agreement/ · acquisition.gov/dfars/subpart-208.74 (ESA structure)
- OEM / white-label revenue-share: getmonetizely.com/articles/white-label-amp-oem-deals-... (licensor 20–35%; source-code 10–20%) · licensesaas.com/blog/how-to-price-a-white-label-saas-license-2026-guide (hybrid fixed+revshare 23%→41% 2019–2023)
- SI partner-program requirements: magentrix.com/blog/cybersecurity-partner-programs-complete-guide · smartsheet.com/partners/system-integrator (≥2 certs + 2 customer references) · literature.rockwellautomation.com/.../sysint-br003 (points-based, revenue thresholds, NDA)
- (V2 anchors still valid — `07 §5`: MSSP ACV $300k–1.2M, median MSP ARR $2.8M; SI margins 20–40%, integration GM 55–65%; supply-chain-sec $5.53B→$10.1B, Snyk >$100M ARR; dev-tool SaaS pricing. V1 anchors — `03`: tech-DD $10–150k, CRA SBOM 2027-12-11, ISO 42001 $85–650k, modernization $150k–2M+, QA managed $15–50k/mo.)
> All secondary sources are displayed prices / analyst estimates / published award notices — NOT ODG contracts. Cross-checked across ≥2 sources per theme where possible. No primary SBOM/audit *attribution amount* independently extracted (BOAMP/UGAP channel confirmed in V1; remains a next-validation).

## 2. Assumptions & unknowns (register)
| Item | Type | Status | Evidence needed |
|---|---|---|---|
| Any partner adopts/embeds ODG | HYP | **UNCONFIRMED** (no contact) | authorized outreach + a signed framework (future) |
| ODG runs evidence pack on external repos | gap | **UNPROVEN** (own-repo only) | R2 controlled-fixture then consented real repo |
| ODG meets SI/OEM program entry (≥2 refs, certs) | gap | **NOT MET** (0 refs) | R4 references + certifications |
| Diagnostic→paid conversion | HYP | **NOT_MEASURABLE** | real outreach results |
| $10M/Y1 feasibility | structural | **ASSESSED: NOT feasible Y1** (needs pre-existing large channel + funding) | a committed large OEM/SI partner + funding |
| Reviewer availability/cost, insurance, certs | cost-gap | UNKNOWN | quotes when operational |
| Recurring churn/retention | HYP | NOT_MEASURABLE | post-first-client data |
| Primary-source award amounts | FACT-gap | NOT RETRIEVED | BOAMP/UGAP direct |

## 3. Autonomy & execution accounting (§10 — evidence-based)
| Task | Performed by | Note |
|---|---|---|
| Source discovery + traceability | **provider (Claude Code) WebSearch**, ODG-directed | ODG autonomous egress BLOCKED (`a.test`) — NOT claimed autonomous |
| Evidence extraction + cross-checking | ODG (orchestrator) | FACT vs HYP separated; contradictions flagged |
| Capability inventory (repo-graded) | ODG + provider read-only inspection | skeptical grading from code/tests |
| Financial modelling | ODG | explicit equations + sensitivity + NOT_MEASURABLE |
| Contradiction detection | ODG | e.g. ISO42001≠AI-Act; market-size≠ODG-share; $10M-math≠feasibility |
| Mission selection + contract formation | ODG | R1B + V3 contracts authored |
| Test execution + independent verification | provider (R1 engineering), ODG orchestrated | R1 reproduction/lock/A3/equivalence |
| Boussole updates + continuity | ODG | canonical pointer maintained |
| Failed ops / blockers | logged | egress BLOCKED; external-repo consent BLOCKED; partner interest NOT contacted |
**Autonomy caveat:** G10 fleet-wide autonomy stays **NOT_MEASURABLE**; one successful research/engineering cycle does NOT inflate it. ODG drove orchestration/analysis/modelling; the provider executed network I/O and R1 engineering under ODG's contracts.

## 4. V3 mission report
- **Truth Lock:** entry HEAD `7a19e35`; after the R1B register-reconcile commit **`7046965` == origin/main, 0↔0**; 5 stashes preserved; V1/V2 research docs preserved uncommitted; V3 docs `08–12` produced (uncommitted, documentary). No code/system/production change beyond the authorized register-doc commit. Active missions untouched.
- **Committed (authorized, §4):** `7046965` — register DEF-GAMMA → RESOLVED + contract `R1B_REGISTER_RECONCILE_DEF_GAMMA.json`. R1 register/mission-record/compass now agree.
- **Produced (uncommitted):** `08_10M_ENTERPRISE_STRATEGY`, `09_ENTERPRISE_PARTNER_LONG_LIST`, `10_12_MONTH_FINANCIAL_MODEL`, `11_DELIVERY_READINESS_AND_CRITICAL_PATH`, `12_…` (this) + boussole update.
- **Results:** $10M routes modelled with arithmetic + feasibility; strongest-evidence route = C (OEM/embed) with B (subcontract) for first revenue; partner longlist (public, uncontacted, no fabricated interest); critical path R1✓→R2(blocked-consent)→R3→R4; $1M credible Y1 target, $10M = Y2–3 channel outcome (NOT Y1-feasible).
- **Status:** `PARTIAL` — strategy/model/longlist/critical-path delivered on evidence; demand/partner-adoption/external-repo proof remain BLOCKED/UNVERIFIED. No commercial outreach, no third-party repo access, no fabricated interest or reference.
- **Next action (NOT executed):** R2-prep — build the controlled external-style fixture + run the evidence-pack harness on it (internal, authorized engineering; NOT a client validation), to de-risk R2 before consent; then pursue consent for a real external repo (R2) → R4 first reference. Partner outreach (Routes B/C) needs separate authorization.
