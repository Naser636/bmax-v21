# Sovereign Tech Resilience / Liquid Reply — Partner-Route Dossier (Mission ODG_500K_SOVEREIGN_TECH_PARTNER_ROUTE, 2026-10-22)

Workstream stays **OPEN**. Verdict for this candidate: **does NOT pass the €500k ODG-addressable gate** — but it is the **best-shaped lead** of the sequence (exact domain match + a named partner whose mandate IS software supply-chain security). No contact, no spend, no private access, no code change, no commit. €10M fixed, unproven; revenue €0.

## Primary evidence (official sovereign.tech, WebFetch 2026-10-22)
- **Program:** Sovereign Tech Resilience (Sovereign Tech Agency, DE) — security services for critical FOSS **at no cost to the projects**; the Agency **pays the implementation partners**.
- **Software Supply Chain Security scope (exact):** "assessing build and release infrastructure such as CI/CD systems and package repositories, implementing reproducible builds, cryptographic signing and verification of release artifacts, working toward SLSA compliance at appropriate levels, and establishing secure dependency management." **Delivered by Liquid Reply.**
- **Partner selection:** "selected through **public procurement**"; paid **cost-reimbursement** ("pays the costs incurred").
- **Budget:** **NOT disclosed** (no figures on the program or supply-chain lot). **Framework term:** not disclosed. **Next CfT:** none announced (the framework CfT closed **2026-03-25**; partners already named: Badger Systems, Tweede golf, IAV, EY, Ada Logics, Liquid Reply, mgm, YesWeHack). **Subcontracting / tooling-vendor rights:** **not addressed** (unknown).

## Capability map — Liquid Reply supply-chain scope → ODG demonstrated
| Scope element | ODG capability | Evidence | Gap |
|---|---|---|---|
| SBOM (machine-readable components) | ✓ demonstrated | `odg-evidence-pack`, R2 npm/cli ×2 | — |
| Signing/verification of release artifacts | ✓ (in-toto/SLSA-**L1**, sign+verify+tamper) | R9-lite + R2 | **SLSA L2 BLOCKED** (self-signed only) |
| Secure dependency management / dependency risk | ✓ (licence/dependency-risk register) | R2 (incl. 934-unknown case) | no CVE/vuln data |
| Reproducible builds | **PARTIAL** (reproducible SBOM digest ✓) | R2 | **binary reproducible-build verification NOT demonstrated** |
| Assess CI/CD + package-repo infrastructure | **NO** | — | out of ODG scope (hands-on infra assessment) |
**Net:** ODG = a strong **evidence/SBOM/provenance tooling component** (~half of the documented supply-chain *tooling* surface), **not** the full hands-on service. Useful to Liquid Reply as embedded tooling/OEM, not as a replacement.

## €500k gate assessment (honest)
1. Real program/need: **YES** (primary-verified). 2. Documented total ≥€500k: **NO** — no budget figures disclosed; cannot confirm the supply-chain lot is ≥€500k. 3. **ODG-addressable ≥€500k: NO** — framework already awarded to Liquid Reply (direct entry closed); subcontracting rights unknown; ODG's sub-scope is undetermined/speculative; **cost-reimbursement** model means a tooling sub is reimbursed at cost, structurally limiting ODG revenue; stacking per-project fees to reach €500k would be arbitrary (forbidden §3). 4. Route: sub/OEM to Liquid Reply **only if** they subcontract tooling (unknown) and want ODG (not assumed) + a comms channel (absent). 5. Gaps: SLSA L2, CI/CD-infra assessment, binary reproducible-build verification; plus partner agreement + (German-gov) eligibility for the prime. 6. Cost/margin: cost-reimbursement → low ODG margin; not €500k-addressable on evidence.
**⇒ Class B/C LEAD, NOT a qualifying €500k opportunity.** A hypothetical partner ≠ an acquired partnership (§criterion).

## Real-code (this lot)
No new run — `odg-evidence-pack` + R2 already prove the SBOM/provenance/dependency/reproducible-digest elements that match Liquid Reply's scope; the gaps (SLSA L2, CI/CD assessment, binary reproducible builds) are implementation lots, not demonstrable by another public-repo run. No task invented (§6). The pack is demo-ready for a partner conversation.

## Ready-to-send message (UNSENT — no authorized channel; do not send without authorization)
To Liquid Reply (software supply-chain partner, Sovereign Tech Resilience):
> "We maintain a reproducible, provenance-bound software-evidence engine — CycloneDX SBOM + in-toto/SLSA-L1 signing & verification (tamper-evident) + licence/dependency-risk — proven on pinned public OSS (npm/cli). As you deliver supply-chain-security services under Sovereign Tech Resilience, would an embedded tooling / OEM component that auto-generates auditable SBOM+provenance+licence evidence per project be useful to your delivery? We make no SLSA-L2/compliance/certification claims; this is evidence/readiness tooling. Open to a short exploratory technical call." — **UNSENT.**

## Next bounded action (workstream OPEN)
Public tenders remain base-rate ≈0 for ODG-specific ≥€500k; this Sovereign Tech route is a **partner/OEM lead, not a qualifying opp**. Next: (a) **when a comms channel is authorized**, a human sends the Liquid Reply message to test whether a tooling-sub/OEM scope could reach meaningful recurring revenue (and whether multi-project/multi-partner aggregation could plausibly approach €500k — to be evidenced, not assumed); (b) monitor for the **next Sovereign Tech Resilience CfT** (framework renewal) where ODG could bid the supply-chain tooling lot (needs eligibility + references); (c) continue the private/OEM assurance-program search in parallel. Keep `odg-evidence-pack` demo-ready. **Do not close; do not fabricate a partnership or a €500k scope.**
