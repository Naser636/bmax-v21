# V12.4 — V37 §8: Intelligence loop — the capabilities really connected (LOCAL) 2026-11-10

CTO V37 LOCAL campaign (no push/VPS). §8 capstone: wire the EXISTING capabilities into ONE verifiable governed cycle so
the SYSTEM (not isolated components) demonstrates intelligence. No new capability; pure composition.

## Capability — `intelligence-loop.ts` (PURE, fail-closed, gate suite)
`runCycle(input, deps)` threads the real outputs: **DISCOVER** (roadmap-manager.intakeDiscovery) → **AUTHORIZE**
(roadmap-manager.authorizeDiscovery — EXTERNAL only) → **PLAN/DECIDE** (plan-evaluator, hard constraints first) →
**EXECUTE** (the governed pipeline, seam) → **RECORD** (mission-outcome-recorder → ledger, failure-inclusive) → **LEARN**
(calibration quality over accumulated outcomes) → **MEASURE** (one real scorecard dimension). Each step consumes the real
output of the previous; the AUTHORIZE step requires an external decision (the loop NEVER self-authorizes); any failed/
absent step halts the cycle fail-closed.

## Demonstrated (gate)
- A fully-authorized cycle completes end-to-end — the 7 steps connect: DISCOVER→AUTHORIZE→PLAN→EXECUTE→RECORD→LEARN→MEASURE.
- WITHOUT external authorization ⇒ the cycle STOPS at PROPOSED (never self-authorizes).
- A duplicate discovery ⇒ deduped, halts. No feasible plan ⇒ halts at PLAN (hard constraints). A FAILED execution ⇒
  recorded as a real FAILURE (the loop learns from failures too). No report ⇒ halts fail-closed at EXECUTE.

## Why it matters (§8)
An isolated component is not system intelligence. This loop proves the V31–V37 capabilities are REALLY connected into the
governed cycle DISCOVER→…→LEARN→MEASURE, with discovery open and execution governed throughout.

## Scope / provenance (LOCAL ladder)
`intelligence-loop` : REGISTERED + CONNECTED (wires 5 existing modules) + CALLABLE + EXECUTED + **VERIFIED (local gate)**.
NOT DEPLOYED/OPERATIONAL as a live autonomous loop (no live execution seam wired — that is an owner/VPS step, out of this
LOCAL campaign). Provider-authored framework. LOCAL commit only — NOT pushed, NOT origin/main, NOT VPS.
