# ODG — CTO decision pack (V1, 2026-10-27)

The consolidated set of decisions that genuinely require a human act. For each: options · risks · available evidence ·
**ODG recommendation** (ODG does not decide for the CTO where a human act is required). No decision below has been taken.

## 1. Approve ISO policies (promotes readiness controls)
- **Options:** (a) approve all 8 DRAFT policies now; (b) approve the approval-type ones first, defer execution-type;
  (c) hold.
- **Risks:** approving ≠ operating — execution-type controls (clause 9 audit, clause 10 incident) still need a real
  drill/audit/incident (enforced in code).
- **Evidence:** `ISO_POLICY_APPROVAL_PACK_V1.md`; templates in `ISO_27001_POLICY_TEMPLATES_V1.md`.
- **ODG recommendation:** (b) — approve the approval-type policies (ISMS, access, logging, change, risk) to move those
  controls to SATISFIED; schedule the clause 9/10 execution work separately. Low risk, free, reversible.

## 2. Confirm the meaning of "CU"
- **Options:** Common Criteria/CSPN · Conditions d'Utilisation · EUCC · SecNumCloud/HDS · CSA STAR · "Cas d'Usage".
- **Risks:** acting on a wrong interpretation wastes effort / misleads a prospect.
- **Evidence:** `STANDARDS_OBLIGATIONS_REGISTER_V2.md` §"CU".
- **ODG recommendation:** CTO confirms in one word; ODG will not treat "CU" as identified until then.

## 3. Choose the selling legal structure + insurance
- **Options:** Micro-BNC · EI au réel · SASU (+ RC Pro).
- **Risks:** liability exposure (AI-governance advisory), VAT threshold, credibility with enterprise buyers.
- **Evidence:** `FR_BUSINESS_STRUCTURE_DECISION_V1.md` (verified 2026 thresholds).
- **ODG recommendation:** Micro-BNC to test the market (< 37 500 € HT, no VAT); move to SASU when contracts/liability
  justify it. RC Pro recommended under any structure.

## 4. ISO text access / cost
- **Options:** (a) AFNOR "Consultation libre" free read-only for **27001** (interactive session — not automatable by ODG);
  (b) buy ISO 42001 (CHF 225); (c) defer 42001.
- **Risks:** without clause text, ISO work stays principle/structure-level (not clause-referenced).
- **Evidence:** `ISO_ACCESS_AND_COMPLIANCE_REGISTER_V1.md`.
- **ODG recommendation:** do (a) now (free) to upgrade 27001 to clause-referenced; defer 42001 purchase until a client needs it.

## 5. Production dependencies
- **Options:** per dep (backup off-host, monitoring, KMS, multi-tenant, public exposure) — self-host vs managed vs defer.
- **Risks:** premature spend before a signed client; or being unready when a client requires it.
- **Evidence:** `PRODUCTION_DEPENDENCIES_SPEC_V1.md`.
- **ODG recommendation:** defer spend until the first pilot requires production; keep loopback-only until then.

## 6. Legal review of letters / prices / contract
- **Options:** (a) lawyer review before any send; (b) send as-is (NOT recommended).
- **Risks:** CNIL/GDPR prospection compliance, contract liability cap, VAT mentions.
- **Evidence:** `PROSPECTION_COMPLIANCE_CHECKLIST_V1.md` (CNIL full-text), `PROSPECTION_LETTERS_DRAFT_V1.md`, prices HYPOTHESIS.
- **ODG recommendation:** (a) — one legal review pass before the first outreach; cheap insurance.

## 7. Authorise the first outreach to identified prospects
- **Options:** (a) authorise contacting the 23 sourced candidates (after #6); (b) hold.
- **Risks:** reputational/legal if sent non-compliant or without legal review; opportunity cost if held.
- **Evidence:** `FIELD_CANDIDATES_REAL_V3.md` (real, sourced, REPÉRÉ/QUALIFIÉ; intent never assumed); validator
  `prospection-compliance.ts`.
- **ODG recommendation:** authorise AFTER #6 (legal review), starting with the 5–18 QUALIFIÉ, each draft passed through
  `validateOutreach`. **This is the single decision that converts all prepared work into a real pipeline.**

---
**Honest bottom line:** the launch is prepared as far as is possible without a human act, a paid resource, or a
production action. €500k remains a TARGET (dashboard NO_DATA; 0 signed/cashed). Nothing is certified, sold, or compliant.
