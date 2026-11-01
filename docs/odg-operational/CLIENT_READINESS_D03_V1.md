# Client-Readiness Dossier — D03: Cybersecurity, AppSec & Software Supply-Chain Security (V1)

**Wave 5, CTO Master Unified Mandate.** Date **2026-11-01**. Instantiates the A–S structure (`CLIENT_READINESS_D05_V1.md`). **Honesty posture (binding):** internal/researched/implemented only — **R2 overall, R3 on independently-validated components; NO R4/R5; €0 clients; no fabricated testimonial/case-study/SLA/certification; ODG price = HYPOTHESIS only.** Grounded in merged `MARKET_DOSSIER_D03_V1.md`, `EXPERT_SYNTHESIS_D03_V1.md`, matrix, real modules (`sbom-audit-service`, `license-policy`, `evidence-provenance`, `third-party-agent-gate`, `supply-chain-attest`, `compliance-evidence-pack`, bubblewrap confinement, Wave-4 G-05 `golden-path-evidence-bundle`, G-08 `evidence-pack-export`). **ODG D03 identity = reproducible, provenance-stamped supply-chain *evidence*, fail-closed, regulation-mapped — NOT vulnerability scanning.** No new primitive.

## A. Professional identity & scope
A **supply-chain evidence-readiness service**: read real manifests → reproducible CycloneDX SBOM + per-component SPDX license verdict + tamper-evident provenance, mapped to CRA tech-doc + NIS2 vuln-handling, with an explicit gap list. IN: multi-ecosystem SBOM, license-policy audit (fail-closed), provenance stamping, release-drift monitoring, agent-supply-chain (ASI04) admission, regulation mapping. OUT (NON_GOAL, declared-not-performed): CVE/vulnerability scanning (no NVD/OSV — the core SCA feature ODG does NOT do); SAST/DAST/fuzzing; container/IaC/OS-package; live CI/CD. **Not a certifier/notified body.** Manifest-only. A complement to an SCA scanner, never a replacement.

## B. Target customer & buyer profile
(Market dossier §3; demand signal by regulatory exposure, not confirmed buyers.) EU "products with digital elements" (direct CRA subjects) HIGH; NIS2 FR essential/important entities (ANSSI ~15–18k, ~30× NIS1) HIGH exposure/MED spend; EU B2B SaaS SMEs upmarket; startups in funding/M&A DD. Persona: product-security/compliance owner facing a CRA/NIS2 deadline who must produce defensible evidence. Plausible fit [INFERENCE]: deadline-exposed SME/mid-market newly in scope (large enterprises already run SCA in-house). **No buyer verified; WTP is INFERENCE.**

## C. Problems solved & measurable outcomes
"We need an auditor-ready SBOM + license evidence pack for CRA tech-doc"; "NIS2 is about to apply in FR and we can't show defensible supply-chain evidence"; "OSS *finds* issues but doesn't produce a provenance-stamped, regulation-mapped artifact." Outcomes on the client's manifests: SBOM completeness; license-decision coverage (**UNKNOWN never assumed safe — target 0 silent-pass**); provenance-stamp coverage; byte-reproducibility across two clean runs; regulation-mapping coverage. Evidence-graded, not certification, **no vuln-coverage claim** (empty by design).

## D. Service catalogue & exclusions
1. **CRA/NIS2 Supply-Chain Evidence Readiness Pack** (§9, fixed-scope 5–10d) — reproducible multi-ecosystem CycloneDX SBOM + license audit + provenance, mapped to CRA tech-doc + NIS2 Impl. Reg. 2024/2690, with the explicit gap list (incl. CVE-scan gap + recommended NVD/OSV pairing). 2. **SBOM + license-drift monitoring (recurring, D03-B)** — regenerate + diff + per-component verdict per release. 3. **Agent-supply-chain (ASI04) admission check** (third-party-agent-gate). Exclusions: no CVE/vuln scan, no SAST/DAST/fuzz, no container/IaC, no certification, no live CI/CD build-out.

## E. Discovery, intake & diagnostic process
Client supplies (read-only, no-egress where possible): real manifests/lockfiles, target regulation(s), any existing license policy. Diagnostic: detect manifests across the 8 ecosystems; classify measurable vs `NO_MANIFEST` (never an empty "clean" SBOM); map coverage vs OWASP **SCVS**; state the threat model + explicit non-coverage up front (Schneier axis).

