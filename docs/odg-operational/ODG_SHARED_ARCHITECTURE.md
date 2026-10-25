# ODG Shared Architecture & Common Contracts (A / B / C)

**As of:** 2026-10-25 · Companion to `ODG_CAPABILITY_MATRIX_ABC.md`.

One core, three domains. This defines the common interfaces so A, B and C reuse the same mechanisms once.

---

## 1. Interface seams (contract between domains and core)

| Seam | Contract (inputs → outputs) | Core owner | Demonstrator consumer |
|------|------------------------------|------------|----------------------|
| **Work-item scheduling** | `items[{id,deps,domain}]` → `layers[][]` (parallel) / `order[]` / `schedule` | `dep-planner.mjs` (demo) ↔ future `runtime/core` | demo-orchestration (A) |
| **Independent verification** | `(produced, groundTruth)` → `{verdict, reasons, confusion}` | `validation-engine.ts` / `mechanical-acceptance.ts` | verify-reconciliation (C), demo-eval (B) |
| **Eval metrics** | `(predicted[], expected[], keyOf)` → `{TP,FP,FN,precision,recall,f1}`; `samples` → Brier | `eval-metrics.mjs` (demo) | demo-eval (B), verify (C) |
| **Authorization** | `(action, context, grant)` → `ALLOW/DENY/ESCALATE` | `action-gate.ts` + `capability-authorization.ts` | (governed; demos honour deny-by-default conceptually) |
| **Provenance/evidence** | `(artifact)` → `{sha256, sourceRevision}`; pack → verifiable bundle | `evidence-provenance.ts` + `compliance-evidence-pack.ts` | reconciliation `_src` stamps (C) |
| **Idempotence/resume** | `(key, version, journal)` → `ADMIT/DUPLICATE/CONFLICT` | `idempotency-guard.ts` + `checkpoint-engine.ts` | demo-orchestration effects ledger (A) |

## 2. Shared capability registry (entry schema)

Every shared capability carries: stable **id**, single **responsibility**, **interface**, **deps**, **tests**,
logical **owner**, **evidence**. Example entries:

```
{ id: "shared.scheduler.plan-layers", responsibility: "topological work-item scheduling",
  interface: "planLayers(items)->layers", deps: [], tests: "shared-core.test.mjs (7)",
  owner: "shared-core/dep-planner.mjs", evidence: "integration-test suite 1", status: "NEW-DEMO" }
{ id: "shared.eval.confusion-matrix", responsibility: "precision/recall/FP/FN",
  interface: "confusionMatrix(pred,exp,keyOf)->{TP,FP,FN,...}", deps: [], tests: "shared-core.test.mjs (4)",
  owner: "shared-core/eval-metrics.mjs", evidence: "verify-reconciliation confusion cross-check", status: "NEW-DEMO" }
{ id: "core.verify.validation-engine", responsibility: "fact-based mission verdict",
  interface: "SUCCESS/PARTIAL/BLOCKED", deps: ["evidence","contract"], tests: "runtime suites",
  owner: "runtime/core/validation-engine.ts", evidence: "inventory B#2", status: "IMPLEMENTED" }
```

## 3. Non-duplication rule (enforced this campaign)

New shared code was added **only** for the two capabilities the inventory proved MISSING (work-item scheduler,
confusion-matrix/calibration). Everything else (authorization, contracts, verification, idempotence, provenance,
checkpoint/resume, incident lifecycle) **reuses** existing `runtime/core` — no parallel re-implementation.

## 4. Architecture constraints honoured

- No new JavaScript runtime introduced; demonstrators are plain Node ESM in the operational workspace.
- Governed `runtime/core` (TypeScript, dual-tsconfig migration rules) was **not modified** — promotion of the two
  demo primitives into `runtime/core` is a separate authorized TS-port lot.
- No duplicated ports; shared-core demos are additive and isolated under `docs/odg-operational/shared-core`.

## 5. Contract test

`integration-test.mjs` asserts a shared-core change breaks no domain (6/6 suites green). This is the guard that a
future edit to `dep-planner`/`eval-metrics` must keep green before promotion.
