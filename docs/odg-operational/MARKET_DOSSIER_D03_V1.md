# Market Dossier — D03: Cybersecurity, Application Security & Software Supply-Chain Security (V1)

**Wave 2, CTO Master Unified Mandate.** EU/France-first + international benchmarks. Date checked **2026-11-01** (web research via WebSearch/WebFetch). **Evidence-grade, confidence-labelled — not verified fact.** No market size, price, competitor or buyer was fabricated; every significant claim carries source + date + scope + confidence; inferences are labelled. **Primary-source confirmation still required** before any client-facing use (see §C). Dossier 1 of 11.

> Scope discipline: does NOT re-run O2 (CRA/SBOM/SLSA) evidence-prep (`ODG_POC_O2_O3_O8.md`) or re-quote the V2/V3 commercial anchors (`COMMERCIAL_RESEARCH_V2/V3.md`, `ODG_PRIVATE_SECTOR_OPPORTUNITIES.md`); it summarizes those and builds the missing downstream AppSec/supply-chain + NIS2/FR-regulatory market evidence.

## 1. Demand & trends (FACT unless noted; confidence in brackets)
- **CRA — Reg. (EU) 2024/2847:** in force 2024-12-10; **Art.14 reporting obligations live since 2026-09-11**; notified-body provisions from 2026-06-11; **full application incl. CE marking + SBOM in technical documentation 2027-12-11** → readiness demand concentrates 2026→mid-2027. [HIGH; confirm exact SBOM clause on EUR-Lex]
- **NIS2 — Dir. (EU) 2022/2555:** transposition due 2024-10-17; **France NOT yet transposed**, Commission CJEU referral 2026-07-08; FR résilience bill (NIS2+CER+DORA) expected autumn 2026. [HIGH status / MEDIUM timing]
- **France scope:** ANSSI estimate **~15,000–18,000 NIS2 entities** vs ~500 under NIS1 (~30× widening); ReCyF published 2026-03-17. [MEDIUM-HIGH; confirm on anssi.gouv.fr]
- **NIS2 technical:** Impl. Reg. (EU) 2024/2690 (vuln-handling measures); ENISA Technical Implementation Guidance v1.0 (2025-06-26). [HIGH]
- **Threat momentum:** Sonatype 2026 — 454,600+ new malicious OSS packages in 2025 (+75% YoY); ReversingLabs +73%, npm ~90% of detections; IBM 2025 supply-chain breach ~$4.91M / 267-day lifecycle; Shai-Hulud npm worm (Sept 2025, >1,000 pkgs). [MEDIUM — dated vendor reports, directionally consistent]

## 2. Buyer problems / triggers
Regulatory deadline pressure (CRA Art.14 live, CE/SBOM 2027-12-11; NIS2 FR imminent) is the hardest trigger [HIGH on drivers; willingness-to-pay = INFERENCE]. Enterprise security-questionnaire deal-blockers + tech-DD windows (from V3, carried-not-reverified) [MEDIUM]. **Core unmet problem (INFERENCE):** OSS tooling *finds* issues cheaply but doesn't produce a reproducible, provenance-stamped, auditor-ready evidence pack mapped to a regulation — buyers pay for expertise + defensible evidence, not raw scanning.

## 3. Segments (by regulatory exposure — demand signal, not confirmed buyers)
1. EU "products with digital elements" vendors (direct CRA subjects) — HIGH. 2. NIS2 FR essential/important entities (~15–18k) — HIGH exposure / MEDIUM spend. 3. EU B2B SaaS SMEs selling upmarket — MEDIUM. 4. Startups in funding/M&A DD — MEDIUM. **Size skew (INFERENCE):** large enterprises already run commercial SCA in-house; the under-served, deadline-exposed SME/mid-market newly in CRA/NIS2 scope is the plausible fit.

## 4. Competitors / substitutes vs ODG (vendor claims unless noted)
Commercial SCA/supply-chain: **Snyk** ($25/dev/mo Team), **Socket** ($25/$50 dev/mo), **Sonatype** (Repo Firewall Cloud Pro $4,800/yr; SCA=quote), **Endor Labs** (quote), **Chainguard** (quote), **Anchore** (OSS Syft/Grype + enterprise quote), **Black Duck/Mend/Checkmarx** (quote). OSS substitutes: OWASP Dependency-Check/Dependency-Track, Syft/Grype, Trivy, CycloneDX (all free). Consultancy substitutes: Big Four, boutique AppSec/pentest, in-house teams.
**ODG match (read from `runtime/core/sbom-audit-service.ts`, `license-policy.ts`, `third-party-agent-gate.ts`):** real-manifest → **CycloneDX SBOM across 8 ecosystems**; per-component **SPDX license audit** vs policy, SARIF-emittable; **fail-closed** (unknown license flagged, no-manifest honest); **provenance stamping** (sourceCommit/sha256); **bubblewrap confinement** of untrusted build/code-exec; **third-party-agent-gate** → OWASP Agentic Top 10 2026 (ASI04 supply-chain → license-policy).
**ODG does NOT match (honest gaps):** **no CVE/vulnerability scanning** (the core feature of every competitor — declared-not-performed); no live CI/CD integration; no SAST/DAST/container/IaC; manifest-only (not OS packages); **not a certification body.**

