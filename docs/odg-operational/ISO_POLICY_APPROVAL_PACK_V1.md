# ODG — ISO policy approval pack (V1, 2026-10-27)

For each DRAFT policy in `ISO_27001_POLICY_TEMPLATES_V1.md`: what the CTO is approving, and — critically — **what
approval does and does NOT satisfy.** **ODG does not approve on the CTO's behalf.** Approval + a gated code mechanism
promotes an **APPROVAL-type** control to SATISFIED; **EXECUTION-type** controls (clause 9 internal audit, clause 10
improvement/incident) stay NOT satisfied until a drill/audit/incident is actually performed with records (enforced in
`iso-operational-evidence.ts`: `EXECUTION_REQUIRED = {9,10}`).

| policy | objective & scope | responsible (required) | version/date | decisions to take | controls/evidence | consequence of approval | post-approval operational action still required |
|---|---|---|---|---|---|---|---|
| ISMS policy | commit to risk-based ISMS + improvement | CTO | v1 / [date] | scope, review cadence | Clause 5 (+ excellence-policy, governance-kernel) | Clause 5 ⇒ SATISFIED (approval-type) | none for clause 5; drives the rest |
| Access control | least-privilege bound access | CTO | v1 / [date] | privileged-access register owner | A.8.2/A.8.5 (+ agent-identity, harness, third-party-gate) | A.8.2/A.8.5 ⇒ SATISFIED (approval-type) | maintain privileged-access register |
| Logging & monitoring | tamper-evident logging + retention | CTO | v1 / [date] | retention period, review cadence | A.8.15 (+ audit-log) | A.8.15 ⇒ SATISFIED (approval-type) | **production monitoring A.8.16 stays EXTERNAL**; log-review is operational |
| Backup | backup + restore of critical stores | CTO | v1 / [date] | RTO/RPO, off-host target | A.8.13 (+ client-store-backup) | A.8.13 stays **PARTIAL_EXTERNAL** (off-host) | **EXECUTE a restore drill with records** (off-host = external) |
| Change mgmt / secure dev | governed change, no false success | CTO | v1 / [date] | change-log source of truth | A.8.25/A.8.28, Clause 8 | approval-type ⇒ SATISFIED | keep change log (git/PR as evidence) |
| Incident response & improvement | detect→recover→corrective action | CTO | v1 / [date] | incident register owner, SLA | **Clause 10 (EXECUTION-required)** | **approval alone ⇒ NOT satisfied** (APPROVED_PENDING_EXECUTION) | **handle/record a real incident + post-incident review** |
| Risk assessment & treatment | asset/threat/impact + residual-risk acceptance | CTO | v1 / [date] | risk appetite, residual-risk sign-off | Clause 6 | approval-type ⇒ SATISFIED | keep risk register current |
| Performance evaluation | internal audit + management review | CTO | v1 / [date] | audit schedule, auditor | **Clause 9 (EXECUTION-required)** | **approval alone ⇒ NOT satisfied** | **perform an internal audit + management review with records** |
| Statement of Applicability | per-Annex-A applicability + justification | CTO | v1 / [date] | applicability per control | all Annex A | scaffold only | **needs the licensed/consulted clause text for a complete SoA** |

**How to record an approval (promotes the control):** pass
`{ state: "APPROVED", responsible: "<name>", artifact: "<signed doc ref>" }` (or `"EXECUTED"` + a drill/audit/incident
record for clause 9/10) to `assessOperational`. Without responsible + artifact the claim is rejected (no fabrication).
