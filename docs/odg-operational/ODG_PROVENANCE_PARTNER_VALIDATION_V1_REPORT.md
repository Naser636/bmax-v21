# ODG_PROVENANCE_PARTNER_VALIDATION_V1 — Consolidated Report
### (incl. addendum PDF_READING_AND_EVIDENCE_EXTRACTION_V1)

**Attempt ID:** `PROV_PARTNER_VAL_V1#2026-10-20` (first attempt). **Date:** 2026-10-20. **Duration:** single session.
**Verdicts:** hypothesis ⇒ **HYPOTHESIS_WEAKENED**; PDF capability ⇒ **PASS** (demonstrated on real + synthetic PDFs, propagated into the chain).

Discipline: **facts** vs **hypotheses** vs **NON PROUVÉ** kept explicit. No contact, no spend, no infra change. Contacts/contracts = **0**.

---

## 1. Truth Lock & commits
Entry HEAD `23b84cf`, branch `main` synced, worktree clean, **5 stashes intact**, prior reports present. New code this mission: `runtime/core/pdf-extract.{js,ts}` + `pdf-extract.test.ts` (the only repo changes; §1/§2 of the prior mission already at `d772cc6`/`23b84cf`). Commit: see tail.

## 2. Hypothesis tested
*"ODG can become an independent provenance & verification layer for CRA/SBOM vendors, integrators and technical firms."* Tested for technical differentiation, commercial credibility, economic viability — **not** assumed.

## 3. §2 — Candidate landscape (origin-verified where marked)
| # | Candidate | What they already do (evidence) | Signing / provenance / independent verification | Partner program / API | Verif. level |
|---|---|---|---|---|---|
| 1 | **Sigstore / cosign + in-toto / SLSA** (free, CNCF-graduated) | sign SBOMs/artifacts/attestations; Rekor transparency log; Fulcio keyless | **Yes — the de-facto standard**; consumers "independently verify" via cosign / `gh attestation verify` / Kyverno/OPA/Ratify | open standard, universally integrable | VERIFIED (primary: sbomify FAQ + OWASP) |
| 2 | **FOSSA** | SCA + SBOM (SPDX/CycloneDX); CRA/EO14028/FDA/PCI coverage | signed SBOMs | **OEM + Reseller + Technology partners**; SBOM import/build **API** | VERIFIED (fossa.com/partners, docs) |
| 3 | **Finite State** | firmware/product-security platform; SBOM+VEX; **"signed compliance packages"**; CRA audit-ready evidence | yes (signed packages) | platform/integrations | VERIFIED (search + finitestate.io) |
| 4 | **sbomify** | SBOM hub, Trust Center, CRA Wizard | **recommends Sigstore/cosign**; "the consumer does not need to trust sbomify … independently verify" | plugin ecosystem | VERIFIED (primary: FAQ) |
| 5 | **Regulus (goregulus.com)** | generates the nine CRA documents, "marks what is missing instead of inventing it"; SBOM+vuln | document-centric (no crypto-provenance advertised) | targets consultancies | VERIFIED (primary, prior mission) |
| 6 | **ONEKEY** | firmware security + SBOM + CRA compliance platform | platform-internal | platform | SEARCH-level |
| 7 | **Mend.io** | SCA enterprise | — | **Global Partner Network** | SEARCH-level |
| 8 | Docker / Sonar | SBOM generation in CRA context | Docker ties to cosign | ecosystems | SEARCH-level (weak) |

**Limit declared (§2):** 4 candidates deep-verified from primary sources; 4 at search-level only. No candidate was contacted; no partner interest is asserted (would be fabrication). Partner *programs* exist (FOSSA, Mend) — that is a fact; partner *interest in ODG* is **NOT PROUVÉ**.

