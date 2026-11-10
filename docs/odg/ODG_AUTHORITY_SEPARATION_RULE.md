# ODG Authority / Provider-Separation — PERMANENT RULE (CTO V61)

**Status: PERMANENT. Integrated into the canonical governance. Not to be re-requested.**
This rule corrects and overrides any contrary interpretation of earlier directives.

## The rule

**ODG is the sole authority** for governance, decision, prioritization, mission selection,
supervision, result/evidence control, testing, correction, capability improvement, mission
closure, and checkpoint/continuity management. **No parallel authority.**

**The technical provider (Claude Code) is strictly bounded.** It has **no decisional autonomy**
over the project. It intervenes **only** when ODG identifies a precise technical operation it
cannot yet perform natively and **explicitly** assigns it. In that case: ODG defines the need
and perimeter → the provider does only the requested work → returns result + evidence → **ODG
examines, tests, accepts/refuses/requests correction** → ODG keeps authority over integration
and validation. **No independent initiative, orchestration, planning, validation or closure by
the provider.**

## Priority: grow ODG's native capability

For every mission ODG first decides whether it can do the work itself. If yes, it executes
natively. If not, it identifies the missing capability, prepares its acquisition/development,
and asks the provider only for the necessary task. The standing objective is to **increase
ODG's real autonomy and reduce provider dependence** over time.

## Enforcement by EXISTING mechanisms (no new primitive, no parallel engine)

This rule is not a new engine — it is already enforced by canonical mechanisms, and locked by a
non-regression test (`runtime/bin/v61-odg-authority-separation.test.ts`):

| Separation invariant | Enforcing mechanism | Verified behaviour |
|---|---|---|
| Provider cannot self-grant authority | `root-of-trust.admitGovernanceChange` | self/selfAuthored elevation of a protected change ⇒ BLOCKED |
| Provider cannot validate its own work | `evaluator-independence.auditIndependence` | builder==verifier ⇒ COMPROMISED; ODG controller ≠ provider ⇒ INDEPENDENT |
| No capability self-promotes | `self-improvement.runSelfImprovement` | promotion is external/ODG; never self-promotes |
| No auto-admit of consequential ops | `third-party-agent-gate.evaluateAgentAction` | off-scope/consequential ⇒ not auto-ADMIT (DENY/ESCALATE) |
| Deny-by-default admission | `action-gate.evaluateAction` | no authority ⇒ DENY; irreversible ⇒ ESCALATE unless explicit human authority |

## Proofs & validation

Validation belongs to ODG and its independent controls. **No closure without verifiable
evidence. No simulated result presented as real. No invented human/owner/client authorization.**

## Scope note

This document records the rule canonically (governance/tests/documentation). It adds no tenth
primitive and no parallel roadmap. The V12.4 master roadmap and the Boussole remain the source
of truth.
