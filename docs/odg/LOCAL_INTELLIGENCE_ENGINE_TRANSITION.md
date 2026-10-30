# ODG LOCAL INTELLIGENCE ENGINE — Transition Note (reserved future program)

Per the CTO V107 mandate §5. **Status: RESERVED / NOT STARTED.** This records only the transition information needed
to resume into this program later. The current campaign is NOT diverted to begin it; official integration happens
after the present program is formally closed/passed under governance.

## Objective (as stated by the CTO)
Progressively replace all dependence on external AI providers with a LOCAL platform built on Ollama: specialized
models, autonomous agents, memory, routing, independent verification, and continuous campaigns.

## Why this is coherent with the existing substrate (what already exists to build on — do NOT re-build)
The repo already contains local-first primitives this program would compose (all ACCEPTED, see topic memory + register):
- **Local provider / routing:** `runtime/core/ollama-provider.ts`, `ollama-control-plane.ts`, `capability-router.ts`,
  `local-model-manager.ts`, `local-autonomy.ts`, `provider-live-call-gate.ts` (external calls fail-closed/gated).
- **Autonomous engineering executor (slice-1 ACCEPTED):** `engineering-executor.ts` deny-by-default ladder; slice-2
  (live injected executor over `delegate-isolation.applyProposal`) is the natural execution surface — **owner-gated (E1)**.
- **Continuous campaign:** `campaign-loop.ts` + `campaign-controller.ts` + `odg-campaign-run.ts` (proven multi-lot,
  resumable, fail-closed executor resolution).
- **Memory / evidence / verification:** `mission-evidence.ts` (false-success gate), `evidence-provenance.ts`,
  `patch-memory.ts`, independent-audit discipline; `code-execution.ts` real checkers.
- **Local code generation path:** `implementViaLocalProvider` (NOW fail-closed NO_VERIFIER — V106/PR#243).

## First natural consumer
The **NL-classifier negation-scope policy (D1)** is the first place a local semantic model would add value beyond the
deterministic heuristic (resolving prohibition-aside vs instruction-aside). That is a governance-POLICY decision (owner).

## Gating / guardrails to carry forward (unchanged)
- No external/billable provider call without authorization (`provider-live-call-gate` stays fail-closed).
- 9 permanent primitives; no 10th introduced to serve this program.
- Every model-authored change remains independently verified (ODG verifies; the model never gains authority).
- Deterministic governance remains the SSOT; the local model augments, never replaces, the fail-closed gates.

## Resume condition
Begins only after the current program is formally closed/passed per governance. To resume: read this note +
`AUTONOMOUS_FRONTIER_ANALYSIS.md` + `OWNER_GATED_DEPENDENCY_DOSSIER.md`, then scope slice-1 (a local model behind the
existing router/gate, measured against a held-out eval set) as a normal registered lot under the per-lot gate+audit cycle.
