# ODG — Métier Excellence Study (world references → comparison → build)

> **SÉRIE 13.** Per-métier P1–P15: current ODG capability, measured baseline, world references (dated, sourced,
> primary where possible), critère-by-critère comparison, demonstrated gaps, buildable opportunity, and a decision
> (INTEGRATE / IMPROVE / WATCH / REJECT). **Honesty:** no world-ranking, certification, or client result is invented;
> reputation ≠ technical superiority; external content is untrusted data. Where an improvement is buildable locally, a
> prototype + test is built and linked. Appended métier-by-métier; this doc is the canonical study (no parallel registry).

---

## P1 — Software / Full-Stack (autonomous software engineering)

1. **ODG capability.** `profession-p1-fullstack-reference.ts` — behaviour-preservation via a sealed characterization
   baseline (`characterization-baseline`): a refactor is safe only if observed behaviour is preserved; coverage gap ⇒
   INCOMPLETE (fail-closed). Reinforced by `change-impact-graph` (dep/impact), `objective-fidelity`, repair modules.
2. **Baseline (measured).** Behaviour-preservation verdicts are deterministic + reproducible; `change-impact-graph`
   now returns the real TS dependency graph (fixed SÉRIE 12). No SWE-bench-style issue-resolution score is claimed
   (ODG does not run a live model on SWE-bench — that is an owner-gated E5 experiment).
3. **World references (dated, sourced).**
   - **SWE-bench Verified** — gold-standard issue-resolution benchmark; top agent (Claude Mythos Preview) 93.9%, Opus 4.7 87.6%, GPT-5.3 Codex 85% (late May 2026). [demandsphere radar; Beyond SWE-Bench 2026]
   - **Critical finding:** ~**19.78%** of "solved" SWE-bench Verified cases are **semantically wrong** — pass the stated test yet functionally incorrect. [arXiv 2609.08149 SWE-Bench Pro Verified; Beyond SWE-Bench 2026]
   - New complementary benchmarks: SWE-Chain (release-level upgrades, arXiv 2605.14415), SWE-Touch (user edits, 2608.02499), SWE-Cycle (2605.13139), ChainSWE multi-bug (2607.02606), DeNovoSWE (repo-from-scratch, 2606.10728).
   - "Reality is the final verifier" — agents over-trust self-reports; real execution is the oracle (arXiv 2609.12039).
4. **Comparison (critère by critère).**
   | Critère | World best | ODG | Verdict |
   |---|---|---|---|
   | Issue-resolution rate | 85–94% (live models) | not run (owner-gated E5) | ODG does not compete here without a live-model experiment |
   | Semantic correctness of a "solved" fix | ~19.78% semantically wrong even at the top | **behaviour-preservation is the gate; held-out change ⇒ not safe** | **ODG's doctrine directly targets this gap** |
   | Over-trust of green tests | a known failure mode | "green build never sufficient" + characterization | ODG aligned |
5. **Demonstrated gap.** ODG's P1 reference checked behaviour-preservation but did not explicitly COMBINE the
   stated-test signal with the characterization signal to name the "passes-tests-but-semantically-wrong" case.
6. **Opportunity (built).** `p1-semantic-regression-guard.ts` — SAFE only when stated-tests-pass AND held-out
   behaviour preserved; tests-pass + behaviour-changed ⇒ **SEMANTIC_REGRESSION** (the 19.78% case), fail-closed.
7. **Prototype.** Built + tested (`p1-semantic-regression-guard.test.ts`, 7 assertions). Composes P1's baseline; no new engine.
8. **Tests/benchmarks needed.** A live-model SWE-bench run to quantify how many agent "fixes" the guard would catch is
   an owner-gated E5 experiment (real model, real repos) — NOT_RUN; documented, not faked.
9. **Results.** The guard deterministically flags the semantic-regression failure mode on synthetic before/after sets.
10. **Decision: INTEGRATE** (the guard, local + synthetic) + **WATCH** (a live SWE-bench E5 experiment — owner-gated).

---

## P2 — AI / ML / Agentic

1. **ODG capability.** `profession-p2-ai-reference.ts` — held-out (leakage-free) quality via `benchmark-factory` +
   prompt-injection resistance via `frontier-radar.sanitizeExternal`; `third-party-agent-gate` (ADMIT/DENY/ESCALATE).
2. **Baseline.** Held-out accuracy + injection-refusal are deterministic; contamination/metric-gaming flagged.
3. **World references.** τ-bench **pass^k** across k independent rollouts (single-pass overstates reliability); BFCL
   (AST / executable / irrelevance tracks); **NIST AI Agent Standards Initiative (Feb 2026)**; OWASP LLM/Agentic Top-10.
4. **Comparison.** ODG had held-out accuracy but **no reliability-under-repetition** metric; τ-bench's pass^k is the
   frontier reliability standard. Injection resistance: ODG aligned (sanitizeExternal + quarantine).
5. **Gap.** No pass^k reliability metric — a single-pass accuracy can hide flakiness.
6. **Opportunity (built).** `p2-passk-reliability.ts` — pass^k (reliable only if ALL k rollouts pass, fail-closed) +
   `reliabilityDrop = pass^1 − pass^k` exposing hidden flakiness; names flaky tasks.
7. **Prototype.** Built + tested (8 assertions). Complements held-out eval; no new engine.
8. **Tests/benchmarks needed.** A live-model multi-rollout run on τ-bench-style tasks is an owner-gated E5 experiment.
9. **Results.** Deterministically distinguishes a reliable task set (pass^k=1) from a flaky one (pass^1=1, pass^k<1).
10. **Decision: INTEGRATE** (the metric) + **WATCH** (live τ-bench E5 — owner-gated).

---

*P3–P15 appended in subsequent lots.*
