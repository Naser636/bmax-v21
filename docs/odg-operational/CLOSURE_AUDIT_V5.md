# ODG — Independent closure audit (V5, 2026-10-27)

An independent adversarial auditor reviewed the launch-readiness corpus (code + docs) for over-claims and
DOCUMENTED/APPROVED/EXECUTED/CERTIFIED confusion. Findings + resolutions below. **Only real, safe, free, authorised
gaps were fixed.**

## Material finding (HIGH) — FIXED
**`iso-operational-evidence.ts` promoted a control to SATISFIED on APPROVED alone, even for controls that require
EXECUTED evidence.** Concretely, an *approved* incident/improvement policy (clause 10) — which demands a real
corrective-action/incident **record** — was promotable to SATISFIED. The A.5 organizational theme (folds in incident
management) had the same hole. (Clause 9 internal-audit and A.8.13 restore-drill were only accidentally safe by being
`external`.)
- **Fix:** added `EXECUTION_REQUIRED = {"9","10","A.5 (Organizational, 37)"}`; `requiredState(ref)` ⇒ these need
  `EXECUTED`, all others accept `APPROVED`. An APPROVED-only record on an execution-required control now stays
  `MECHANISM_PRESENT` with opState `APPROVED_PENDING_EXECUTION`.
- **Acceptance (now passing):** clause 10 APPROVED ⇒ NOT satisfied; clause 10 EXECUTED ⇒ SATISFIED; clause 5 APPROVED ⇒
  SATISFIED; A.5-org APPROVED ⇒ NOT satisfied. Suite `iso-operational-evidence.test.ts` **16/16**.

## Doc finding (MED) — FIXED
`ISO_27001_POLICY_TEMPLATES_V1.md` "How these become SATISFIED" implied APPROVED promotes incident/restore controls.
- **Fix:** qualified it — execution-required controls (clause 9/10, A.5, restore-drill) need `EXECUTED` with a real
  record; ODG never fabricates an approval/incident/restore test.

## Doc finding (LOW) — FIXED
`LAUNCH_READINESS_MATRIX_V2.md` AI-Act rows read "VÉRIFIÉ (official-summary)" which overstated vs the register (full text
unread).
- **Fix:** relabelled to "VÉRIFIÉ — dates only, official-summary (+ Art.113 authoritative mirror); full clause text
  unread; EUR-Lex direct = empty shell".

## Doc finding (LOW) — ACCEPTED (documented, not changed)
`PROPOSAL_EXAMPLES_V1.md` repeats firm price line-items; only the header + per-proposal "Honest terms" flag HYPOTHESIS.
Judged sufficient (prominent HYPOTHESIS banner + "no certification / no guarantee" in every variant); re-generating the
rendered per-line token is cosmetic. Watch-item, not a defect.

## Files assessed CLEAN by the independent auditor
`ISO_27001_CLAUSE_MATRIX_V1` + `iso-27001-clause-matrix.ts` (mechanism≠satisfied genuinely enforced; 0 SATISFIED by
default); `ISO_27001_OPERATIONAL_EVIDENCE_REGISTER_V1` (snapshot overclaims nothing); `FIELD_CANDIDATES_REAL_V2/V3`
(23 real companies, functions-only, purchase intent explicitly denied, no invented contacts, count reconciles);
`STANDARDS_OBLIGATIONS_REGISTER_V2` (ACCESS levels honest + granular); `REGULATORY_CLOSURE_V3` (honest about what was
readable; Art 113 labelled mirror); `PROSPECTION_LETTERS_DRAFT_V1` (BROUILLON/UNSENT, `[LEGAL REVIEW]`); closure criteria
"OUI" judged defensible (each carries a caveat; €500k stated NON-VALIDÉ).

## Verdict
The markdown corpus was assessed "unusually disciplined"; the single material defect was the code over-permissiveness,
now fixed and tested. **No SATISFIED status is claimed anywhere (0/19). No certification, sale, revenue or full
compliance is asserted.** The audit demonstrates that remaining work is bounded by human acts / paid resources /
interactive-or-production actions (see `CTO_DECISION_PACK_V1.md`).
