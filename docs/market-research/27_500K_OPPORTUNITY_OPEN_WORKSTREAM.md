# €500k ODG-Addressable Opportunity — OPEN Workstream (Mission ODG_PROVE_500K_REAL_CODE_OPPORTUNITY, 2026-10-22)

**STATUS: `OPEN — €500K OPPORTUNITY NOT YET VERIFIED`.** No primary-verified opportunity with an **ODG-addressable** scope ≥ €500,000 has been established yet. Not fabricated. €10M fixed, unproven; revenue €0. No contact, no spend, no private access, no code change this cycle.

## 1. FDIC benchmark (reference only — NOT a current ODG opportunity)
`CORHQ-26-R-0394`, FDIC "Software Supply Chain Security Solution" (sam.gov). **EXPIRED** for ODG: proposals due 2026-10-09, inactive 2026-10-24 (today 2026-10-22). **US federal** (SAM registration + US eligibility ODG lacks). Requires a Software-Supply-Chain Container worksheet + Pre-Award SCRM spreadsheet — a **whole-solution** procurement, not a bounded pack. sam.gov opp pages are an SPA ⇒ **not WebFetch-able** (primary verification of SAM opps needs the SAM API or a human). 
- **Capability map (FDIC-class requirements → ODG):** SBOM generation ✓ (`odg-evidence-pack`), provenance/attestation ✓ (SLSA-L1), licence/dependency risk ✓; **NOT covered:** container-image scanning, continuous-monitoring platform, SCRM questionnaire workflow, FedRAMP, enterprise integrations, SLSA L2. ⇒ **ODG = a component of a supply-chain-security solution, not the prime.** Refines acceptance criteria: ODG sells the *evidence/SBOM/provenance* layer, sub/OEM to a solution prime.

## 2. Candidate ledger (this lot) — qualified / lead / rejected
Gate (§5) requires ALL: real buyer · primary source · ≥€500k **ODG-addressable** · valid future deadline · ODG-capability fit · feasible delivery route · explicit gaps · next step.
| Candidate | Primary source | Total value | Status/deadline | ODG-addressable ≥€500k? | Verdict |
|---|---|---|---|---|---|
| FDIC CORHQ-26-R-0394 | sam.gov (SPA, search-confirmed) | solution procurement | **EXPIRED** (inactive 2026-10-24); US-fed | No (whole-solution, US-eligibility) | **REJECTED (benchmark)** |
| Teagasc 9239900 (prior) | etenders.gov.ie (verified) | €5.95M/108mo (3 lots) | OPEN →2026-11-19 | No — ODG web-dev-incapable; assurance sub-scope << €500k | **LEAD (B, partner)** — not qualifying |
| UK TSSF — Technology Services Specialist Framework, **Lot 9 Managed Services (Testing/QA)** | find-tender.service.gov.uk/Notice/003861-2026 | framework (multi-supplier, 3yr+ext) | needs primary verify | **UNDETERMINED** — framework place ≠ revenue; call-offs could exceed €500k over term but eligibility-gated | **LEAD (B/C)** — verify lot value + eligibility |
| UK Strategic IT Services Framework, **Lot 2A cyber assurance/testing/compliance** | find-tender.service.gov.uk/Notice/063387-2026 | framework | needs primary verify | UNDETERMINED (same framework caveat) | **LEAD (B/C)** |
| EIB CFT-1747 IT Security HW/SW | find-tender (063…/071347) | **€35M/4yr max envelope** | multi-operator framework | No — envelope ≠ ODG revenue; HW/SW reseller-shaped | **LEAD / mostly D** |
| ENISA Cybersecurity Reserve (MSSP) | ec.europa.eu funding-tenders | managed security reserve | needs primary verify | UNDETERMINED — MSSP reserve, partner-shaped | **LEAD (B)** |

**No row meets the €500k ODG-addressable gate.** The frameworks are the right *shape* (QA/assurance lots) but a framework place ≠ revenue, the envelope ≠ ODG-addressable, and ODG lacks the references/scale/eligibility to hold a place solo.

## 3. The precise evidence gap (why not yet verified)
ODG's **demonstrated single deliverable** is a bounded evidence pack (~€5–40k via `odg-evidence-pack`). **€500k ODG-addressable** requires one of: (a) a **multi-year recurring assurance program / repeated framework call-offs** (≥€500k to ODG over term), (b) a **productized/OEM licence** deal, or (c) ODG as a **qualified prime** — each blocked by: framework/bid eligibility (references ≥2, certifications, insurance, min-revenue, local entity), delivery capacity, and (for US) SAM/eligibility. **None primary-verified as ODG-addressable ≥€500k yet.** Also: primary-source value/eligibility for the UK/EU framework lots is not yet confirmed (find-tender/TED pages need direct notice-level fetch or API — aggregator snippets are not final proof).

## 4. Real-code proof (this lot)
No new run — the FDIC-class capability map is doc-level, and `odg-evidence-pack` (R9-lite) + R2 (npm/cli ×2) already prove the SBOM/provenance/licence-risk layer that FDIC-class requirements need. A buyer/partner-authorized repo run is available on consent. No task invented; no green test re-run without reason (§6).

## 5. Next bounded action (continue OPEN — do not close)
1. **Primary-verify the strongest framework lead** (UK TSSF Lot 9 Testing/QA — `find-tender…/003861-2026`): fetch the notice-level documents to confirm the lot's value band, term, eligibility (references/certs/insurance/min-turnover), and whether an **assurance-evidence call-off stream could realistically reach €500k to ODG over the term** (direct place vs via a framework-holder partner). (Find-a-Tender notice pages / the Find-a-Tender + TED APIs; may need human/API for full docs.)
2. In parallel, identify a **private enterprise / OEM** program where ODG's *whole* engagement is the assurance layer (so ODG-addressable can reach €500k without a prime) — e.g., a multi-year assurance retainer or an OEM licence at scale.
3. Keep `odg-evidence-pack` ready; run on a consented buyer/partner repo when available.
**Do not close:** record checkpoint, continue from here next lot.
