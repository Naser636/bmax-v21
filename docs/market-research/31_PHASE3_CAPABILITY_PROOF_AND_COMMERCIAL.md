# Phase-3 Capability Proof + Phase-4 Commercial Deliverable (Mission ODG_GLOBAL_ENTERPRISE_100K_500K_END_TO_END, 2026-10-22)

Workstream **OPEN**. Executes a concrete deliverable slice for the selected opportunity type and maps ODG's real capability to its acceptance criteria. No contact, no spend, no private access. €10M fixed, unproven; revenue €0.

## Opportunity selection (evidence-based, not preference)
Across all prior lots, **no single primary-verified ≥€500k ODG-ADDRESSABLE lot exists** (public-tender base rate ≈0; general app-dev lots are not ODG-deliverable). The best-fit, primary-verified NEED that matches ODG's demonstrated deliverable is **software-supply-chain assurance** — concretely the Sovereign Tech Resilience "Software Supply Chain Security" scope (delivered by Liquid Reply; doc `29`) + private CRA-readiness. Selected as the Phase-3 capability-proof target because its acceptance criteria are publicly documented and map directly to ODG's engine.

## Phase-3 — acceptance criteria → ODG capability map
Criteria (from sovereign.tech supply-chain scope): SBOM · signing/verification of **release artifacts** · reproducible builds · secure dependency management · SLSA · assess CI/CD + package repos.
| Acceptance criterion | ODG status | Evidence (executed) |
|---|---|---|
| SBOM (CycloneDX) | **COVERED** | `odg-evidence-pack` on real npm/cli v10.9.0 (1318 comps, reconciled) + v9.9.4 |
| **Verification of release artifacts (crypto hash vs published)** | **COVERED (NEW, this lot)** | `verifyArtifactIntegrity` committed `32281d3`; proven on REAL left-pad@1.3.0 vs npm `dist.integrity` (sha512) ⇒ ok; tamper ⇒ mismatch; hermetic tests 4/4 |
| Signing/verification of attestations | **COVERED (L1)** | in-toto/SLSA-L1 sign+verify+tamper (R9-lite/R2) |
| Secure dependency management / licence risk | **COVERED** | licence/dependency-risk register (incl. 934-unknown honest case) |
| Reproducible builds | **PARTIAL** | reproducible SBOM digest ✓; **binary reproducible-build verification MISSING** |
| SLSA compliance "at appropriate levels" | **PARTIAL** | L1 ✓; **L2 BLOCKED** (no managed/keyless signing) |
| Assess CI/CD + package-repo infrastructure | **MISSING** | out of ODG scope (hands-on infra assessment) |
**Net: ODG now COVERS 4 of the core supply-chain criteria end-to-end** (SBOM, artifact-integrity verification, L1 attestation, dependency/licence), PARTIAL on reproducible-builds/SLSA, MISSING CI/CD-infra assessment. This is a materially stronger, executed capability than prior lots.

## Phase-3 — executed slice (real data, independently verifiable)
**Slice:** "verify a published release artifact against the registry's own integrity hash + detect tamper."
- Fetched REAL npm metadata + tarball: `left-pad@1.3.0` (3619 bytes), published `dist.integrity = sha512-XI5MPzVNApjAyhQzphX8BkmKsKUxD4LdyK24iZeQGinBN9yTQT3bFlCBy/aVx2HrNcqQGsdot8ghrjyrvMCoEA==`, `dist.shasum(sha1) = 5b8a3a7765dfe001261dde915589e782f8c94d1e`.
- `verifyArtifactIntegrity(tarballBytes, dist.integrity)` ⇒ **ok:true (sha512)**; sha1 shasum also matches; **1-byte tamper ⇒ ok:false** (fail-closed). Ran via the built **dist** bin (real data) + hermetic unit tests (4/4) + tsc 0 + supply-chain-attest regression green.
- **Independent verification:** anyone can re-fetch `https://registry.npmjs.org/left-pad/1.3.0`, re-hash the tarball, and reproduce the match — the proof is not self-asserted. Not a declared PASS; a reproducible real-data result.
- **Failure/recovery tested:** tamper ⇒ mismatch; unrecognised integrity format ⇒ ok:false; mismatch reason surfaced.
- **Limits:** evidence/readiness only; npm ecosystem; SLSA L1; no binary-reproducible-build; no CI/CD assessment; a public artifact is technical evidence, NOT a client validation (R4).

## Phase-4 — commercial case (honest)
- **Buyer/program + source:** Sovereign Tech Resilience / Liquid Reply (supply-chain partner) — sovereign.tech/programs/resilience (doc `29`); plus private EU software vendors with CRA-readiness need.
- **Total value / ODG-addressable / confidence:** program budget **undisclosed** (FACT); **ODG-addressable ≥€500k NOT established** (framework awarded; sub-scope speculative; cost-reimbursement). ODG portion per engagement likely **< €100k**; €500k needs recurring/multi-engagement aggregation — **HYPOTHESIS, not acquired**. Confidence: LOW (unproven demand/partner).
- **Eligibility/deadlines/obstacles:** framework CfT closed 2026-03-25 (next unknown); subcontracting rights unknown; comms channel absent; no references (R4).
- **Value prop / scope / acceptance:** a reproducible, tamper-evident **software-evidence pack** (SBOM + artifact-integrity verification + L1 provenance + licence/dependency risk + report) per project/release; acceptance = pack reproduces + reviewer (R3) accepts.
- **Price / costs:** envisaged €5–40k/engagement (vs comparables); costs = ODG compute + reviewer day; **not buyer-validated**.
- **Recurring model (HYPOTHESIS, not revenue):** per-release/per-project recurring evidence generation (best ODG-leverage) — unproven; signed/recognized/collected = €0.
- **End-to-end evidence:** the pack + artifact-verification are now executed end-to-end on real public data (above). Gaps remain (SLSA L2, CI/CD assessment, binary reproducible builds, references).
- **Next authorized commercial action:** on an authorized comms channel (absent), a human sends the Liquid Reply / CRA-readiness message (`22 §C`/`29`); ODG then runs a consented pilot → R4.

## Status
Phase-3 capability proof **executed + independently reproducible** (artifact-integrity on real left-pad); ODG now covers 4 core supply-chain criteria end-to-end. **€500k ODG-addressable gate still NOT met** (opportunity-side), so workstream = **OPEN / PARTIAL_WITH_EXPLICIT_BLOCKERS** (blockers: comms channel, partner interest, framework closed, SLSA-L2/CI-CD/reproducible-build gaps, references). Not closed; nothing fabricated.
