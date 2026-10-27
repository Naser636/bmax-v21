# ODG — Automation & human-effort inventory (V1, 2026-10-27)

Mission G: which repetitive commercial/technical/compliance tasks are automatable **with existing mechanisms, no new
orchestrator, no new permanent primitive**. Prioritised by demonstrable time-saved × low risk. **No heavy infra for an
unvalidated sales hypothesis** — minimal, reusable, testable only.

## Already automated (gated, reusable now)
| task | mechanism | human-effort now |
|---|---|---|
| Niche/lead scoring (reproducible) | `niche-scoring` | set weights once |
| Proposal generation (fail-closed, anti-overclaim) | `proposal-generator` | supply verified scope/price |
| Pipeline tracking + anti-conflation | `commercial-pipeline` (12-stage) | record evidence per step |
| €500k scenarios + monthly model | `revenue-scenarios`, `revenue-schedule` | set assumptions |
| Cash/pipeline dashboard | `revenue-dashboard`, `pipeline-ledger` | — |
| SBOM / license / provenance / audit-log (delivery) | gated suites | scope + interpret |
| AI-Act role + prospection-compliance checks | `ai-act-role-classifier`, `prospection-compliance` | confirm facts |
| Certification readiness verdict | `certification-readiness` | approve/execute controls (human) |

## Candidate automations (ranked; only if a real gap + low risk)
1. **Lead-to-proposal glue** — feed a qualified lead's verified scope into `proposal-generator` → `commercial-pipeline`
   PROPOSAL entry. *Value:* removes manual re-keying. *Risk:* low (fail-closed). *Test:* round-trip lead→proposal→entry.
   **Status:** the pieces exist; a thin glue function is justifiable **once a real lead exists** — not before (avoid
   infra for an unvalidated hypothesis).
2. **Pilot-run driver** — one entry point chaining SBOM→license→provenance→audit-log on a repo (per `ASSURANCE_PILOT_KIT`).
   *Value:* reproducible delivery. *Risk:* low (synthetic input). **Status:** candidate; build when a first pilot is scoped.
3. **Dashboard snapshot export** — render `revenue-dashboard` + `commercial-pipeline.funnelTotals` to a dated file.
   *Value:* reporting. *Risk:* low. **Status:** nice-to-have; defer.

## Human-required (NOT automatable — by governance)
Send/sign (human-gated in `commercial-pipeline`); policy approval (human/CTO); execution-type ISO controls (real audit/
incident/restore with records); any external contact, purchase, signature, deployment, public exposure.

## Decision
**Do NOT build 1–3 now** — they are glue over existing, tested mechanisms and would be infra ahead of validated demand
(pipeline is empty). Build **lead-to-proposal glue (#1) + pilot-run driver (#2)** the moment a real lead / first pilot is
authorised. Until then the existing gated modules already minimise human effort to: assumptions, scoping, interpretation,
and the human-gated acts above.
