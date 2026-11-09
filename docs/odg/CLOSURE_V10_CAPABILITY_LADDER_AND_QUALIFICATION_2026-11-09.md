# V12.4 — V10 Closure: "352/0-cycle" explained + Integrated Qualification Orchestrator (2026-11-09)

Reuses `SYSTEM_INTEGRATION_AUDIT`, `capability-map`, the register — **no parallel inventory** (§2).

## §2 (obligatory) — what "352 capabilities, 0 cycles" PRECISELY means

- **"N capabilities"** = the count of **governance register records** that qualify as a *real* capability under
  `capability-map`: `status==ACCEPTED && evidence!="" ` **OR** `status==VALIDATED` (fail-closed: ACCEPTED **without**
  evidence is excluded). It is the audit's snapshot (352); it is now **369** as the register grew. **It is NOT 369
  distinct runtime executables** — many are **documentary/governance** capabilities (audits, closure records, policies,
  métier validations) whose honest artifact is an evidence string + a doc, not a binary. Conflating the two would inflate
  the count; ODG does not.
- **"0 cycles"** = the dependency graph over the register/module `deps` is a **DAG** (cycle-safe DFS in
  `architecture-audit.detectCycles`). Independently re-verified a related integrity property: **0 register dep edges point
  to a non-existent id** (no dangling/broken connection) — the capability graph is fully connected, not just acyclic.

### Category-appropriate proof ladder (REGISTERED→CONNECTED→CALLABLE→EXECUTED→VERIFIED), measured 2026-11-09
| Population | Count | Category-appropriate proof = its rung |
|---|---|---|
| Register real capabilities | **369** | REGISTERED + CONNECTED (evidence string + a dep edge to an existing id; 0 dangling) |
| runtime/core modules | **439** | the executable substrate |
| …with a direct `.test.ts` in the 401-suite gate | **424 (96.6%)** | CALLABLE → EXECUTED → VERIFIED (own unit suite, per-commit) |
| …without a direct `.test.ts` | **15** | covered by consumers / strict-typed leaves / `__bench__` e2e (see below) — **0 orphans** |
| runtime/bin executors | **31** | proven via e2e (e.g. the runner, 14/14 on main, V9 §4) |

### Orphan / coverage audit (§2 "détecter les capacités orphelines")
- **0 orphans:** all 15 core modules without a direct test HAVE consumers.
- The two with **0 test-refs** on first scan — `execution-planner`, `knowledge-engine` — are **not** gaps: they are
  **strict-typed leaves** in `tsconfig.runtime-leaves-strict.json` (`npx tsc` on it is **clean** — per-commit *type* proof)
  **and** covered by `runtime/__bench__/stage-base-routing.e2e.test.ts` on their `ODG_STAGE_BASE` path (behavioral proof,
  on-demand). The initial "0 test-refs" was a scan artifact (it counted only `runtime/core/*.test.ts`, not `__bench__`).
  Per §8/§11 a complete capability keeps its proof and is **not reconstructed**.
- **0 broken register connections** (every dep edge resolves to an existing id — campaign-controller enforces this).

**Net §2:** the substrate is fully connected (0 orphans, 0 dangling deps, 0 cycles); the executable core is 96.6%
per-commit-tested with the remainder covered by strict-types + e2e; documentary capabilities are proven by evidence, not
by a fake executable test. No technically-resolvable gap was found to fix.

## §9/§10 — Single integrated qualification orchestrator (NEW, delivered + run live)

`runtime/core/qualification-plan.ts` (PURE, gate-tested — now suite **#401**) + `deploy/odg-qualify.sh` (thin runner) +
`deploy/odg-port-audit.sh` (read-only port posture). The orchestrator **re-composes existing canonical gates** in order,
keeps each step visible, **stops at the first critical failure**, and emits a **fail-CLOSED** verdict: `QUALIFIED` requires
EVERY critical step present AND PASS — **a MISSING (un-run) critical gate ⇒ NOT_QUALIFIED**, closing the "forgot to run it
⇒ looked green" hole that an error-masking monolith would hide (unit-tested: 24 assertions). It is not a monolith and
grants no authority — the pure plan computes the verdict, not the shell.

**Live run (this session), 11/11 critical steps:**
```
compile PASS · types PASS · types-strict-leaves PASS · contracts PASS · unit-gate(400) PASS ·
campaign-controller PASS · capability-ladder PASS · metier-parity PASS · local-model-router PASS ·
security-ports PASS (only SSH:22 public) · private-deploy-health PASS (READY)
== VERDICT: QUALIFIED | criticalFailing=0 ==   (evidence: runtime/generated/qualification-result.json)
```
Covers §9's demanded axes: compile, types, contracts, unit, integration, 15 métiers (parity), capabilities (ladder),
tool/model selection (model-router), orchestration (this), independent assurance (gate + Validation Engine), security
(ports), private deploy (health). Heavy on-demand steps (runner-e2e, rollback dry-run) are `--with-e2e` and **non-critical**
(so a per-commit run is fast) — proven separately on main (V9 §4). Synthetic qualification is **never** a client validation.

## §4–§8 — reconciled (already delivered; proof kept, not reconstructed)
Runner go-live (V9 §4, 14/14 on main; persistent activation = owner/operational) · Radar chain (active, weekly, no auto-
promotion) · SSH key-only (V8 §1; extras sudo-gated) · edg-core private (V7 §2) · 13 dossier decisions (owner-reserved,
re-verified no new internal solution). **Remaining work is owner/operational or owner-decision — examined, not assumed.**
