# Screenplay — Acceptance Criteria + Stopping Condition (bounds the iteration) — 2026-10-24

Per CTO: establish explicit acceptance + a stop condition; do NOT loop indefinitely over model scores.

## Acceptance criteria (feature draft)
1. Runtime estimate **≥ 55 min** (target 60; tolerance −5).
2. Independent feature critique **≥ 7/10**.
3. Structural/continuity checks PASS (acts, scene count, roster, arc setup→payoff, cosmology, proverb discipline).
4. The documented feature failures addressed: sustained antagonist; non-repetitive escalating midsection; Tove
   arc paid off; dialogue de-aphorised (≤4 load-bearing aphorisms; no exact arc-line repeat).
5. Story, arcs, and ending UNCHANGED from the approved spine (no unauthorized rewrite of outcome).

## Stopping condition (hard, bounded — no infinite loop)
- Iterate at most **TWO F3 critique rounds** (F3, then F3.1 if needed).
- STOP iterating when (1)+(2)+(3)+(4) are met **OR** after the 2nd round, whichever first.
- A 7/10 is **sufficient** to proceed to human read; do **not** chase marginal gains above 7.
- On stop, FREEZE the draft for the **mandatory human creative read** — the model score is a de-risking proxy,
  NOT the final arbiter of quality. Production remains separately gated on the `12` approval.
- If after 2 rounds the draft is still <7/10 or <55 min, STOP anyway and report the exact remaining gap +
  whether it needs a human writer pass (do not keep spending turns on model-score churn).
