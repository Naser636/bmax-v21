# ODG — ISO/IEC 27001 operational-evidence register (V1, 2026-10-27)

Rendered from `runtime/core/iso-operational-evidence.ts` with **no operational evidence asserted** — the honest current
state. Every `MECHANISM_PRESENT` row needs an APPROVED or EXECUTED artifact (+ named responsible) to become SATISFIED.
Policy/register TEMPLATES to produce that evidence are in `ISO_27001_POLICY_TEMPLATES_V1.md` (all **DRAFT, NOT approved**).
Approval is a **human (CTO)** act — ODG does not self-approve.

# ODG — ISO/IEC 27001 operational-evidence assessment

> **NOT_CERTIFIED. DOCUMENTED ≠ APPROVED ≠ EXECUTED. ODG does not self-approve; approval is a human (CTO) act.**

Summary: SATISFIED 0 · MECHANISM_PRESENT 12 (of which documented-not-approved 0) · external 7 · gap 0 / 19.

| ref | title | status | op-evidence state | responsible | artifact | note |
|---|---|---|---|---|---|---|
| 4 | Context of the organization (4.1/4.2 incl. climate — Amd 1:2024) | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| 5 | Leadership & policy | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| 6 | Planning (risk assessment & treatment) | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| 7 | Support (resources, competence, documented info) | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| 8 | Operation (risk treatment in operation) | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| 9 | Performance evaluation (monitoring, audit, review) | PARTIAL_EXTERNAL | N/A | — | — | internal-audit records + management review are operational/EXTERNAL |
| 10 | Improvement (nonconformity & corrective action) | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| A.5 (Organizational, 37) | policies, roles, supplier & cloud security, incident mgmt | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| A.5.7 | threat intelligence | EXTERNAL | N/A | — | — | operational threat-intel feed is EXTERNAL |
| A.6 (People, 8) | screening, terms, awareness, disciplinary | EXTERNAL | N/A | — | — | HR/people controls are organizational/EXTERNAL for a solo entity |
| A.7 (Physical, 14) | physical perimeter, equipment, media | EXTERNAL | N/A | — | — | physical controls EXTERNAL (hosting/premises) |
| A.8.2 | privileged access rights | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| A.8.5 | secure authentication | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| A.8.13 | information backup | PARTIAL_EXTERNAL | N/A | — | — | local backup proven; off-host encrypted backup + restore drill EXTERNAL |
| A.8.15 | logging | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| A.8.16 | monitoring activities | EXTERNAL | N/A | — | — | production monitoring/alerting EXTERNAL |
| A.8.24 | use of cryptography / key management | EXTERNAL | N/A | — | — | KMS/HSM custody EXTERNAL |
| A.8.25 | secure development lifecycle | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |
| A.8.28 | secure coding | MECHANISM_PRESENT | NONE | — | — | code mechanism only; no operational evidence ⇒ not satisfied |

> DOCUMENTED ≠ APPROVED ≠ EXECUTED: a drafted template is not an approval; SATISFIED requires APPROVED or EXECUTED operational evidence with a named responsible + a concrete artifact.
> No approval, incident, restore-test or security operation is fabricated. Absent real operational evidence, controls stay MECHANISM_PRESENT.
> Responsible party for approvals/operation is a HUMAN act (CTO) — ODG prepares templates/registers, it does not self-approve.
