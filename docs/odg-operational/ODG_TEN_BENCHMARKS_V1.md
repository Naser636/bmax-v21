# ODG Ten Professions — R0–R5 Maturity Benchmarks (V1)

**CTO Master Campaign V2, Phase 10.** Date **2026-11-01**. Independent-style maturity evaluation of the ten professions on the **R0–R5 ladder**, grounded in the actually-performed validation of record (`WAVE6_INDEPENDENT_EVALUATION_V1.md`: separate-context adversarial validation + mutation testing + full green regression on every G-01…G-08 lot). **"Cannot verify" is scored as a gap, not a pass. No profession is R4+ (ODG has €0 clients and no authorized external case). No benchmark against a named external product was run — none is implied here.**

## Ladder definition (preserved from the mandate)
- **R0** concept / identified only
- **R1** identified + specified (no working artifact, or artifact is advisory-only)
- **R2** built in-repo, demonstrable on **synthetic** data
- **R3** **reproducible** on ODG's own repo (merged + independently validated + green regression)
- **R4** reproducible on an **external authorized case** (real third-party input) — **owner-gated, none reached**
- **R5** reproducible **operational** results with external references — **none reached**

## Per-profession benchmark
| Profession | R-level | Evidence FOR (what makes it this level) | Ceiling / what is NOT proven | Raise-to-R4 requires (owner-gated) |
|---|---|---|---|---|
| **P1** Software/Modernization | **R3** | G-01 merged + independently validated (zero-entry fail-closed guard added); mutation-tested; green regression | no external legacy-estate case | an authorized client legacy codebase |
| **P2** AI/Agentic governance | **R3** | third-party-agent-gate + G-02 + G-07 merged/validated; G-07 honestly measured 0.25 k-eval resistance | no live third-party agent; resistance gap is real | an authorized agent + labelled adversarial set |
| **P3** Cybersecurity/CRA | **R3** | sbom-audit-service/license-policy/supply-chain-attest + G-05 + G-08 merged/validated; G-08 double-guard caught planted SATISFIED | no external vendor SBOM case; ODG finds-not (no vuln-finding) | an authorized vendor product + CRA submission |
| **P4** Data engineering | **R2–R3** | G-04 merged/validated; injected-defect fixtures reproducible | fairness/real-data = NO_DATA (OG-03); assertionType not in SARIF | an independently-labelled external dataset |
| **P5** Cloud/Platform (IDP) | **R1** | G-05 evidence slice only | **NO complete IDP (O8 spec-only)** — advisory only | building (owner-scoped) + an authorized platform |
| **P6** Quality/eval-integrity | **R3** | reality-gate/mechanical-acceptance/k-eval/G-01/G-03/G-07 merged/validated — deepest capability | broad-IT success = NO_DATA; synthetic cases only | an authorized external test corpus |
| **P7** SRE/reliability | **R2–R3** | slo-* (PREPARE-not-APPLY) + G-06 (denominator-explicit) merged/validated | DORA keys null until provenanced baseline; synthetic SLO runs | an authorized production telemetry baseline |
| **P8** API/e-invoice | **R2–R3** | einvoice-* round-trip + commercial-pipeline (stage-separated) merged/validated | no live PDP connector; conformance on synthetic invoices | an authorized PDP + real invoice flow |
| **P9** FinOps | **R2–R3** | unit-economics (Peterson anchor) + economic-extractor + ALLOCATOR merged/validated | FOCUS = honest non-goal; own-repo usage only | authorized cloud-billing data |
| **P10** Regulatory/assurance | **R2–R3** | ai-act-role-classifier + iso-* + regulatory-assurance + G-08 merged/validated; O3 matrix byte-identical 10/10 | 0 clauses SATISFIED (by design); NOT a cert body | an authorized audit engagement (evidence, not cert) |

## Aggregate (honest)
- **R3:** P1, P2, P3, P6 (4). **R2–R3:** P4, P7, P8, P9, P10 (5). **R1:** P5 (1). **R4+:** none.
- **Validation of record is real:** a separate-context validator rejected a genuine defect earlier in the campaign (audit-log #326, one REJECT→fix→ACCEPT on a NUL regression) — the independence is demonstrated, not asserted.
- **The honest frontier to R4 is uniformly owner-gated:** every R4 raise needs an *authorized external input* (client codebase, vendor product, labelled dataset, production telemetry, PDP, billing data, audit engagement) ODG cannot obtain autonomously. This is the same ceiling enumerated in `WAVE6_INDEPENDENT_EVALUATION_V1.md §6` and `CAPABILITY_GAP_REGISTER_V1.md §B` (OG-01…OG-08).
- **What would be dishonest and is refused:** scoring any profession R4+ on synthetic evidence; claiming a competitor benchmark that wasn't run; upgrading P5 above R1; reporting NO_DATA as a pass.

## Acceptance (Phase 10)
Ten professions scored on R0–R5 with evidence-for + ceiling + raise-path each ✓ · grounded in the real Wave-6 validation (mutation-tested, green regression, one genuine REJECT) ✓ · none R4+ ✓ · P5 R1 preserved ✓ · cannot-verify scored as gap ✓ · no fabricated benchmark or superiority ✓ · R4 frontier mapped to owner-gated OG-01…OG-08 ✓. **Next: Phases 8/9/11/12 → accelerated execution plan, blockers, canonical master, governed rules, closure.**