## 4. §3 — ODG's proven differentiation vs the field
**Proven (this mission, §5 experiment):** ODG's evidence pack is independently verifiable by a **third party using only Node standard `crypto` — ZERO ODG modules** (positive OK; tampered artifact / SBOM / signature / predicate all correctly FAIL). It is a tamper-evident, portable, dependency-free artifact.
**Decisive limitation (proven):** ODG's envelope is **not** DSSE/cosign/JCS-interoperable — verification requires **byte-exact JSON** (`canon = JSON.stringify`, not RFC 8785); a sorted-key (JCS-style) re-serialization **fails** verification. A partner's existing cosign/SLSA pipeline could **not** verify an ODG pack out-of-the-box.
**Redundancy (proven by evidence):** independent, signed, in-toto/SLSA SBOM provenance with third-party verification is **already** delivered — better and interoperably — by the free CNCF Sigstore/cosign stack (adopted/recommended by candidate sbomify) and natively by product-security platforms (Finite State "signed compliance packages"; FOSSA signed SBOMs). ODG has **no** transparency log, **no** keyless signing, **no** ecosystem.
**Residual, honestly-weak differentiators:** (a) zero-dependency portable verifier — marginal vs a single cosign binary; (b) the **composed CRA/AI-Act readiness dossier** (SBOM + attestation + AI-Act matrix + robustness golden-set + honest NOT_ASSESSED gaps) — but that is the *document-generator* space (Regulus-class), not the crypto layer, and ODG has no traction there; (c) the new dependency-free **PDF evidence extraction** — a useful internal capability, not a market differentiator (pdftotext/pdfjs are ubiquitous elsewhere). A valid signature is **never** equated with CRA conformity, certification, or legal guarantee.
**Verdict driver:** across the crypto-provenance layer (commoditized) AND the readiness-dossier layer (occupied incumbents), ODG shows **no demonstrated differentiation** ⇒ **HYPOTHESIS_WEAKENED**.

## 5. §4 — Partnership economics (three scenarios — HYPOTHESES, demand unproven)
| Scenario | Initial / maintenance | Days & cost (hyp.) | Price / margin (hyp.) | Why a partner pays / refuses |
|---|---|---|---|---|
| **A. Technical / API integration** (embed ODG provenance into FOSSA/Finite State-class) | HIGH init (adapt to their API + moving CRA/AI-Act specs); **ongoing** maintenance | ~15–30 d init + recurring | project/licence — unquantified | **Refuse (likely):** redundant with their own signed packages + free cosign; ODG adds nothing their stack lacks. |
| **B. White-label pack generation** (for a consultancy e.g. Regulus-class) | MED init; maintenance tracks regs | ~8–15 d init | per-pack / retainer | **Marginal:** the honest "mark-missing" discipline is the only draw — but Regulus already advertises exactly that; cosign covers signing for free. |
| **C. One-off evidence-pack + verification service** | LOW (ODG already runs it) | ~5–10 d/engagement | ~€8.5k/engagement (prior mission) | **Weak:** this is the direct-service model the prior mission found had **no demonstrated demand**; single engagement is loss-making vs annual fixed costs. |

Ladder kept explicit: pipeline / proposal / signed contract / invoicing / collection are distinct; a CA target is **not** evidence of demand. A one-page value proposition + a draft partner proposal were prepared (not included verbatim here); **no message sent**.

