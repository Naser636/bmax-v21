# ODG — ISO/IEC 27001:2022 clause & Annex A matrix (structure-level self-assessment)

> **NOT_CERTIFIED — ODG prepares; an accredited body certifies. A passing test ≠ an operated control.**

Summary: SATISFIED 0 · MECHANISM_PRESENT 12 · external 7 · gap 0 / 19 rows.

| ref | title (structure-level) | status | gated code evidence | note |
|---|---|---|---|---|
| 4 | Context of the organization (4.1/4.2 incl. climate — Amd 1:2024) | MECHANISM_PRESENT | excellence-coverage, regulatory-assurance | climate relevance per Amd 1:2024 to be assessed with the text |
| 5 | Leadership & policy | MECHANISM_PRESENT | excellence-policy, governance-kernel | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| 6 | Planning (risk assessment & treatment) | MECHANISM_PRESENT | regulatory-assurance, excellence-policy | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| 7 | Support (resources, competence, documented info) | MECHANISM_PRESENT | audit-log | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| 8 | Operation (risk treatment in operation) | MECHANISM_PRESENT | mechanical-acceptance, governance-kernel | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| 9 | Performance evaluation (monitoring, audit, review) | PARTIAL_EXTERNAL | audit-log | internal-audit records + management review are operational/EXTERNAL |
| 10 | Improvement (nonconformity & corrective action) | MECHANISM_PRESENT | build-recovery-engine | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| A.5 (Organizational, 37) | policies, roles, supplier & cloud security, incident mgmt | MECHANISM_PRESENT | excellence-policy, third-party-agent-gate | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| A.5.7 | threat intelligence | EXTERNAL | — | operational threat-intel feed is EXTERNAL |
| A.6 (People, 8) | screening, terms, awareness, disciplinary | EXTERNAL | — | HR/people controls are organizational/EXTERNAL for a solo entity |
| A.7 (Physical, 14) | physical perimeter, equipment, media | EXTERNAL | — | physical controls EXTERNAL (hosting/premises) |
| A.8.2 | privileged access rights | MECHANISM_PRESENT | agent-identity, agent-governance-harness | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| A.8.5 | secure authentication | MECHANISM_PRESENT | agent-identity, third-party-agent-gate | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| A.8.13 | information backup | PARTIAL_EXTERNAL | client-store-backup | local backup proven; off-host encrypted backup + restore drill EXTERNAL |
| A.8.15 | logging | MECHANISM_PRESENT | audit-log, mission-scheduler | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| A.8.16 | monitoring activities | EXTERNAL | — | production monitoring/alerting EXTERNAL |
| A.8.24 | use of cryptography / key management | EXTERNAL | — | KMS/HSM custody EXTERNAL |
| A.8.25 | secure development lifecycle | MECHANISM_PRESENT | governance-kernel, mechanical-acceptance | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |
| A.8.28 | secure coding | MECHANISM_PRESENT | patch-executor-governance-guard | code mechanism gated; operational evidence (records/policy) NOT asserted ⇒ not satisfied |

> STRUCTURE-LEVEL: public ISO/IEC 27001:2022 clause/control numbering + Annex A themes (A.5 org 37, A.6 people 8, A.7 physical 14, A.8 technological 34). Normative clause TEXT NOT reproduced (paywalled; AFNOR free-consultation route not readable in-session).
> MECHANISM_PRESENT ≠ SATISFIED: a gated software test proves a code mechanism, NOT that the ISMS control is operated. SATISFIED requires asserted operational evidence (records/policy over time).
> Amd 1:2024 adds climate consideration at clauses 4.1/4.2 — relevance to be assessed with the licensed text.
> Annex A rows are representative, not the full 93 controls; a complete mapping requires the licensed/consultation text.
