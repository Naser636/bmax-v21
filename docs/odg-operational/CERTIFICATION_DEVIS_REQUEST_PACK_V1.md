# ODG — ISO 27001 certification devis-request pack (V1, 2026-10-27)

Ready-to-use dossier to request quotes from accredited certification bodies. **No body contacted; devis request is a
DRAFT (UNSENT).** Prices are "devis required" — none invented. `[À COMPLÉTER]` = caller-supplied verified data.

## 1. Proposed certification scope (ISMS) — to finalise with CTO
- **Standard:** ISO/IEC 27001:2022 (+ Amd 1:2024). *(ISO 42001 deferred — accredited 42001 nascent, see pathway doc.)*
- **ISMS scope statement:** `[À COMPLÉTER — boundaries/activities/interfaces]` (justification: the AI-governance/readiness
  advisory service + its supporting runtime).
- **Effectif:** `[À COMPLÉTER]` · **Sites:** `[À COMPLÉTER]` · **Activités:** `[À COMPLÉTER]`.
- **Architecture/services:** runtime (TypeScript, CI-gated), evidence/audit-log hash-chain, local stores; production
  deps (KMS, off-host backup, monitoring, multi-tenant) currently EXTERNAL (see `PRODUCTION_DEPENDENCIES_SPEC_V1`).

## 2. Existing policies & evidence (to present)
- Code-evidenced mechanisms (gated): identity/access, tamper-evident logging, governed change, recovery (see
  `ISO_27001_CLAUSE_MATRIX_V1`). **Status: MECHANISM_PRESENT — not yet SATISFIED** (operational evidence pending).
- DRAFT policies (`ISO_27001_POLICY_TEMPLATES_V1`), not approved.

## 3. Open operational gaps (honest — block readiness)
Approved ISMS policy; risk assessment+treatment; SoA (needs standard text); **executed** internal audit; **executed**
management review; incident register; corrective-action records; off-host backup+restore drill. Machine verdict:
**NOT_READY** (`ISO_27001_CERTIFICATION_READINESS_V1`, 0/12 controls, 0/10 dossier).

## 4. Certification bodies — comparison (verify scope before relying)
| CB | Site / address | 27001 accreditation | Verified this session? | Price |
|---|---|---|---|---|
| **AFNOR Certification** | certification.afnor.org · 11 rue Francis de Pressensé, Saint-Denis | **COFRAC n°4‑0001, "Accrédité" for ISO/IEC 27001:2022 (NF EN ISO/IEC 27006‑1:2024)** | **YES** — COFRAC fiche entite_id=41000578 + annex `tools.cofrac.fr/annexes/sect4/4-0001.pdf` | devis |
| **Bureau Veritas Certification** | bureauveritas.fr | COFRAC-accredited CB | **NO — scope to verify** on tools.cofrac.fr/fr/easysearch | devis |
| **BSI** | bsigroup.com | UKAS (27001); + accredited 42001 (UKAS 2026) | **NO — verify on UKAS** | devis |
> COFRAC easysearch requires an interactive parameterised query (name/accreditation-n°/SIREN) + opening the scope
> annex; only AFNOR's 27001 scope was confirmable via its published annex this session. Verify the others before use.

## 5. Standardised questions to each CB (in the devis request)
1. Confirm your accreditation body + number + that ISO/IEC 27001:2022 is **in scope** (annex reference).
2. Stage 1 / Stage 2 effort (days) for our scope + effectif; surveillance Y2/Y3 + recertification effort.
3. Total first-cycle cost (audit only) + annual surveillance cost; what drives it (headcount/sites/scope).
4. Lead time from application to certificate.
5. Documents required before Stage 1 (SoA, risk assessment, internal audit, management review).
6. Remote vs on-site audit options.

## 6. DRAFT devis request (UNSENT — CTO/legal review; verify CB scope first)
> Objet : Demande de devis — certification ISO/IEC 27001:2022
> Bonjour, [ENTITÉ `[À COMPLÉTER]`, SIREN `[À COMPLÉTER]`] prépare son SMSI et souhaite un devis de certification
> ISO/IEC 27001:2022. Périmètre : `[À COMPLÉTER]`. Effectif : `[À COMPLÉTER]`. Sites : `[À COMPLÉTER]`. Merci de
> préciser votre accréditation (organisme + n° + portée 27001), le déroulé Stage 1/Stage 2, les délais et le coût
> (audit initial + surveillance). — `[NOM, COORDONNÉES]`

## 7. Public aids — eligibility (honest, sources CONFLICT)
| Scheme | Status | Honest note |
|---|---|---|
| **MonAideCyber** (ANSSI, free diagnostic) | **eligibility CONFLICTED** | some sources: TPE/PME <250, artisans & professionnels, "no size/turnover condition"; others cited "≥2 salariés". The CTO-flagged mono-salarié/auto-entrepreneur restriction was **NOT corroborated** by readable sources; official monaide.cyber.gouv.fr was a JS shell in-session ⇒ **confirm directly before relying**. |
| Diag Cybersécurité (Bpifrance, €4,400 net) | PME vetting | brand-new solo entity practically unlikely to qualify |
| France Num self-diag / ANSSI guides | **free, no size floor** | usable by a solo entity now |
> **These are diagnostics/accompagnement — NOT certification.** A free diagnostic ≠ internal preparation ≠ an accredited
> audit ≠ a certificate. Do not conflate.

## 8. Recommended least-cost/fastest path (unchanged, confirmed)
**Scenario A — internal preparation at €0** (free guides + ODG engine → operated controls + dossier → READY_FOR_STAGE1)
then request devis from AFNOR (27001 scope **verified**) + 2 scope-verified CBs. Only AFNOR's 27001 scope is confirmed
today; verify others on COFRAC. **No contact/purchase without CTO authorisation.**

## Sources
tools.cofrac.fr/fr/easysearch, tools.cofrac.fr/annexes/sect4/4-0001.pdf, tools.cofrac.fr/.../fiche.php?entite_id=41000578,
certification.afnor.org, monaide.cyber.gouv.fr (JS shell), secondary MonAideCyber summaries. Accessed 2026-10-27.
