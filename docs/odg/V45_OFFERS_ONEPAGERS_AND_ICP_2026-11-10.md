# V45.2 — P3 / P11 offer one-pagers + ICP targets (preparation only)

> CTO V45.2 §7. **Preparation only — no contact, no publication, no commitment.** Prices are proposals to validate (3 real quotes). ODG maturity L2, €0 clients; offers sell demonstrated readiness, never certified compliance. ICP = ideal-customer profiles to target later, not leads to contact now.

## ONE-PAGER A — P3: "CRA / SBOM Readiness"
**Who it's for:** EU software/hardware-with-software product makers & editors who must meet the EU Cyber Resilience Act (24h vuln reporting from 2026-09-11; machine-readable SBOM + secure-by-design by 2027-12-11).
**The problem:** they ship products with 100s of open-source dependencies, no machine-readable SBOM, no component-level visibility — and the CRA clock is running.
**What ODG delivers (done-for-you):** a machine-readable SBOM (CycloneDX) of all dependencies, a license-policy audit (flags unknown/copyleft licenses fail-closed), a mapping to the CRA's dated obligations, and a PME-readable readiness report + optional CI gate. *(Demonstrated: 485-component SBOM, 56 unknown-license components surfaced, on a public repo.)*
**What it is NOT:** not CRA certification; the technical file, the 24h reporting process and CE marking stay the manufacturer's duty.
**Offers:** Entry €1.5–2.5k (one-off) · Pro €5–9k + €300–600/mo gate · Advanced €15–30k + €1–2.5k/mo.
**Why ODG:** tools (Snyk/Sonatype/Mend) are self-serve seats; ODG delivers the *outcome* for teams without the time/expertise.

## ONE-PAGER B — P11: "E-invoicing Validation & STP Readiness"
**Who it's for:** French businesses & their integrators under the B2B e-invoicing mandate (live 2026-09-01 for large/ETI + all-receive; SMEs 2027-09-01), plus ERP/accounting integrators.
**The problem:** plain PDF/paper invoices become invalid; every business must receive (and large ones issue) structured e-invoices via certified PDPs — and most lack validation/conformance tooling.
**What ODG delivers:** EN16931-core validation (mandatory fields + arithmetic BR-CO rules), round-trip-verified CII/UBL conformance, error/anomaly detection with a remediation playbook, STP routing design, and a PME-readable report. *(Demonstrated: valid invoice ⇒ PREPARED; arithmetic & missing-field errors ⇒ caught; XXE-safe parser; prepared≠sent human gate.)*
**What it is NOT:** not a certified Plateforme Agréée (PDP); the legal transmission stays owner/accredited-provider.
**Offers:** Entry €1.5–3k · Pro €8–15k + €500–1k/mo · Advanced €18–25k + €1–2k/mo.

## ICP — P3 (10 target profiles; do NOT contact)
1. EU IoT/hardware startup (10–50 emp) shipping connected devices.
2. Industrial-automation SME with embedded software.
3. Medical-device software editor (EU MDR + CRA overlap).
4. Mid-market SaaS editor selling to EU enterprises (supply-chain due-diligence pressure).
5. Automotive/mobility Tier-2 software supplier.
6. Open-source-heavy fintech building a product (license risk).
7. Smart-home / consumer-electronics brand.
8. Defense/critical-infra subcontractor (secure-by-design).
9. EU product distributor needing supplier SBOMs.
10. Dev-tools/API company wanting a CRA-ready badge for buyers.

## ICP — P11 (10 target profiles; do NOT contact)
1. French PME (20–100 emp) issuing many B2B invoices (ETI deadline passed 2026-09).
2. French micro/SME (2027-09 issuance deadline) needing receive+issue readiness.
3. ERP integrator / Dynamics-SAP-Odoo partner serving French SMEs.
4. Accounting firm (expert-comptable) digitizing client invoicing.
5. SaaS billing/invoicing editor adding Factur-X conformance.
6. E-commerce platform with French B2B sellers.
7. Facility-management / services company with high invoice volume.
8. Public-sector supplier (Chorus Pro B2G + B2B overlap).
9. Franchise network standardizing invoicing across outlets.
10. Fintech/payment provider adding e-invoice validation to its stack.

## Recurring-revenue model (both)
One-off audit/integration ⇒ convert ~30–50% to a **monthly gate/support** (€300–2,000/mo) ⇒ recurring base is what makes the €500k-net math feasible (see financial model). Renewal driver: the obligations are ongoing (new CVEs, new invoices), so continuous validation has durable value.

## Next prep steps (no contact)
1. Validate the 6 prices against 3 real public quotes each (desk research only).
2. Turn each one-pager into a reproducible demo on a **named public** repo / sample set.
3. Draft a discovery-call script + a scoping questionnaire (for when outreach is authorized).
