# ODG V5 — Third-Party Agent Governance: gap closure + compliance readiness (2026-10-26, €0)

CTO V5. Truth Lock entry HEAD=origin/main=1d4539b, clean, 5 stashes preserved. Budget €0; hermetic, no network, no
public exposure. 9 primitives + capability-router unchanged. Labels: `PROVEN`(test evidence) / `PARTIAL` / `ABSENT` /
`BLOCKED` / `EXTERNAL` (needs auditor/legal/insurer/cert body).

## §2 Gap matrix (read-only diagnostic → this lot closes the #1 gap)
| Required capability | State (entry) | This lot |
|---|---|---|
| Full orchestration + no-false-success (own runtime) | **PROVEN** (validation-engine, evidence gates) | reused |
| **Third-party agent integration + governance** | **ABSENT** (ODG governed only its OWN runtime — V4/C4 MVP blocker) | **CLOSED → PARTIAL-PROVEN** |
| Identity / permissions / isolation / trust boundary | PROVEN for own runtime (action-gate, capability-authorization, bwrap) | extended to external agents (gate) |
| Secrets / provenance / evidence integrity | PROVEN (evidence-provenance sha256, truth-lock) | reused (tamper-evident record) |
| Recovery / resume / rollback / idempotence | PROVEN (checkpoint-engine, idempotency-guard, odg-recover) | reused (budget circuit-break) |
| Auditability / evidence export | PARTIAL (compass, ledger) | gate emits per-action record |
| Multi-tenant / data isolation | **ABSENT** (single-tenant today) | NOT this lot — EXTERNAL/build |
| Perf / availability / cost-limits / abuse-resistance | PARTIAL (budget-ledger, limits) | gate enforces call/time budget |
| Compliance / independent evaluation | PARTIAL (internal) | dossier below; cert = EXTERNAL |
| Install / update / observability / ops | PARTIAL (systemd, runtime-identity) | unchanged |
| Post-mission learning + reuse | PROVEN (learning-chain, memory; reuse demonstrated V2→license-policy) | reused |
| Commercial delivery readiness (EU private) | PARTIAL (V4 portfolio) | linkage below |

## §3 External benchmark (primary, dated, scoped)
- **OWASP Top 10 for Agentic Applications 2026** (OWASP GenAI Security Project, pub. 2025-12-09, consulted
  2026-10-26) — ASI01-ASI10. Confidence HIGH (authoritative, versioned). Used as the control checklist.
- NIST AI RMF (Govern/Map/Measure/Manage) + NIST CSF 2.0 (Govern/Identify/Protect/Detect/Respond/Recover) —
  referenced as control families; full mapping is broader than this lot. Confidence MED (framework-level).
- EU AI Act autonomous-agent requirements (V4): append-only exportable audit trail (Art.19), decision-logic docs,
  human oversight+intervention, stop/override — the gate contributes the admission+evidence+human-gate+limits pieces.

## §5 Implemented lot — `runtime/core/third-party-agent-gate.ts` (+ 17-assertion security suite, gated 61/61)
A minimal GOVERNED INGESTION ADAPTER (not a new primitive/orchestrator): `evaluateAgentAction(proposal, contract,
state)` → `ADMIT | DENY | ESCALATE` + tamper-evident record. Executes nothing; ODG's EXECUTOR/action-gate remain the
enforcers. Deterministic, FAIL-CLOSED, no network.

### Control → OWASP mapping → test evidence (requirements → ODG controls → proof → gaps)
| OWASP ASI | Control in the gate | Test (PROVEN) | Residual / limit |
|---|---|---|---|
| ASI01 Goal Hijack | least-agency allowlist vs objective | off-allowlist tool ⇒ DENY | semantic goal-drift within allowed tools not detected |
| ASI02 Tool Misuse | allowlist + param-shape validation | malformed params ⇒ DENY | deep per-tool schema validation = future |
| ASI03 Identity/Privilege | agentId match + scope-confinement | wrong id / scope-escape / traversal / out-of-scope ⇒ DENY | real crypto auth (tokens are presence-checked) = EXTERNAL |
| ASI04 Supply Chain | hook to license-policy/supply-chain-attest | (reuse) | not wired in this lot |
| ASI05 Code Execution | gate never executes; bwrap governor enforces | (by construction) | sandbox-escape testing = separate suite |
| ASI06 Memory/Evidence | claimedEvidence recorded, NEVER trusted | evidenceTrusted:false proven | upstream memory-poisoning of the agent = out of scope |
| ASI07 Inter-Agent Comms | auth-token presence + binding | no token ⇒ DENY | real mTLS/signed-messages = EXTERNAL |
| ASI08/ASI10 Cascading/Rogue | hard call/time budget circuit-break | budget exhausted ⇒ DENY | cross-agent blast-radius modeling = future |
| ASI09 Human Trust | consequential/require-human ⇒ ESCALATE | 2 cases ⇒ ESCALATE (no auto-admit) | human-review UX = EXTERNAL |

**Independent verification:** the suite drives the REAL module through adversarial inputs; deny-first ordering proven
(a require-human tool NOT in the allowlist is DENIED, not escalated). Every verdict carries a sha256 tamper-evident
record. 17/17 PASS; root tsc 0; build:runtime 0 (dist closure incl. the new module); full gate 61/61.

## §6 Compliance readiness (honest — internal prep vs external validation)
- **Realizable by ODG (done/doable):** OWASP ASI01-03/06-10 admission controls with test evidence; append-only
  evidence record per action; human-escalation; fail-closed defaults; least-agency.
- **EXTERNAL dependencies (NOT ODG, NOT claimed):** real cryptographic agent authN (mTLS/signed tokens);
  multi-tenant data isolation; SOC2/ISO27001 audit; EU-AI-Act conformity assessment by a notified body; legal DPA +
  liability/insurance; an independent penetration test of the sandbox boundary (ASI05). **No certification is
  claimed; internal preparation ≠ external validation.**

## §7 Opportunity impact (C4 unlock)
This lot converts the V4/C4 "third-party-agent ingestion boundary = main build" from ABSENT to PARTIAL-PROVEN — the
single capability that gated C4 (audit-grade governance for *external* autonomous agents, EU-AI-Act driven,
CISO/compliance buyers, enterprise $2.5K-100K/yr). C4 remains product+GTM+capital+certification gated, but its
**core technical blocker now has a tested, OWASP-mapped foundation.** C1/C4/V4 portfolio preserved.

## Next lot (exact) + resume command
Next safe, authorized, dependency-available lot: **wire the ASI04 supply-chain hook** (route an agent's declared
dependencies/tools through `license-policy` + `supply-chain-attest`) + a **per-tool parameter schema** for ASI02
depth — both €0, hermetic, reuse existing modules. Resume: `tsx runtime/core/third-party-agent-gate.test.ts` then
extend with ASI04/ASI02-schema cases. BLOCKED-pending-authorization: real agent integration, public exposure,
multi-tenant, certification (all EXTERNAL/CTO).
