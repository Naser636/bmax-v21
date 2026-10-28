# ODG MASTER COMPLETION REGISTER — V46 General Software-Engineering Capability Program

**Canonical companion to `ODG_PROJECT_STATE.md` (the operational compass).** This is the single
structured register of significant work items for the owner's binding objective: a broadly capable,
highly autonomous software-engineering system, world-class as ambition, 100% verified success as
aspiration over an explicitly-evaluated, *widening* task population — and €500,000 NET collected cash
in the first 12 commercial months (target, never claimed without independent evidence).

States: `NOT_STARTED · IN_PROGRESS · IMPLEMENTED_UNVERIFIED · VERIFIED · BLOCKED · DEFERRED_WITH_REASON · REJECTED_WITH_REASON`.
A file existing, a test passing, a PR merging or CI going green is **not** evidence that a capability works end-to-end.

Opened: 2026-10-28 (V46). HEAD at open: `46b24bc` ≡ origin/main.

---

## PART A — CODING / IT EXECUTION CAPABILITY (the core objective)

| ID | Capability / outcome | State | Evidence | Next action |
|----|----------------------|-------|----------|-------------|
| C-01 | **Multi-language syntax/type CHECK** (JS/TS/Python) — real toolchain, isolated, bounded | **VERIFIED** (TS checker **fixed** V47b) | `code-execution.ts`; live subprocess JS/PY PASS+FAIL, Go UNSUPPORTED (V45); **V47b: TS checker now uses the resolved real `typescript/bin/tsc` (not the `npx tsc` decoy) + `detectToolchain` requires a clean exit-0 probe — TS clean PASS / type-err FAIL now correct; re-verified by C-07 eval**; suites 9+9 | — |
| C-02 | **Detection → routing decision** (EXECUTE / ROUTE_UNSUPPORTED / ABSTAIN) | **VERIFIED** | `code-mission-intake.ts`; suite 8; different repos → different routes (V45) | Wire into canonical mission intake (C-08) |
| C-03 | **End-to-end bounded REPAIR loop** — reproduce→bounded apply→real tests→independent acceptance→ACCEPT/rollback | **VERIFIED** | `repair-workflow.ts`; suite 15 + **live `node --test`**: fix→ACCEPTED, wrong-fix→ABSTAINED+exact rollback (V46) | Generalize to more task families (C-05) |
| C-04 | **General code GENERATION / synthesis** (model-produced changes) | **BLOCKED** (adapter PREPARED V47e) | `provider-sandbox.ts` seam exists; `ODG_LOCAL_MODEL_CMD` **unset**. V47e `generative-repair-adapter.ts` (suite 11) now PREPARES the bounded proposal→edits path: structured task contract + proposal validation (write-set/size/shape) → routes through the proven repair harness (ACCEPT/ABSTAIN+rollback); `invokeProvider` honestly BLOCKED (model not called, not faked) | Owner authorizes + configures a sandboxed local-model cmd; then wire `provider-sandbox.runProvider → parse → applyProposal` (one-lot activation) |
| C-05 | **2nd task family — "add characterization test from provided examples"** (proves the harness generalizes) | **VERIFIED** | `task-add-tests.ts`; suite 13 + **live `node --test`**: correct impl ⇒ ACCEPTED (test kept); wrong impl ⇒ ABSTAINED + rollback removes the red test (V46b) | — |
| C-10 | **3rd task family — "repair a reproducible failing test" (defined-but-not-exported symbol)** | **VERIFIED** | `task-fix-exports.ts`; suite 15 + **live `node --test`**: missing export ⇒ ACCEPTED (export added, test green); undefined symbol ⇒ UNSUPPORTED (no invention); non-export defect ⇒ ABSTAINED+rollback (V47a) | — |
| C-12 | **4th task family — "repair a broken relative require/import" (reproducible MODULE_NOT_FOUND)** | **VERIFIED** | `task-fix-require.ts`; suite 12 + **live `node --test`**: broken `./util` ⇒ rewritten to single candidate `./lib/util` ⇒ ACCEPTED; no candidate ⇒ UNSUPPORTED; >1 candidate ⇒ BLOCKED (no guess); still-failing ⇒ ABSTAINED+rollback (V48c). Registered in resolver FAMILY_PLAN | Add: safe dep/config bump (isolated, no network install), behavior-preserving refactor |
| C-06 | **Multi-language executable surface beyond JS/TS/Python** (Go/Rust/Java/SQL/shell/web) | **BLOCKED** (toolchain) | **Re-probed 2026-10-28 (V48): go, rustc, cargo, javac, java, sqlite3, psql ALL ABSENT** (ruby/php also absent V45). Only node/python3/tsc present ⇒ JS/TS/Python executable, all others UNSUPPORTED (never faked) | Owner authorizes toolchain install OR route to axis-D subcontracting; keep UNSUPPORTED honest. **Task-family breadth (C-10/C-12) advances independently of language breadth** |
| C-07 | **Code-check EVAL family** (sealed clean/broken/malformed JS/TS/Python corpus; measures the REAL checker) | **VERIFIED** | `code-check-eval.ts` (corpus cce-v1, sha256-stamped, 13 cases); suite 9 + **live real toolchain**: overall accuracy 1.0 (correctPass 6, correctFail 7, **0 false-pass, 0 false-fail**, 0 blocked). FOUND+FIXED a real TS-checker false-fail defect (see C-01). NOT a broad-IT rate — 13 cases, caveat enforced (V47b) | Grow corpus; add more languages when toolchains present |
| C-08 | **Intake→execution integration** into the canonical mission path | **IN_PROGRESS** (resolver now INVOKED on the real loader path) | V47c resolver + **V48a `mission-coding-integration.ts`: the real `mission-loader` stage now invokes `attachCodingResolution` (additive/best-effort, same pattern as the MissionContext block) → bounded read-only scan of authorizedPaths → `resolveCodingMission` → persists `runtime/generated/coding-resolution.json` (EXECUTE/ROUTE_UNSUPPORTED/ABSTAIN/BLOCKED, `executed:false`). Suite 11 + LIVE loader run (real `tsx mission-loader.ts <M>` ⇒ CodingRoute persisted, mission-plan.json unchanged, 145/145 regression).** | **Remaining (BLOCKED on architecture):** full execution-REROUTING — the executor consuming `coding-resolution.json` to actually run checks/repairs instead of the legacy patch path. **Precise dependency:** the canonical RuntimeContext emits only file/dir COUNTS (no file list/manifests), so stack detection needs either a RuntimeContext extension or the bounded-scan (added here). Larger lot, carefully gated |
| C-13 | **Repair-acceptance eval** (distinct from check accuracy): correct-accept / false-success / false-abstention | **VERIFIED** | `repair-eval.ts` (corpus repair-eval-v1, sha256, 6 cases); suite 8 runs the REAL builders + `runRepairWorkflow` + real `node --test`: correctAccept 3, correctAbstain 3, **false-success 0, false-abstention 0**, accuracy 1.0. Behaviour-wrong export ⇒ ABSTAINED (no false success). NOT check-accuracy / not broad-IT (V48d) | Grow corpus; add per-language once toolchains present |
| C-09 | **Broad held-out, cross-language evaluation** (Layer D/E) | **NOT_STARTED** | broad-IT VERIFIED_SUCCESS_RATE = **NO_DATA** (honest; check-accuracy 1.0/13 and repair-accept 1.0/6 are narrow, separate metrics) | Depends on larger C-07/C-13 corpora + more toolchains |