## 6. Addendum — PDF reading & evidence extraction
- **Existing capability (audit):** NONE. No node PDF lib, no system tool (`pdftotext`/`mutool`/`gs`/`qpdf` absent), no OCR (`tesseract` absent), no python PDF module, no prior ODG PDF reader. Installing deps was unauthorized.
- **Root cause of the prior "unreadable" PDF:** the LIC Housing RFP is `%PDF-1.7`, **not encrypted**, with **220 FlateDecode (zlib-compressed) content streams** over 70 pages — so `strings`/the WebFetch small-model saw nothing, but `zlib.inflate` reads it.
- **Change made:** new reusable `runtime/core/pdf-extract.{js,ts}` (dual-port) — dependency-free text-layer extractor using built-in `zlib`+`crypto`. Honest fail-closed status (`NOT_A_PDF`/`EMPTY`/`ENCRYPTED`/`NO_TEXT_LAYER`/`CORRUPT`/`PARTIAL`/`TEXT_EXTRACTED`), `fullyExtracted` false unless every stream inflated + text found, `findInPdf` links a claim to its document+hash. **OCR is explicitly NOT performed** (tesseract absent) — a no-text-layer/scanned PDF returns `NO_TEXT_LAYER` with `ocr.available=false, reason=OCR NEEDED but UNAVAILABLE`.
- **Tools/deps used:** Node stdlib only (`zlib`, `crypto`). No install, no model download, no network, no config change.
- **Tests:** `pdf-extract.test.ts` **11/11** — valid / multipage / table-layout / no-text-layer / corrupt+non-pdf+empty / encrypted / scanned(OCR NOT RUN) / partial / findInPdf / JS-TS parity / **chain-integration**. tsc 0 across all three configs.
- **Scanned/OCR handling:** detected and flagged honestly; true OCR extraction is **NOT RUN** (no authorized OCR tool) — declared, not faked.
- **Re-evaluated discarded document:** the LIC Housing RFP is now read from the ORIGIN (1.0 MB text, status **PARTIAL** — 1/110 streams failed, `fullyExtracted:false`, so NOT claimed fully analyzed). **Confirmed** (previously inferred/assumed): issuer = **LIC Housing Finance Ltd**; "EMPANELMENT OF CYBER SECURITY SERVICE PROVIDERS"; decisive eligibility gate **"minimum average annual turnover of INR 50 Crores"** (≈ €5.5 M) ⇒ a solo provider is **definitively INELIGIBLE**; SBOM/AI-BOM appear only in a broad cyber-security glossary ⇒ LOW fit confirmed.
- **Measured chain effect:** feeding the extracted text + hash into `opportunity-detector` moved its content-provenance from **REJECTED** (no content) → **CANDIDATE** (retrievalOk + contentPresent + computed hash + FIRST_CAPTURE). `findInPdf` linked each claim (turnover INR 50, SBOM, AI-BOM) to the document. **Honest distinction (§5 addendum):** this is an improvement in READING, not in demand — the commercial conclusion (DISCARD; low fit; ineligible) is **confirmed and strengthened**, not changed.

## 7. §6/§7 — Validation, metrics, learning
- Targeted tests green: `pdf-extract` 11/11; chain-integration locked. tsc 0 ×3; JS/TS parity. Full `npm test` run as the integration gate (result in tail).
- Independent verification: the §5 third-party verifier (standard crypto only) corroborates the signature/tamper behavior independently of ODG code; the PDF re-read corroborates the LIC Housing facts from the origin document.
- Metrics: web sources consulted this mission = **5** (4 WebSearch + partner-program fetch + sbomify FAQ fetch); candidates listed = **8** (4 deep-verified); qualified partners = **0 asserted**; PDFs read = **1 real (PARTIAL) + 10 synthetic test cases**; contacts/contracts = **0**.
- Learning (persisted here; `learning-chain` = PERSISTED, **NOT EFFECTIVE** — PDF capability is a genuine new capability but no measured before/after *commercial* improvement): *"The independent-provenance layer is commoditized by free CNCF Sigstore/SLSA and incumbent signed-package features; ODG's non-standard envelope is redundant and less interoperable. PDF text-layer extraction is now available dependency-free and propagates into the provenance chain, resolving a real reading gap without creating demand."*

