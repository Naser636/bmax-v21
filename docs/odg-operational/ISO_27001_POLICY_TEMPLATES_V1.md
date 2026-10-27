# ODG — ISO/IEC 27001 policy & register templates (DRAFT V1, 2026-10-27)

> **ALL DRAFT — NOT APPROVED. Templates generated from known facts to produce future operational evidence. A drafted
> template is NOT an approval and does NOT make any control SATISFIED** (see `iso-operational-evidence.ts`). Approval +
> a named responsible + dated signature are a **human (CTO)** act. `[À APPROUVER: responsable / date]` marks every point
> requiring a real human decision. No approval, incident, restore-test or security operation is fabricated here.

Each template maps to a MECHANISM_PRESENT row of `ISO_27001_CLAUSE_MATRIX_V1.md`; filling + approving one supplies the
APPROVED/EXECUTED artifact that promotes the row to SATISFIED.

## 1. ISMS policy (Clause 5) — DRAFT
- Purpose/scope of the ISMS; commitment to risk-based security + continual improvement.
- Reference to the code-level controls already gated (excellence-policy, governance-kernel).
- `[À APPROUVER: responsable / date]` · review cadence `[À DÉFINIR]`.

## 2. Access control policy (A.8.2 / A.8.5) — DRAFT
- Least-privilege, authenticated, bound access; mechanisms: `agent-identity`, `agent-governance-harness`, `third-party-agent-gate`.
- Privileged-access register `[REGISTRE À TENIR]`; review of access rights `[CADENCE À DÉFINIR]`.
- `[À APPROUVER: responsable / date]`.

## 3. Logging & monitoring policy (A.8.15 / A.8.16 / Clause 9) — DRAFT
- Tamper-evident logging via `audit-log` (hash-chain); what is logged, retention `[À DÉFINIR]`.
- **Production monitoring/alerting = EXTERNAL** (see `PRODUCTION_DEPENDENCIES_SPEC_V1`) — not claimed operational.
- Log-review record `[REGISTRE À TENIR]` · `[À APPROUVER: responsable / date]`.

## 4. Backup policy (A.8.13) — DRAFT
- Local backup proven (`client-store-backup`); **off-host encrypted backup + restore drill = EXTERNAL / to execute**.
- Restore-drill record `[À EXÉCUTER — ne pas déclarer sans preuve]` · RTO/RPO `[À DÉFINIR]` · `[À APPROUVER]`.

## 5. Change management / secure development (A.8.25 / A.8.28 / Clause 8) — DRAFT
- Governed change via `governance-kernel`, `mechanical-acceptance`, `patch-executor-governance-guard`; CI gate; no false success.
- Change log `[REGISTRE — git history + PR merges as evidence]` · `[À APPROUVER: responsable / date]`.

## 6. Incident response & improvement procedure (Clause 10) — DRAFT
- Detection → triage → recovery (`build-recovery-engine`, checkpoint/resume) → corrective action.
- **Incident register `[À TENIR — ne pas fabriquer d'incident]`** · post-incident review `[PROCÉDURE À EXÉCUTER]` · `[À APPROUVER]`.

## 7. Risk assessment & treatment register (Clause 6) — DRAFT
- Methodology (asset/threat/impact), risk register `[À REMPLIR AVEC DES RISQUES RÉELS]`, treatment decisions, residual-risk acceptance `[DÉCISION HUMAINE]`.
- `[À APPROUVER: responsable / date]`.

## 8. Statement of Applicability (SoA) — DRAFT scaffold
- One row per Annex A control: applicable? justification, status, evidence. **Requires the licensed/consulted clause
  text for a complete, accurate SoA** (AFNOR interactive consultation — not done in-session). Scaffold only.

## How these become SATISFIED
Fill a template → **CTO approves (signature + date + responsible)** → register the artifact → pass
`{ state: "APPROVED"|"EXECUTED", responsible, artifact }` to `assessOperational`. Only then does the matrix promote the
control. **Until then every control stays MECHANISM_PRESENT — this is deliberate honesty, not an omission.**