## F. Delivery methodology & technical architecture
Synthesis spine *economics→threat-model→inventory→policy→provenance→honest-boundary* → real modules: inventory → `sbom-audit-service` (CycloneDX, 8 ecosystems via `supply-chain-attest.buildSbomMulti`; `NO_MANIFEST` when none); policy gate → `license-policy` (SPDX-informed, **fail-closed** UNKNOWN→flagged never assumed safe); provenance → `evidence-provenance` (sourceCommit+sha256, SLSA/in-toto/SSDF binding *principle*; keyed-HMAC available; keyless tamper-*evident* not tamper-proof); evidence-chain integrity → audit-log keyed-HMAC + tip-anchor (#326); untrusted-build isolation → bubblewrap (net-off/env-cleared); ASI04 → `third-party-agent-gate`; bundle/assembly → **G-05 `golden-path-evidence-bundle`** (seals SBOM+confinement+health; INCOMPLETE_BUNDLE on missing inputs; `attested` only when all dimensions honestly pass); machine-readable handoff → **G-08 `evidence-pack-export`** (OSCAL-interop shape, `oscalNative:false`, never upgrades GAP/NOT_ASSESSED to a pass); **vuln finding/handling (Zalewski/Moussouris) → ABSENT, honest gap** (no CVE scan, no ISO 30111/29147 intake).

## G. Tools, automation & reusable capabilities
All modules shipped + test-covered in `test:report`; each cited module has a co-located `.test.ts`. Reusable: CycloneDX emission, SARIF-shaped findings `{id,area,severity,detail,remediation,evidence}`, provenance sealing, G-05 sealed bundle, G-08 OSCAL-interop export, compliance-evidence-pack. No external paid dependency; no network at runtime for the core path. Mechanism ≠ satisfied ≠ certified.

## H. Quality controls & acceptance criteria
Own acceptance is mechanical + fail-closed: ACCEPTED only when the SBOM reproduces byte-identically across two clean runs, every component carries an explicit license verdict (0 silent-pass on UNKNOWN), every artifact carries a verifying provenance stamp. Headline metrics: SBOM completeness & reproducibility; license-decision coverage + **false-silent rate (target 0)**; provenance-stamp coverage + tamper-detection; regulation-mapping coverage. **No vuln-detection metric claimed — empty axis by design.**

## I. Security, privacy & compliance controls
Local/sandboxed no-egress manifest analysis; bubblewrap confinement of any untrusted build/code-exec; tamper-evident provenance + keyed-HMAC audit chain. **No SOC 2 / ISO 27001 cert claimed** (mechanism ≠ certified); **not a notified body** (CRA notified-body provisions from 2026-06-11) — a structural go-to-market gap. Keyless provenance tamper-evident not tamper-proof; keyed-HMAC closes full-rewrite forgery when a key is provisioned (owner-gated).

## J. Deliverable templates & evidence standards
Findings use `{id,area,severity,detail,remediation,evidence}` (SARIF-emittable). Deliverable = reproducible CycloneDX SBOM + per-component license verdict table + provenance manifest + regulation-mapping section + **explicit gap list**. Statuses via G-08 drawn only from {OBSERVED,GAP,NOT_ASSESSED,INFO,REMEDIATION} — **no "satisfied"/"compliant" status emitted**. `NO_MANIFEST`/`INCOMPLETE_BUNDLE`/UNKNOWN surfaced honestly.

## K. Customer communication & reporting procedures
Reports state FACT vs INFERENCE, the threat model, exact limits in plain language (Janca axis — actionable by the client's developers): "reproducible SBOM + license + provenance **evidence/readiness prep, NOT certification and NOT a vulnerability assessment**." The CVE-scan gap + recommended NVD/OSV + ISO 29147/30111 pairing stated, never papered over. `cannot verify` escalated as a finding.

## L. Maintenance, support & escalation procedures
Re-runs deterministic (manifest + commit-pinned); drift detected by regenerating + diffing per release (D03-B). Escalation: owner-gated deps (HMAC-key provisioning for keyed provenance/audit; scoping a CVE/vuln feed if a client needs scanning) surfaced with the exact human action. ODG does not operate the client's vuln-handling process (ISO 30111) — named as the client's adjacent obligation.

## M. Pricing research & proposed commercial models
(Market dossier §4–5, dated 2026-11-01.) Adjacent anchors: Snyk ~$25/dev/mo, Socket $25/$50 dev/mo, Sonatype Repo Firewall ~$4,800/yr; enterprise SCA/SBOM modules contact-sales (itself a finding). V3 service anchors (context only): code audit €4–12k, ISO 27001 readiness €3–6k. **ODG price = HYPOTHESIS only — no quote, no buyer; never presented as a quote.** Two unvalidated models: fixed-scope evidence pack or recurring drift-monitoring. Demand ≠ WTP. The declared vuln-scan non-coverage is procurement friction unless sold as a complement.

## N. Proposal & SOW templates
Fixed-scope SOW: inputs (manifests + target regulation + any license policy), §D deliverables, explicit exclusions (no vuln scan / no SAST-DAST / no certification / not a notified body), acceptance = §H metrics, honesty disclaimers. Reuses proposal-pipeline stage discipline (prepared≠sent≠signed≠cashed). **Not sent to any buyer.**

## O. Technical documentation & handover
Handover = evidence pack (SBOM + license table + provenance manifest + regulation mapping + gap list) + G-05 sealed bundle + G-08 export + a reproduction recipe (manifest set + commit + versions → byte-identical SBOM). Modules documented in-repo.

## P. Website/service-page spec & SEO strategy
Spec only (not published): a service page leading with "reproducible, auditor-ready supply-chain **evidence** for CRA/NIS2 — not a vulnerability scanner, not a certifier." SEO: "CRA SBOM technical documentation", "NIS2 supply-chain evidence", "CycloneDX SBOM readiness", "software supply-chain provenance evidence". Not published.

## Q. Demonstration & reproducible test scenarios
Deterministic in-repo demos (synthetic/own-repo data only): (a) regenerate CycloneDX SBOM twice on the same commit → byte-identical; (b) inject unknown-SPDX license → fail-closed flag, not a silent pass; (c) regenerate across a release bump → component diff + per-component verdict (D03-B); (d) tamper an evidence record → HMAC/tip-anchor rejects; (e) map SBOM/evidence → CRA tech-doc + NIS2 2024/2690 clauses. **Explicitly NOT demonstrated: CVE detection vs Grype/Trivy/Snyk/Socket** (ODG doesn't implement that axis — excluded as apples-to-oranges).

## R. Risks, limitations & human responsibilities
**The CVE/vuln-scan gap is the central commercial risk** — the core feature of every SCA competitor, declared not-performed; without an NVD/OSV feed ODG is a complement not a replacement. No vuln-handling intake (ISO 30111/29147 = client's adjacent obligation). Provenance lighter than Sigstore/TUF (symmetric keyed-HMAC, no transparency log, keyless tamper-evident not tamper-proof; keyed-HMAC pending owner key). Manifest-only (OS packages/containers absent). Not a certifier/notified body. Market evidence needs primary-source confirmation (EUR-Lex CRA SBOM clause; ANSSI 15–18k). A human must scope any CVE-feed closure + provision any signing key. No vuln coverage and no certification ever asserted.

## S. Readiness assessment & remaining gaps
**Overall R2.** Core evidence engine (`sbom-audit-service`, `license-policy`, `evidence-provenance`, `supply-chain-attest`, `third-party-agent-gate`, bubblewrap, G-05, G-08) — **R3** (each merged under the campaign's separate-context independent validator; D2 RELEASED + active hardening per the matrix). Market evidence — **R1** (confidence-labelled; primary-source confirmation pending, D03 dossier §C). Client delivery — **R0–R1** (no authorized external case; €0 clients). To reach R3 overall: close the CVE/vuln-scan gap (scope NVD/OSV — unscoped engineering) + provision the HMAC key (owner-gated). To reach R4/R5: an authorized realistic external case + operational controls + (for certification positioning) a notified-body relationship — NOT attempted this phase. **€0 clients; no R4+ claimed; mechanism ≠ satisfied ≠ certified.**
