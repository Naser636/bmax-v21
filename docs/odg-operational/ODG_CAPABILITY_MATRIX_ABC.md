# ODG Shared Capability & Dependency Matrix — Domains A / B / C

**As of:** 2026-10-25 · **Method:** read-only code inventory of the real runtime (3 parallel agents), not report filenames.
**Principle:** reuse existing `runtime/core` capabilities; build new code ONLY where the inventory found a genuine gap.

> Status legend: **IMPLEMENTED** (verified in real code) · **PARTIAL** (exists but incomplete) · **NEW-DEMO**
> (built this campaign as a shared-core demonstrator in `docs/odg-operational/shared-core`, not yet promoted into
> governed `runtime/core`) · **MISSING** (not built). File paths are relative to repo root.

---

## 1. Shared core — already in `runtime/core` (reuse, do NOT duplicate)

The inventory confirmed the shared core is **overwhelmingly already built** (Domain A 9/12, Domain B 11/13).
These are the reusable seams for all three domains:

| Seam | Owner (verified) | Status |
|------|------------------|--------|
| Identity / permissions / policy | `runtime/core/action-gate.ts:evaluateAction` (deny-by-default ALLOW/DENY/ESCALATE) + `capability-authorization.ts` (human-grant) | IMPLEMENTED |
| State / contracts / planning | `mission-contract-factory.ts:buildContract` (objective/authorized_paths/acceptance) + `patch-action-contract.ts` | IMPLEMENTED |
| Resolution / execution | `capability-executors.ts:resolve`+`EXECUTORS` · `capability-router.ts:route` · `capability-registry.ts` | IMPLEMENTED |
| Traces / proof / independent verification | `validation-engine.ts` · `economic-verification.ts:verifyEconomics` · `mechanical-acceptance.ts` · `objective-attribution.ts` | IMPLEMENTED |
| Resume / recovery / idempotence | `checkpoint-engine.ts:begin/interrupt` · `idempotency-guard.ts:admit/record` · `build-recovery-engine.ts:runRepair` · `odg-recover.ts` | IMPLEMENTED |
| Learning / regression prevention / memory | `patch-memory.ts` · `post-release-learning.ts` · `learning-chain.ts` · `incident-recurrence.ts` | PARTIAL (no auto lesson→test) |
| Observability / cost / security / audit | `evidence-provenance.ts` · `compliance-evidence-pack.ts` · `supply-chain-attest.ts` · `bash-command-governor.ts` | IMPLEMENTED |
| Capability allocation / dependency mgmt | `change-impact-graph.ts` (module deps) + `mission-synthesizer.ts` (goal decomposition) | PARTIAL (no work-item scheduler) |

## 2. Genuine gaps found — and what this campaign built

| Gap (from inventory) | Domain | Action taken this campaign | Proof |
|----------------------|--------|----------------------------|-------|
| No topological **work-item scheduler** (deps→parallel layers) | A | **NEW-DEMO** `shared-core/dep-planner.mjs` (`planLayers/schedule/sequentialOrder`) | `shared-core.test.mjs` 7 planner tests |
| No explicit **precision/recall/FP/FN confusion matrix** metric | B | **NEW-DEMO** `shared-core/eval-metrics.mjs` (`confusionMatrix`) | `shared-core.test.mjs` 4 confusion tests |
| No **confidence calibration** (Brier/reliability) | B | **NEW-DEMO** `eval-metrics.mjs` (`brierScore`, `reliabilityBins`) | `shared-core.test.mjs` 3 calibration tests |
| Executed **was-green-now-red regression comparator** | B | **MISSING** — documented as remaining (improvement-baseline.ts is the hook) | — |
| Auto **lesson→regression-test generation** | B | **MISSING** — documented as remaining | — |
| Generic **retry/backoff** primitive | A | **MISSING** — timeout/interrupt/bounded-repair exist; backoff not generalised | — |

All NEW-DEMO components are pure/deterministic and consumed by the demonstrators; **promotion into governed
`runtime/core` (TypeScript) is a separate authorized lot** (not done here — no governed-path write without ODG authority).

## 3. Per-domain demonstrators (all reuse the shared core)

| Domain | Demonstrator | Reuses | Verdict |
|--------|-------------|--------|---------|
| A — agents/complex automation | `shared-core/demo-orchestration.mjs` (sequence→layers, idempotent, safe-stop, no-false-success) | `dep-planner` | PASS |
| B — governance/reliability/eval | `shared-core/demo-eval.mjs` (golden set, confusion matrix, Brier, threshold gate) | `eval-metrics` | PASS |
| C — documents/reconciliation | `proof-reconciliation/run-pipeline.mjs` (10-step ingest→reconcile→verify→audit) | `eval-metrics` (verifier confusion cross-check) | PASS (verify recall/precision 1) |

Cross-domain reuse is **proven**: Domain-C's independent verifier imports Domain-B's `confusionMatrix`
(`verify-reconciliation.mjs`), and the Domain-A orchestrator schedules a C-shaped pipeline via the shared planner.

## 4. Dependency graph (campaign work items)

```
shared-core/dep-planner  ─┐
shared-core/eval-metrics ─┼─> demo-orchestration (A)
                          ├─> demo-eval (B)
                          └─> proof-reconciliation/verify (C) ─> run-pipeline (C) ─> integration-test (all)
```

`integration-test.mjs` is the non-regression gate over the whole graph: **6/6 suites green** (14 shared-core +
10 reconcile + 18 pipeline + 2 demos + e2e).

## 5. Reproduce everything

```
cd docs/odg-operational
node integration-test.mjs     # runs all A/B/C + shared-core suites, asserts each exits 0
```