## PART B — MEASUREMENT & HONESTY

| ID | Item | State | Evidence |
|----|------|-------|----------|
| M-01 | Capability taxonomy A–R, 0 PROVEN client-service | VERIFIED | `capability-taxonomy.ts` (V41) |
| M-02 | Failure taxonomy (real session defects) | VERIFIED | `failure-taxonomy.ts` (V42) |
| M-03 | Sealed K-eval (7 synthetic cases, independent evaluator) | VERIFIED (narrow) | `k-eval.ts` (V43); **not** a broad-IT rate |
| M-04 | Broad-IT VERIFIED_SUCCESS_RATE | **NO_DATA** (measurement limit, not a stop-work) | — |

## PART C — GOVERNANCE / ANTI-DRIFT (§9)

| ID | Item | State | Next action |
|----|------|-------|-------------|
| G-01 | Owner-objective fidelity contract (preserve objective; forbid silent narrowing; forbid completion-claim while mandatory deliverables unverified; carry unresolved items across missions) | **VERIFIED** | `objective-fidelity.ts`; suite 12 across the 4 mandated scenarios — ACCEPT genuine completion, REJECT_FALSE_COMPLETION, VERIFIED-without-evidence rejected, blocked⇒carry-forward+unblock, SILENT_NARROWING detected; pure POLICY/EVIDENCE evaluator, no new primitive (V47d) | Wire into mission close/validation path (C-08) |
| G-02 | Objective-fidelity measure (original mandate vs write-set vs verified deliverables vs unresolved) | NOT_STARTED | After G-01 |

## PART D — RESEARCH (§7)

| ID | Item | State | Next action |
|----|------|-------|-------------|
| R-01 | World-class reference inventory (~26 verified → ~100 inspected) | IN_PROGRESS (~26) | Extend backlog; extract transferable principle + acceptance test per ref |
| R-02 | Six commercial specialties — evidence-based re-selection vs candidates (cloud/DevOps, AI-integration, data/BI, general dev, QA/reliability, integration/modernization) | NOT_STARTED | Primary-source demand research; distinguish vacancy≠tender≠search-interest≠paid demand |

## PART E — COMMERCIAL (A–F stay active) & €500k

| ID | Item | State | Evidence |
|----|------|-------|----------|
| E-01 | Six axes A/B/C/D/E/F active & invariant | VERIFIED (structure) | `portfolio-axes.ts`, dashboards (V23–V33) |
| E-02 | Qualified opportunity discovery (BOAMP/TED live) | VERIFIED (connector) / LOW-FIT | `bounded-http-client`, `ted-connector`, `tender-feed-connector` (V37–V39) |
| E-03 | Private-sector programmatic feed | **BLOCKED** (no free lawful API; portals form-only / aggregators paid) | source-registry (V40) |
| E-04 | Leads / proposals / contracts / invoices / **collected cash** | leads 0 · proposals 0 · signed 0 · **cash €0** | external/owner-gated |
| E-05 | €500,000 NET collected (12 mo) | **UNACHIEVED** (VOLUME-bound; ~€1.49M gross needed) | target, not guarantee |

---

**Carried-forward discipline:** no item above is closed by a new version starting. C-04/C-06/E-03 are
genuinely blocked (named blocker + unblock action). C-05/C-07/C-08/G-01/R-02 are the dependency-ready
next lots. Update this register and the compass after every significant lot.
