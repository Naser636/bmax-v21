# Pilot Offer Specification — "Software Evidence Pack" (Study V3, 2026-10-22)

A deliverable pilot built ONLY from demonstrated capability (own-repo + M1 controlled-fixture `CONTROLLED_FIXTURE_VERIFIED`, `f5cf850`). **Prices are ENVISAGED (hypothetical), confronted to sourced comparables — NOT validated by any buyer.** No buyer contacted. Selling requires: R2 (real consented repo) + R3 (human review) + liability/claim-wording in place.

## Offer: fixed-fee "Software Evidence Pack" (read-only diagnostic)
A bounded, read-only evidence pack on a single codebase: **SBOM (CycloneDX) + build-provenance attestation + licence/dependency-risk register + reproducibility/parity findings + a minimal tech-debt signal + a structured risk memo.** Maps to OPP-1 (tech due-diligence) and OPP-2/3 (SBOM/CRA readiness).

| Field | Specification |
|---|---|
| **Scope** | ONE repository / product; dependency + provenance + licence + reproducibility evidence; a written risk memo. |
| **Exclusions** | NOT a certification/compliance attestation; NOT a penetration test; NOT remediation (separate lot); NOT a security guarantee; no runtime/production access. |
| **Required inputs / client authorizations** | explicit written consent to read the repo (read-only clone); lockfile(s); build instructions (for reproducibility); named scope + exclusions; data-handling terms; NDA. |
| **Deliverables** | `sbom.cdx.json` (CycloneDX); signed provenance attestation (in-toto/SLSA L1 + mechanism; **L2 BLOCKED** — disclosed); licence/dependency-risk register (copyleft + unknown flagged); reproducibility/parity result; tech-debt signal; a human-reviewed risk memo (readiness language only). |
| **Acceptance criteria** | SBOM reconciles to the lockfile; provenance verifies (sig + digest + SBOM rebind; tamper-fail); outputs reproduce byte-stable; R3 reviewer ACCEPTs; no false-success symptom. |
| **Timeline / capacity** | 3–5 working days per pack; ODG+1 reviewer ≈ 2–4 packs/month (solo constraint). |
| **Direct costs (HYP)** | ODG compute/provider (low); **human-reviewer day(s)** (the main variable cost); support; (if contracted) insurance. |
| **Envisaged price (HYP, vs comparables)** | diagnostic €5–8k; standard 5-day pack €10–20k; deep €25–40k. Comparables (FACT): tech-DD light $5–15k / standard $15–40k / deep $40–150k+ (madewithlove, papermark, sparkletech 2026); SBOM tooling €399/mo–€1,500/yr (anchore, legalithm). ODG differentiator = reproducible evidence + provenance, human-reviewed — not a dashboard. |
| **Sale price vs validated price** | the above are ENVISAGED sell prices; **no buyer has validated any price** (none contacted). |
| **Risks / liability** | overclaim risk (must say "evidence/readiness", never "compliance/certification"); liability for deal-critical findings ⇒ needs liability wording + likely professional insurance; external-repo execution proven only on a synthetic fixture (M1) — **real-repo proof (R2) pending consent**; reviewer dependency (R3). |
| **Partner need** | solo-deliverable at low volume; volume/regulated/large clients ⇒ SI subcontract or OEM embed (Routes B/C) + the references/certs/insurance those require. |

## Upsell path (separate authorized lots, not in the pilot)
Evidence pack (land) → continuous assurance retainer (Model C, recurring) → remediation lot (Model B/E) → OEM embed (Model C scale). Each is a distinct offer with its own contract.

## Readiness to sell this offer
- **Capability:** demonstrated (own-repo + M1 fixture). **R2** (real repo) BLOCKED-consent; **R3** human review BLOCKED-reviewer; **liability/insurance** not in place; **references** 0.
- **Verdict:** the offer is *specifiable and deliverable in mechanism* today; it is **not yet sellable** until R2 + R3 + liability wording + a first reference (R4) exist. Envisaged pricing is a planning input, not a quote.