## 8. §9 — Risks & next CTO decision
**Risks:** (1) pursuing a redundant crypto-provenance layer wastes effort against free standards + funded incumbents; (2) the only honest differentiation (composed readiness dossier) is an occupied market with no ODG traction; (3) PDF extractor is text-layer only — scanned PDFs need OCR (currently unavailable) and the envelope remains non-DSSE.
**Recommended next CTO choice (evidence-driven):**
1. **Do NOT invest in ODG-as-provenance-layer as a standalone/partner product** (HYPOTHESIS_WEAKENED). If any provenance work continues, **adopt the standard** (emit true DSSE + optional Rekor) so packs are cosign-verifiable — turning a weakness into interoperability — rather than competing with a custom envelope.
2. Keep the PDF + evidence-pack as **internal ODG capabilities** (they improve ODG's own research/qualification honesty), not as a market offer.
3. Any commercial motion still requires a human/legal step and is **CTO Phase-3 gated**.

## 9. Addendum — Autonomous Unit Economics (ODG_AUTONOMOUS_UNIT_ECONOMICS_V1)
**Audit first (§4):** existing calculators reused, no parallel money logic — `economic-unit` (Quantity/add/sub/format; no multiply/percent inside it), with `revenue-model`'s capacity discipline and `live-cost-metering`'s observed-usage basis as references. New thin composer `runtime/core/unit-economics.{js,ts}` (+test 7/7, tsc 0 ×3, JS/TS parity) separates the four time buckets and enforces the honest rules: **compute is not free** (missing ODG rate ⇒ warning, never silent zero), **elapsed ≠ CPU ≠ ODG-active ≠ human**, **revenue ≠ profit**, per-field `basis` (MEASURED|ESTIMATED), and **capacity = the binding constraint** (not an extrapolation from one run).

**Worked €8,500 engagement (CRA/AI-Act evidence pack) — all time/cost inputs ESTIMATED hypotheses except where noted:**
| Item | Value | Basis |
|---|---|---|
| Sale price | €8,500.00 | hypothesis (prior mission) |
| Direct costs (compute/API ~€40 + software ~€10) | €50.00 | ESTIMATED |
| ODG active time | 180 min (3 h) | ESTIMATED |
| ODG wait time | 60 min | ESTIMATED |
| **Residual human time** (approval/signature only) | **90 min (1.5 h)** | ESTIMATED |
| ODG active marginal cost (@ €5/h — NOT free) | €15.00 | ESTIMATED |
| Residual human cost (@ €80/h, reported separately) | €120.00 | ESTIMATED |
| **Contribution margin** (price − direct − ODG marginal) | **€8,435.00** | derived |
| Margin incl. residual human | €8,315.00 | derived |
| Margin per **residual-human-hour** (scarce resource) | €5,543.33 | derived |
| Margin per ODG-active-hour | €2,811.67 | derived |
| **Delivery capacity — binding constraint** | **human approval = 2/day** (ODG alone could do 10/day; rate-limit 20/day) → **≈42/month** | derived from inputs |

**Key honest insight:** at these (hypothetical) inputs the engagement is **human-gated, not ODG-gated** — ODG could deliver ~10/day but mandatory human approval caps throughput to ~2/day. The CTO's time is imputed ONLY for the 1.5 h of genuinely-human work, never for the 3 h ODG does itself. **Profitability is NOT declared validated**: every time/cost figure is an ESTIMATE until measured on real engagements; the €8,500 price itself has no demonstrated market demand (see §3–§5).

## Verdict
- **Unit economics: model shipped + tested (honest, measurement-gated — NOT a validated profitability claim).**
- **Hypothesis: HYPOTHESIS_WEAKENED** — evidence (free CNCF standard commoditizing the layer; incumbents already shipping signed CRA packages; ODG's envelope less interoperable) shows the independent-provenance-layer position is neither clearly differentiating nor commercially credible as a standalone/partner product.
- **PDF addendum: PASS** — dependency-free extraction demonstrated on a real PARTIAL PDF + 10 synthetic cases, propagated into the ODG provenance chain, with honest status and no false success; OCR path NOT RUN (declared).

**STOP.** No contact performed; no auto-chain to prospection, spend, or deployment.
