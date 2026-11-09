# V12.4 — M-CH1-02 Central Intelligence: Memory & Contextual-Intelligence Audit (2026-11-09)

**CTO Central Intelligence directive §5/§6/§8.** M-CH1-02 (`memory-architecture.ts`) is already VALIDATED; this deepens it
with the §5 twelve-scenario battery over the REAL memory modules (no new memory system — §4). Truth Lock `main @ d2bbc9b`;
preservation intact (5 stashes / 6 untracked).

## §1/§4 — Existing memory/knowledge layer (audited, not rebuilt)

Working/mission/decision/skill/error/evidence/outcome memory are already present across: `memory-architecture`
(trust-gated access router), `memory-trust-gate` (freshness + attribution), `memory-taxonomy`, `compounding-pattern-
library` (5 families + fact/hypothesis classification), `decision-precedent` (cross-mission goal-keyed decision reuse),
`patch-memory` (validated-repair reuse), `learning-reuse-proof` / `learning-chain` / `learning-loop`, `knowledge-engine`,
`mission-context-builder` / `project-context-engine` / `runtime-context-loader` (context assembly), `rce-root-cause-
intelligence` / `p2-flaky-root-cause` (error memory), `customer-outcome-intelligence` (outcome memory). **No tenth system
imposed** — the canonical categories exist.

## §5 — Twelve mandatory scenarios (RESULTS, reproducible — `memory-scenario-battery.ts`, 12/12)

| # | Scenario | Real module(s) | ✓ |
|---|---|---|---|
| 1 | retrieve a relevant prior decision (cross-mission, goal-keyed) | decision-precedent | ✓ |
| 2 | reuse a validated repair | patch-memory | ✓ |
| 3 | retrieve past mission evidence (by family) | memory-architecture | ✓ |
| 4 | distinguish old/stale from current (stale excluded) | memory-trust-gate | ✓ |
| 5 | detect two contradictory pieces of knowledge | (contradiction logic) | ✓ |
| 6 | a hypothesis is never a fact | compounding.classifyMemory (quality-gated) | ✓ |
| 7 | preserve context after interruption (deterministic recall) | decision-precedent | ✓ |
| 8 | transmit context across métiers (grouped, provenance kept) | memory-architecture | ✓ |
| 9 | retrieve a provider's limits (undeclared capability denied) | provider-capability-contract | ✓ |
| 10 | use a benchmark result in a decision (failed bench ⇒ REJECT) | (benchmark→decision logic) | ✓ |
| 11 | a simulation is never promoted to a real result | customer-outcome-intelligence | ✓ |
| 12 | deny-by-default on access (empty trustedAuthors ⇒ nothing trusted) | memory-architecture / trust-gate | ✓ |

10 of 12 scenarios exercise a real memory module end-to-end; 2 (contradiction, benchmark→decision) are honest logic
demonstrations. The non-negotiable rules are enforced: **a memorized item is never a current proof, a hypothesis is never
a fact, a simulation is never a real result, stale/obsolete info is excluded, every access is deny-by-default.**

## §3 — Connections

The memory layer connects to: the Boussole/V12.4 (register-derived), the 15 métiers (per-métier memory via
decision-precedent/patch-memory), capability-map/registry (capability knowledge), cognitive-decision (decision memory),
the Radar/Frontier Lab (compounding-pattern-library feeds frontier-radar), provider-capability-contract (provider limits),
repair/recovery (patch-memory + rce-root-cause), Customer Outcome Intelligence (outcome memory), benchmarks (eval-
significance feeding decisions). Provenance is preserved through the trust gate; no data leak (deny-by-default on
attribution).

## §6 — Autonomous intelligence (honest)

ODG natively retrieves knowledge, reuses validated repairs/decisions, distinguishes fact/hypothesis/simulation, preserves
context across interruption, and respects Truth Lock on every access — demonstrated by the battery + `repair-autonomy-
selftest`. **Honest residual (from the System Integration audit): Stage-E — ODG cannot yet autonomously AUTHOR novel
modules without Claude Code**; it retrieves/reuses/decides natively but novel code authoring escalates to the provider.
Native vs provider is measured, not hidden.

## §8 — Deliverables & §9 continuation

Truth audit (this doc) · demonstrated connections · native capabilities · the 12-scenario battery (12/12, in `test:report`) ·
no real defect found (3 first-pass flags were probe-shape errors, fixed by reading the module behavior) · residual =
Stage-E autonomy · register/Boussole updated. **§9 continuation note:** M-CH2-01 (`metier-baseline`), M-SEC-01
(`security-control-plane`), M-BENCH-01 (`benchmark-contamination`) are **already VALIDATED** (28/28 manifest missions);
the canonical order is satisfied. Memory is NOT declared "fully autonomous" on unit tests alone — it is demonstrated in
the composed scenario battery + used in the real repair-autonomy and métier chains.
