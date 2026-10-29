# Delivery Readiness & Critical Path (Study V3, 2026-10-22)

Maps the technical prerequisites to the commercial models and defines the dependency-aware critical path. A defect is listed as blocking ONLY the models that actually depend on it (not "fix everything first").

## Prerequisite status
| ID | Prerequisite | Status | Gates which model(s) | Evidence / note |
|---|---|---|---|---|
| **R1** | DEF-GAMMA false-success closed | **VERIFIED_COMPLETE** (@7a19e35) | any assurance sale (C/D/B/E) | validation-engine gate + lock test; register reconciled (@7046965). Scope: GAMMA class only, opt-in signal. |
| **R2** | External-repo evidence-pack proof | **BLOCKED_BY_DEPENDENCY** (owner consent) | B, C, D, E (all client-repo work) | engine proven on ODG's own repo only; see R2 protocol below |
| **R3** | Independent human review + sign-off | **DEFINED, not staffed** | all (liability/credibility) | checklist below |
| **R4** | First accepted external reference | **NOT STARTED** (needs R2+R3+consent) | SI/OEM program entry (needs ≥2 refs), all sales | a real, consented, *accepted* engagement — not claimable before it exists |
| G-AUTH | governance-kernel `authorityEnforced:false` | OPEN | only an "enforced-governance" *product* claim; does NOT gate diagnostics/evidence sales | fix if selling governance-enforcement; not on the $1M critical path |
| G-STALE | 3/6 consequential-executor evidence stale | OPEN | consequential-executor *delivery* claims | diagnostics (observational) unaffected |
| G-SLSA | SLSA L2 signing BLOCKED | OPEN | strengthens Route C supply-chain OEM; not required for SBOM/readiness diagnostics | self-signed L1 today |
| G8 | reboot/recovery | BLOCKED_BY_DEPENDENCY (host/human) | a "resilient managed-service" SLA claim (Route D) | prepare only; host-gated |
| G10 | live fleet autonomy measurement | NOT_MEASURABLE | an "autonomous delivery" marketing claim — **do not make it** | mechanism proven on 1 isolated unit only |
| EGRESS | autonomous web egress | BLOCKED (`a.test`) | an "ODG does its own market/recon research" claim | research runs via bounded provider |

**Critical-path insight:** the **$1M path depends only on R1(done)→R2→R3→R4** (+ capacity + partners). G-AUTH/G-STALE/G-SLSA/G8/G10/EGRESS do **not** block the first revenue; they gate specific *premium claims* and are deferred to the models that need them. Do not block commercialization on them.

## R2 — external-repo proof protocol (prepared; real proof BLOCKED on consent)
**Real third-party repo access is BLOCKED_BY_DEPENDENCY — no owner consent exists; none invented; no private repo will be accessed without explicit written authorization.** Prepared so execution is immediate once consent exists:
- **Consent checklist (must ALL hold before any access):** written owner authorization naming the repo + scope; read-only clone permission; data-handling/retention terms; permitted-tools list; deliverable + liability wording agreed; expiry.
- **Repeatable test protocol:** clone (read-only) → SBOM (CycloneDX) → provenance stamp → licence/dependency-risk extract → build-reproducibility/parity check (where a build exists) → debt/hotspot scan → structured risk memo. All outputs runtime-owned; no mutation of the target.
- **Controlled external-style fixture (internal, authorized):** a throwaway non-ODG-structured git repo (different lockfile/layout) to prove the harness generalizes beyond ODG's own tree — this is the next R2-prep engineering lot; **it is explicitly NOT a client validation** (mandate §5).
- **Reproducible acceptance harness:** the pack must regenerate byte-stable (modulo volatile timestamps) and a reviewer must be able to re-run it. Acceptance = pack reproduced + reviewer-validated on the fixture; then (on consent) on a real repo.

## R3 — independent review (defined)
- **Independence:** reviewer not the author of the evidence (human, or a separate ODG instance for the mechanical layer + a human for the opinion). 
- **Checklist:** SBOM completeness vs lockfile; licence findings correctness; reproducibility claim holds; risk severities justified; no overclaim ("readiness/evidence", never "compliance/certification").
- **Severity handling + acceptance rules:** blockers must be resolved or explicitly accepted by the reviewer before sign-off. **No reviewer sign-off is fabricated.**

## R4 — first accepted reference (defined)
Qualifies as an accepted reference ONLY when a real, authorized, bounded engagement is delivered AND the client formally accepts it. Until then, no "reference customer" claim is made.

## Readiness verdict
- **Ready now:** own-repo evidence generation; DEF-GAMMA-safe validation.
- **Ready on consent:** external-repo proof (protocol+harness prepared).
- **Not ready / gated:** at-scale autonomous delivery (G10), resilient-SLA (G8), governance-enforcement product (G-AUTH), SLSA-L2 supply-chain OEM (G-SLSA). None blocks the $1M first-revenue path.
