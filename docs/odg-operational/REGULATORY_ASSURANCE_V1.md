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
