# REGULATORY_ASSURANCE — capability + international source registry (V1, 2026-10-26)

ODG capability for reusable regulatory-readiness preparation across multiple companies. **ODG prepares**
documents, controls, evidence, simulations and audit files; **ODG does NOT certify** — an accredited/independent
body does. Hermetic, €0, no network. Status labels: **PROVEN** (gated test, this repo) · **SIMULATION** (hermetic
fixtures) · **EXTERNAL/BLOCKED** (auditor/lawyer/certifier/host).

## Capability (compiled + gated)
- `runtime/core/regulatory-assurance.ts` — `buildDossier(profile, {registry, now, verifier, knownVersions})`.
  Modules: **GDPR_READINESS · ISO27001_READINESS · ISO42001_READINESS**. Suite `regulatory-assurance.test.ts`
  (25 assertions) is in `test:report` (65/65). Reuses `evidence-provenance` (sealing) + `excellence-policy`.
- `runtime/core/excellence-policy.ts` — canonical excellence mechanism consulted on every dossier (suite 18).

## Guarantees (PROVEN, hermetic)
- **Applicability**: every obligation has an applicability predicate on the profile; non-applicable obligations are
  KEPT with a justification note.
- **Hallucination control**: an obligation citing a source **absent from the registry is REFUSED** (dropped +
  recorded), never emitted as fact; no normative text reproduced (principles only).
- **Evidence honesty**: client-**declared** evidence is never "verified"; only an injected **independent verifier**
  yields `SATISFIED_VERIFIED`; missing ⇒ `GAP`; falsified/contradictory ⇒ rejected. Nothing invented.
- **Multi-tenant separation**: dossier tenant-scoped; **foreign-tenant evidence rejected**; sealed dossier
  attributable only to its tenant (tamper-evident).
- **Traceability**: requirement → control → evidence → owner → independent-verification (or explicit gap).
- **Versioning**: `detectReferenceChanges` surfaces reference version drift; stale references flagged by the
  excellence policy (re-review due).
- **No certification claim**: `certificationStatus` always `NOT_CERTIFIED`; `assertNotCertified` refuses "certified"
  / "fully compliant guaranteed".
- **Reproducible**: identical inputs ⇒ identical dossier (digest + findings).

## International source registry
Recorded **offline** (€0, no network) from well-known public identifiers; **not** live-verified and **no copyrighted
normative text reproduced**. Each entry carries authority/version/date/source-id/normative-status/jurisdiction/
usage-rights/next-review. `verificationStatus = offline-pending-reverify` until a network-authorized re-check.

| id | authority | domain | version | date | source (identifier, not a deep URL) | normative status | jurisdiction | usage rights | next re-verify |
|---|---|---|---|---|---|---|---|---|---|
| GDPR-2016-679 | EU | data-protection | 2016/679 | 2016-04-27 | Regulation (EU) 2016/679 (GDPR); CNIL official guidance | **legal-obligation** | EU/EEA | public regulation (reproducible); CNIL guidance per its terms | 2027-01-01 |
| ISO27001-2022 | ISO/IEC | information-security | 2022 | 2022-10-25 | ISO/IEC 27001:2022 | **voluntary-standard** | international | **principles only** (standard text copyrighted — do not reproduce) | 2027-10-01 |
| ISO42001-2023 | ISO/IEC | ai-governance | 2023 | 2023-12-18 | ISO/IEC 42001:2023 (AI management system) | **voluntary-standard** | international | **principles only** (copyrighted) | 2027-12-01 |
| NIST-CSF-2.0 | NIST | cybersecurity | 2.0 | 2024-02-26 | NIST Cybersecurity Framework 2.0 | recommendation | US (intl. use) | US-gov public | 2027-02-01 |
| NIST-AI-RMF-1.0 | NIST | ai-risk | 1.0 | 2023-01-26 | NIST AI Risk Management Framework 1.0 | recommendation | US (intl. use) | US-gov public | 2027-01-01 |
| OWASP-ASI-2026 | OWASP | autonomous-governance | 2026 | 2025-12-09 | OWASP Top 10 for Agentic Applications 2026 | recommendation | international | principles only | 2027-06-01 |

### Live-verification log (session internet authorization, consulted 2026-10-27)
Per the CTO session-scoped internet authorization (mission-perimeter only). Only facts actually consulted online are
marked **verified-online**; others stay **offline-pending-reverify**. No paywall bypassed; no copyrighted normative
text retrieved (ISO = public catalogue metadata only).