## 5. Pricing (evidence-backed; hypotheses marked)
Per-dev SaaS Snyk/Socket $25/mo, Socket Business $50/mo [MEDIUM list]; Sonatype Repo Firewall $4,800/yr [MEDIUM]; enterprise SCA/SBOM modules **not publicly priced** (contact-sales — itself a finding). Service anchors from V3 (carried, not re-quoted): code audit €4–12k, pentest SMB $8–20k, ISO 27001 readiness €3–6k, EuroAIGuard €490/990/2,290/mo. **ODG's own price = HYPOTHESIS, no accepted quote — never present as a quote.**

## 6. Procurement barriers
New-entity trust bar (turnover/accounts/insurance/certs), FR micro turnover ceiling; **accredited certification credibility gap — ODG prepares evidence/pre-audit, is NOT a certifier (notified bodies from 2026-06-11)** [HIGH, structural]; sales cycles SMB 30–90d / mid-market 90–180d [MEDIUM]; ODG's declared vuln-scan non-coverage is procurement friction unless positioned as a complement.

## 7. Standards & regulations (official refs + dates)
CRA Reg. (EU) 2024/2847 [HIGH]; NIS2 Dir. (EU) 2022/2555 + Impl. Reg. (EU) 2024/2690 + ENISA TIG v1.0 [HIGH]; NIST SSDF SP 800-218 v1.1 (final; Rev.1 draft 2025-12-17) [HIGH]; SLSA (OpenSSF) [HIGH]; ISO/IEC 27001:2022 [HIGH]; OWASP Top 10 2021 A06, CycloneDX (OWASP flagship SBOM), SCVS 1.0, OWASP Top 10 for Agentic Applications 2026 (2025-12-09) [HIGH]; DORA Reg. (EU) 2022/2554 (finance, bundled in FR bill) [MEDIUM].

## 8. ODG differentiation (grounded in ACTUAL capabilities)
1. Reproducible, **provenance-stamped SBOM as CRA technical-documentation evidence** (byte-reproducible, sha256/sourceCommit-bound). 2. **Fail-closed honesty** as a trust signal (declares non-coverage; UNKNOWN license never assumed safe). 3. **Governed untrusted-build confinement** (bubblewrap; SLSA build-integrity relevance). 4. **Agent-supply-chain intersection (ASI04)** — under-served by pure SCA vendors. **Mandatory caveat:** to compete on the core buyer need ODG must pair these with a real vuln feed (NVD/OSV) — currently absent by design; without it ODG is an evidence/license/provenance complement, not an SCA replacement.

## 9. Realistic first offers (reuse O2; no price re-quoted without source)
- **D03-A "CRA/NIS2 Supply-Chain Evidence Readiness Pack" (fixed-scope 5–10d):** reproducible multi-ecosystem CycloneDX SBOM + license audit + provenance manifest, auditor-ready, mapped to CRA tech-doc + NIS2 vuln-handling, with explicit gap list (incl. the vuln-scan gap + recommended NVD/OSV pairing). **Readiness/evidence prep, NOT certification.**
- **D03-B recurring:** periodic SBOM + license-drift monitoring (regenerate + diff + policy verdict per release).
- Pricing = V3 anchors as context only; ODG figure stays HYPOTHESIS; no buyer contacted; €0 claimed.

## 10. Source table (abridged — full URLs in the research transcript)
CRA: cyberresilienceact.eu, OpenSSF, EUR-Lex (confirm) · NIS2/FR: Commission referral, nisd2.eu, SPAC Alliance, openKRITIS, ANSSI(confirm) · ENISA TIG (primary) · SSDF: NIST SP 800-218 · SLSA: slsa.dev · OWASP/CycloneDX: owasp.org, cyclonedx.org · threat: Sonatype 2026, ReversingLabs, IBM 2025, Phoenix Security · pricing: snyk.io, socket.dev, sonatype.com + SCA comparisons · market-size: MarketsandMarkets/FutureMarketInsights/etc [LOW, 2–4× spread] · ODG code+docs (primary). Each carries date-checked 2026-11-01 + confidence.

## A. FACT vs INFERENCE
FACT (sourced+dated): §7 instruments+dates; CRA phases; NIS2 FR non-transposition + CJEU referral + ANSSI ~15–18k; ENISA TIG; threat stats (vendor, dated); competitor list + public prices; ODG capabilities/gaps (from source). INFERENCE (labelled): buyer willingness-to-pay, segment priority, the under-served-middle, the evidence-narrative gap, market-size-as-signal, ODG pricing (HYPOTHESIS).

## B. Confidence summary
HIGH: regulatory instruments/refs/dates; ODG capabilities/gaps. MEDIUM: FR transposition timing; threat stats; competitor list prices; sales cycles. LOW: all absolute market-size figures (AppSec ~$13.6–15.6B 2026; supply-chain-security ~$1.4–5.8B 2025; SBOM ~$2.8B — analyst estimates diverge 2–4×; demand signals only).

## C. UNVERIFIED — needs more research before client-facing use
1. EUR-Lex primary text of CRA SBOM/tech-doc clause + NIS2 Annex measures. 2. ANSSI primary for the 15–18k figure + ReCyF. 3. **No verified buyer / no buying intent** (fact ladder: potentially-concerned ≠ qualified buyer). 4. Analyst-report internals (FR/EU-specific splits). 5. ODG's CVE/vuln gap closure (unscoped engineering). 6. FR/EU cybersecurity *services* market sizing (vs global tooling).
