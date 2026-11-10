# V12.4 — LOT C: Multi-métier collective intelligence (composing metier-parcours) 2026-11-10

Under the V36 owner delegation, after V36 (merged), LOT C delivered. Improves the EXISTING metier-parcours (no new
orchestrator, V17–V23 not reopened) with collective intelligence: relevant-subset selection, dependency ordering,
contradiction detection, fail-closed consolidation, and a MEASURED collaboration gain.

## §5 architecture-rule disclosure
- **Existing reused:** metier-parcours (the 15 guarded métiers), plan-evaluator discipline.
- **Gap:** métier-parcours runs ONE métier per request; there was no governed way to select the relevant SUBSET for a
  multi-competency request, order them, cross-verify their results, and measure whether collaboration actually helps.
- **Change:** `runtime/core/metier-coordinator.ts` — a thin PURE coordinator (gate suite). **Complexity:** low (composes);
  **gain:** collective intelligence with fail-closed consolidation + measured benefit; **regressions:** none (gate green).

## Capability — `metier-coordinator.ts` (PURE, fail-closed, gate suite)
- **Relevant-subset selection:** `selectMetiers({competenciesNeeded})` picks only métiers whose competencies match (e.g.
  security+release ⇒ P3+P8), **never all 15 by reflex**; no match ⇒ nothing selected (clarify, don't run 15).
- **Dependency ordering:** topological; a cycle is flagged fail-closed.
- **Contradiction detection + FAIL-CLOSED consolidation:** any REJECT ⇒ overall REJECT; two métiers contradicting on the
  SAME subject (ADMIT vs REJECT) ⇒ **ESCALATE (cross-verification required, never resolved silently)**; all ADMIT ⇒ ADMIT.
- **Measured collaboration gain:** `collaborationGain(individual, collaborative)` — coordination is NOT assumed beneficial;
  a collaboration that does not beat the individual baseline is flagged (don't coordinate for its own sake).
Decision power stays in ODG; a métier never self-authorizes; the closed V17–V23 qualification is not reopened.

## Falsifications caught
only-relevant-subset selected (not 15) · no-match ⇒ nothing selected · topological order · cycle flagged · single REJECT
⇒ REJECT · same-subject contradiction ⇒ ESCALATE · all-ADMIT ⇒ ADMIT · collaboration gain measured (positive AND
no-improvement cases).

## Scope / provenance
`metier-coordinator` : REGISTERED + CONNECTED (composes metier-parcours) + CALLABLE (gate) + EXECUTED + **VERIFIED**
(falsifications). Not DEPLOYED/OPERATIONAL as a live router. Provider-authored framework (coordination control-logic
deterministic + fail-closed). Restrictions intact (no spend/secret/exposure/Docker/auto-delegation; Program C/D/E stay
PROPOSED except where this delegation authorizes the internal LOT work).

## Boussole + continuation
Register reconciled (new item `serie30-lotc-metier-coordination`). Under the delegation, the next lots are **LOT D (Radar
strategic intelligence)** and **LOT E (simulation/measured intelligence per-dimension)** — improving the existing Radar and
benchmarks, no new engines, selected by demonstrated dependency. Proceeding as budget allows; each remains governed
(discovery ≠ authorization, no self-promotion).