| id | verification | consulted (2026-10-27) | verified facts | source URL |
|---|---|---|---|---|
| GDPR-2016-679 | **verified-online** | WebSearch (eur-lex.europa.eu, commission.europa.eu) | CELEX 32016R0679; in force 2016-05-24; **applies from 2018-05-25** | https://eur-lex.europa.eu/eli/reg/2016/679/oj |
| DORA-2022-2554 | **verified-online** | WebSearch (esma.europa.eu, eiopa.europa.eu, eur-lex) | adopted 2022-12-14; in force 2023-01-16; **applies from 2025-01-17**; 20+ financial-entity types | https://eur-lex.europa.eu/eli/reg/2022/2554/oj |
| NIST-CSF-2.0 | **verified-online** | WebFetch nist.gov | CSF **2.0**, published **2024-02-24**, id NIST.CSWP.29 | https://doi.org/10.6028/NIST.CSWP.29 |
| NIST-AI-RMF-1.0 | **verified-online** | WebFetch nist.gov | AI RMF **1.0**, released **2023-01-26**, id NIST.AI.100-1 | https://doi.org/10.6028/NIST.AI.100-1 |
| ISO27001-2022 | **metadata verified-online** (text paywalled, NOT retrieved) | WebSearch iso.org | ed.3, **published 2022-10-25**, 1 amendment, status Published | https://www.iso.org/standard/27001 |
| ISO42001-2023 | **metadata verified-online** (text paywalled, NOT retrieved) | WebSearch iso.org | first AIMS standard, **published Dec 2023**, Annex A = 38 controls / 9 objectives | https://www.iso.org/standard/42001 |
| CNIL guidance | **verified-online** | WebFetch cnil.fr (2026-10-27) | official French DPA (Commission Nationale de l'Informatique et des Libertés) enforcing GDPR; publishes guidelines/recommendations + GDPR toolkit (RoPA, DPIA, BCR) | https://www.cnil.fr/en |
| OWASP-ASI-2026 | **verified-online** | WebSearch genai.owasp.org (2026-10-27) | "OWASP Top 10 for Agentic Applications", published **2025-12-09** (OWASP GenAI Security Project / Agentic Security Initiative); risks ASI01–ASI10 | https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/ |

Cost of this verification: **€0** (search/fetch only; no paid API, no purchase). CTO note recorded: DORA's **2025-01-17**
application date strengthens its applicability gate (EU financial entities). ISO normative text remains purchase-only.

>**Amendment re-verification (2026-10-27, live):** ISO/IEC 27001:2022 has **Amd 1:2024 "Climate action changes"**
(iso.org/standard/88435.html; metadata only, text NOT read). ISO/IEC 42001:2023 — **no applicable amendment found** as
of this date. AFNOR Norm'Info re-checked = read-only info/consultation page (NOT free full text); ANS-sponsored free
consultation of NF EN ISO/IEC 27001 eligibility STILL to be verified. See `CONTROLS_REFERENTIAL_V1.md`.

>**Access-level provenance (2026-10-27):** free full-text consulted for NIST CSF 2.0 + NIST AI RMF 1.0 + **ANSSI-PA-102
(GenAI security, 2024)** + ANSSI hygiène; open-document for GDPR/CNIL/DORA/OWASP-ASI; **ISO 27001/42001 = metadata-only
(text NOT read, paywalled)** with a LEGAL free route recorded (AFNOR ANS-sponsored consultation, eligibility TBV). Full
crosswalk + prepared (unsent) consultation request: `CONTROLS_REFERENTIAL_V1.md`. The `excellence-policy` Reference now
carries an `accessLevel` field (fail-closed default not-consulted) so "metadata-only" can never pass as "full-text".

**Normative status is never conflated**: legal obligation (GDPR) ≠ voluntary standard (ISO) ≠ recommendation (NIST/
OWASP) ≠ industry practice ≠ assumption. Best practices are complementary; where methods differ (e.g. ISO's
control-based ISMS vs NIST's function-based CSF), both principles are offered, not merged as one "optimal" truth.

## PHASE 6 — limits, human obligations, external costs
**ODG delivers (safe, local, €0):** obligation mapping + applicability justification, gap analysis, prioritized
remediation, policy/register/procedure/report drafts, requirement→evidence traceability, internal audit prep,
reproducible exportable dossiers, change detection.

**Remains with the client / external parties (EXTERNAL/BLOCKED):**
- **Client**: supply real evidence/artifacts; appoint owners; implement controls; operate the management system.
- **Lawyer (external fee)**: legal interpretation, DPA/contracts, lawful-basis sign-off.
- **Independent auditor (external fee)**: independent verification of operating effectiveness.
- **Accredited certification body (external fee)**: the **only** party that can grant ISO 27001/42001 certification;
  ODG cannot and does not.
- **Re-verification (host/network-gated)**: live re-check of every source at its next-review date; the registry is
  offline-pending-reverify here.

**Cost split**: internal = €0 (ODG local). External = lawyer + auditor + certification-body + accreditation fees
(not estimated here; require a separate commercial authorization). Human dependencies = owners, management decisions,
legal sign-off, certification decision. **No guarantee of absolute conformity or of acceptance by any body.**
