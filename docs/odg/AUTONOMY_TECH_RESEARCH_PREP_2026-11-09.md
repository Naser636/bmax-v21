# Autonomy Technology Research — Prep & Evaluation (CTO Deep-Autonomy §4, 2026-11-09)

**Evaluation-gated preparation. No module is built on the basis of this research** (§4). For each technique: what it is
(established SE/CS method, stated generically — no fabricated citations; live external research stays owner-gated), how
ODG already covers it, a utility assessment, V12.4 compatibility, and a verdict:
**COVERED** (already present) · **GAP→EVALUATE** (genuine gap, evaluate utility+compat before any build) · **NOT_COMPATIBLE**.

## 1. Autonomous code analysis

| Technique | ODG today | Utility | Verdict |
|---|---|---|---|
| Static dependency / call graph | `change-impact-graph`, `persistent-impact-graph` | high | **COVERED** |
| Architectural smell / duplication detection | `architecture-audit` (cycles / exact-dup-by-responsibility / unused) | high | **COVERED** |
| Capability inventory & maturity | `capability-map` | high | **COVERED** |
| **Spectrum-based fault localization** (rank suspicious lines by failing-test coverage) | partial — `rce-root-cause-intelligence` does layer/confidence, not coverage-spectrum ranking | medium | **GAP→EVALUATE** (only if a real localization miss is demonstrated; needs per-test coverage data ODG doesn't collect today) |

## 2. Automatic repair

| Technique | ODG today | Utility | Verdict |
|---|---|---|---|
| Deterministic rule-based fixers | `task-fix-json/exports/require/unused-imports`, `local-fixers` | high | **COVERED** (now self-tested end-to-end: `repair-autonomy-selftest`) |
| Root-cause-gated, write-set-confined planning | `repair-planner` | high | **COVERED** |
| **Delta debugging** (minimize a failing input/change to the culprit hunk) | not present | medium | **GAP→EVALUATE** (useful for large diffs; compatible with the patch-executor's hunk model; evaluate vs effort) |
| LLM/generative program repair | `generative-repair-adapter` + `generative-repair-eval` (adapter present; gated) | medium | **COVERED (gated)** — generative fixes must pass the same independent verify + escalate-on-fail; never auto-trusted |

## 3. Independent validation

| Technique | ODG today | Utility | Verdict |
|---|---|---|---|
| Adversarial re-derivation independent of self-tests | `mission-independent-validation` (28/28) | high | **COVERED** |
| Statistical significance / contamination | `eval-significance`, `benchmark-contamination` | high | **COVERED** |
| **Metamorphic testing** (relations that must hold across input transforms) | partial — `p1-differential-property` does property/shrinking | medium | **GAP→EVALUATE** (a natural extension of the differential-property module; evaluate before adding) |
| Flaky isolation | `flaky-replay-gate`, `flaky-ci-intelligence` | high | **COVERED** |

## 4. Error recovery

| Technique | ODG today | Utility | Verdict |
|---|---|---|---|
| Build recovery / rollback | `build-recovery-engine`, worktree + `cp -al` rollback drill | high | **COVERED** |
| Checkpoint / resume | checkpoint-resume engine, `odg-resume`, the Boussole | high | **COVERED** |
| Escalation on unrepairable defect | repair chain ESCALATES (proven in the self-test) | high | **COVERED** |
| Circuit breaker / dead-letter | `p12-circuit-breaker`, `p12-dead-letter-quarantine` | high | **COVERED** |

## 5. Memory & continuity

| Technique | ODG today | Utility | Verdict |
|---|---|---|---|
| Trust-gated retrieval (freshness + attribution) | `memory-trust-gate`, `memory-architecture` | high | **COVERED** |
| 5-family memory classification | `compounding-pattern-library` | high | **COVERED** |
| **Retrieval-augmented procedural memory** (surface the most-relevant past fix for a new defect) | partial — memories exist; no defect→past-fix retrieval index | medium | **GAP→EVALUATE** (could speed repair; compatible with the trust gate; evaluate ROI before building) |

## 6. Intelligent orchestration

| Technique | ODG today | Utility | Verdict |
|---|---|---|---|
| Critical-path / makespan scheduling | `engineering-scheduler` | high | **COVERED** |
| Coherent-delivery batching | `delivery-batch-coherence` | high | **COVERED** |
| Targeted validation selection | `validation-selector`, `targeted-verify` | high | **COVERED** |
| **Multi-agent parallelism** | evaluated → DEFERRED | — | **NOT_COMPATIBLE** today (background execution conflicts with the synchronous-foreground-only restriction) |

## 7. Continuous ODG improvement

| Technique | ODG today | Utility | Verdict |
|---|---|---|---|
| Frontier radar / weekly self-improvement | `frontier-radar*`, `frontier-weekly-report` | high | **COVERED** |
| Champion-challenger / experiment promotion | `champion-challenger-arbiter`, `optimization-experiment`, `frontier-lab-experiment` | high | **COVERED** |
| Compounding pattern library | `compounding-loop`, `compounding-pattern-library` | high | **COVERED** |

## Honest conclusion

ODG's autonomy stack is **broadly covered** by existing composable modules. The only genuine, V12.4-compatible **GAPs
worth evaluating** (never auto-building) are: **(a)** spectrum-based fault localization, **(b)** delta debugging for large
diffs, **(c)** metamorphic testing (as a differential-property extension), **(d)** defect→past-fix retrieval memory. Each
is a *candidate*, not a commitment — it is built only if a **real** miss is demonstrated and the utility beats the
added complexity (anti-gas-factory). Multi-agent parallelism stays NOT_COMPATIBLE under the current execution
restriction. No module is created from this research alone.
