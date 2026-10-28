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
| C-01 | **Multi-language syntax/type CHECK** (JS/TS/Python) — real toolchain, isolated, bounded | **VERIFIED** | `code-execution.ts`; live subprocess JS/PY PASS+FAIL, Go UNSUPPORTED (V45); suite 9 | Keep as a primitive-check; feed C-07 eval |
| C-02 | **Detection → routing decision** (EXECUTE / ROUTE_UNSUPPORTED / ABSTAIN) | **VERIFIED** | `code-mission-intake.ts`; suite 8; different repos → different routes (V45) | Wire into canonical mission intake (C-08) |
| C-03 | **End-to-end bounded REPAIR loop** — reproduce→bounded apply→real tests→independent acceptance→ACCEPT/rollback | **VERIFIED** | `repair-workflow.ts`; suite 15 + **live `node --test`**: fix→ACCEPTED, wrong-fix→ABSTAINED+exact rollback (V46) | Generalize to more task families (C-05) |
| C-04 | **General code GENERATION / synthesis** (model-produced changes) | **BLOCKED** | `provider-sandbox.ts` seam exists; `ODG_LOCAL_MODEL_CMD` **unset** ⇒ no authorized generative provider | Owner: authorize + configure a sandboxed local-model cmd; then build provider-sandbox→proposal→edits adapter |
| C-05 | **Next coding task families** (bug-fix from spec, add-tests, safe dep/config update, behavior-preserving refactor) | **NOT_STARTED** | repair-workflow harness is the substrate | Pick highest-value feasible family; reuse C-03 loop |
| C-06 | **Multi-language executable surface beyond JS/TS/Python** (Go/Rust/Java/SQL/shell/web) | **BLOCKED** (toolchain) | go/rustc/javac/ruby/php ABSENT in runtime (probed) | Install/authorize toolchains OR route to axis-D; keep UNSUPPORTED honest |
| C-07 | **Code-check EVAL family** (clean/broken fixtures per language; PASS/FAIL accuracy of the real exec path) | **NOT_STARTED** | separate from K-eval (V43, 7/7 synthetic) | Build sealed fixture corpus + independent evaluator |
| C-08 | **Intake→execution integration** into the canonical mission path | **NOT_STARTED** | C-02 routes but is not yet called by the live mission lifecycle | Find the lifecycle seam; wire route→code-execution/repair-workflow |
| C-09 | **Broad held-out, cross-language evaluation** (Layer D/E) | **NOT_STARTED** | broad-IT VERIFIED_SUCCESS_RATE = **NO_DATA** (honest) | Depends on C-05/C-07 corpora |

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
| G-01 | Owner-objective fidelity contract (preserve objective; forbid silent narrowing; forbid completion-claim while mandatory deliverables unverified; carry unresolved items across missions) | **NOT_STARTED** | Implement using existing CONTRACT/POLICY primitives + this register; no new primitive |
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
