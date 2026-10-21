# ODG Autonomy-Excellence Campaign — 7-Day Horizon (tracking doc)

**Start:** 2026-10-21. **Truth Lock @ start:** HEAD `fd136e1` = origin/main, clean tree, 5 stashes, protected ROADMAP intact.
**Nature:** a DRIVEN, resumable campaign (see Day-1 continuation finding) — not an unattended auto-runner. Each session resumes from canonical state. This doc is the campaign tracker; the canonical boussole stays `ODG_PROJECT_STATE.md`. No competing registry/queue/primitive is created.

## Day 1 — Real state · cartography · research · gap inventory

### Established (verified)
- **Truth Lock:** `fd136e1`, clean, 5 stashes, branch synced.
- **VPS/services:** healthy — up 14d, load 0.42, 13 GiB mem free, disk 12%, no failed units; `odg-preprod` + `fleet-bridge` active; `odg-healthcheck.timer` (~30s) + `odg-monitor.timer` (10min) active (health/observability, read-only — NOT mission execution).
- **Dashboard/supervision:** active+enabled, MainPID = sole loopback :3000 listener, health 200, runtime-identity CONSISTENT (served == current `hbTMmA`).
- **Continuation mechanism (VERIFIED, with honest limit):** a persistent canonical state + mission queue exists; `odg-status` deterministically selects the next authorized mission (`Next Mission = AUTONOMY_LIVE_PROOF/ALP_1`, Queue Remaining 24) from real state + dependencies; mission-ledger proven-gate prevents false re-runs. **LIMIT:** there is NO scheduler/cron that autonomously EXECUTES missions unattended — mission execution is DRIVEN (resumed each session). Health/supervision are unattended; mission execution is not. ⇒ A "7-day unattended run" is NOT a demonstrated capability; a *resumable driven campaign* is. Building an unattended mission-runner is a consequential autonomy escalation → requires explicit CTO authorization (human decision), not a silent repair.
- **End-to-end NL chain (demonstrated, dry-run):** FR "analyse l'état du runtime … sans rien modifier" → DRY_RUN · intent ANALYZE · admission ALLOW · effect NONE · constraint "sans rien modifier" captured · 0 provider/external/write side-effects · contract via mission-synthesizer (reuse). Open-ended analysis routes to `external-ai`→BLOCKED in dry-run (honest capability boundary).
- **Multilingual safety (from prior lot @`fd136e1`):** negation-inversion fixed (clause-scoped guard), coverage 25/25, 21 negation-safety assertions locked.

### Targeted research (§2) — consulted 2026-10-21
- *"Characterizing False Success in LLM Agents"* (arxiv 2606.09863) — false success = 44–75.8% of agent failures; reasoning models don't protect (79% false-success). **Applicability:** confirms ODG's no-false-success priority.
- *"Self-Evaluation Bias … Externally Grounded Verification in Long-Running Agent Loops"* (arxiv 2607.25152) — self-eval bias; need externally-grounded verification. **Applicability:** validates ODG using independent, substrate-grounded verification over self-judgment; relevant to the loop/continuation gap.
- *Multi-agent validation (execute/verify/approve separation)* + *substrate-level verification (resolve completion claims against state the agent didn't author)* — **ODG already implements both:** executor → validation-engine (independent, deterministic, evidence-based — not an LLM judge) → mission-ledger proven-gate; present-state-reconciliation re-runs acceptance tests against the real source tree (sha256), independent of the agent's claim.
- **Net:** ODG's anti-false-success architecture is aligned with 2026 state-of-the-art. No new paid dependency/service warranted.

### Cartography — DONE (2 read-only agents)
**9 permanent primitives → code (grounded):** STATE (state-transition + runtime-model), CONTRACT (capability-registry + mission-contract-factory + CAPABILITY_EFFECT), POLICY (governance-kernel + action-gate + capability-authorization), RESOLVER (decision-engine + capability-router + nl-objective-gateway), EXECUTOR (capability-executors resolve/EXECUTORS), EVIDENCE (validation-engine + present-state-reconciliation + evidence-provenance), RECOVERY (checkpoint-engine spine + build-recovery-engine + odg-recover) — all **WIRED+TESTED**. ALLOCATOR: budget-contract + live-cost-metering WIRED+TESTED; budget-ledger tested but live-wiring indirect. **IDENTITY (truth-lock.ts): DECLARED-ONLY** relative to the odg-run/mission-cli pipeline + (was) no dedicated test.
**Capability wiring:** EXECUTORS ↔ CAPABILITY_EFFECT is a strict 1:1 (10 executors, enforced by contractConformance + dispatch-authorization-invariant). Registry namespace (187 proven + 26 missing mission IDs) is deliberately disjoint from the 10 execution units.

### Prioritized gap inventory (gravity × probability × impact × reversibility)
| # | Gap | Severity | Risk to fix | When |
|---|---|---|---|---|
| 1 | **Evidence-probe absent for 3 CONSEQUENTIAL executors** (ODG Synthetic Deliverable, Provider Activation, Implement Via Local Provider) — outcomes checked only for artifact non-emptiness (evidenceOk), not semantically ⇒ no-false-success weakness | HIGH | MEDIUM (behavior change: fail-closed probe; needs per-executor evidence analysis to not regress legit runs) | **Day 2** (contracts/executors wiring) |
| 2 | **IDENTITY primitive (truth-lock) untested** | MED | NONE (pure fn, test-only) | **DONE Day 1** ✓ |
| 3 | **IDENTITY not wired into the mission pipeline** (truth-lock only reaches migrate-ts tooling, not odg-run) — the automated pipeline doesn't programmatically verify repo/worktree truth before executing | MED | MEDIUM (new pipeline stage) | Day 2/6 (evaluate: wire a pre-flight Truth-Lock gate vs keep operational-only) |
| 4 | **run() dispatch untested**: Provider Activation run() never exercised; Implement-Via-Local-Provider run() only on the fail-closed branch | MED | LOW (test additions; Provider Activation run() spawns a subprocess → needs isolation) | Day 2 |
| 5 | Stage scripts without co-located tests (capability-registry, decision-engine) — covered indirectly | LOW | LOW | Day 4 |
| 6 | **No unattended mission scheduler** (execution is driven/resumable) | — | HIGH (consequential autonomy escalation) | **CTO decision required** — not a silent repair |

### Day-1 repair executed (ready, zero-risk)
**Gap #2 CLOSED:** added `src/runtime/truth-lock.test.ts` (11 assertions) locking the IDENTITY policy `evaluateTruthLock` — refuse on not-repo/wrong-branch/unresolvable-origin/HEAD-divergence/staged-index; allow only clean-index on expected branch; worktree-isolation design invariant; violations accumulate; custom policy honored. Test-only, no production change. tsc 0; full regression [pending].

## Day 2 — Contracts/executors wiring · evidence proofs · run() tests

### Gap #1 CLOSED — semantic evidence probes for the 3 consequential executors (no-false-success)
The 3 consequential executors previously had **no semantic probe** — their outcome was checked only for artifact non-emptiness (evidenceOk). Added 3 fail-closed probes to the EXISTING `PROBES` registry (both ports, reusing the framework — no new mechanism), each reading ONLY its executor's evidence:
- `synthetic-deliverable-written` — requires capability match + non-empty target + **bytes>0** + 64-hex sha256 + authoredBy=ODG_CAPABILITY (an empty no-op write FAILS).
- `provider-activation-orchestrated` — requires an honest `orchestration.decision` + `execution.classification` (a selection OR a governed REFUSED/dry-run counts; an absent/empty verdict FAILS).
- `implement-local-verified` — requires `status===EXECUTED && verified===true` (a FAILED/unverified result — VERIFICATION_FAILED, GENERATOR_UNAVAILABLE — FAILS: no false DONE).
**Proven (mandate §1):** legitimate evidence shapes ACCEPTED, and absent/empty/no-op/unverified evidence BLOCKED — 9 new probe tests (both ports). Minimal fail-closed, reuses `runProbe`/`evaluate`; `PROVIDER_ACTIVATION_EVIDENCE` defined locally (producer const not exported) matching the existing CLEAN_WORKSPACE pattern. Updated the equivalence bench's probe-count assertion 15→18 (legitimate addition; parity-equality assertion preserved — NOT a weakening).
**Evidence:** capability-probes 56/56 (both ports, +9 new); capability-probes-equivalence (dual-port parity) ALL PASS; tsc 0 (3 cfg); build:runtime OK; parity PASS; full npm test GREEN (473 files, 0 failures).
**Note:** these probes are now AVAILABLE in the registry (like git-branch/bash/research probes) to be enforced via a mission's contract `verify` block + the validation-engine required-proof gate. Auto-binding via the gateway's `CAPABILITY_PROBE` is NOT added — the gateway binds by the router's capability namespace, which is disjoint from the executor names (per Day-1 cartography), so an auto-bind keyed by executor name would never fire. Enforcement is contract-declared (the established pattern).

### Gap #4 — run() dispatch tests (PARTIAL: Provider Activation CLOSED; Implement-success NOT_MEASURABLE in CI)
- **Provider Activation run() — CLOSED.** Previously never exercised (spawns a subprocess; excluded from the dispatch-authorization invariant). New test `runtime/core/provider-activation-run.test.ts` (9 assertions) drives `resolve(...).run()` through the injectable `__setExecutorSeams` spawn seam — **no real subprocess, no external/provider effect**: proves (success) run() returns the capability result + surfaces the orchestration summary + writes evidence that **satisfies the new `provider-activation-orchestrated` probe** (end-to-end run→evidence→probe); (fail-closed) a non-zero spawn, or status-0-but-missing-evidence, ⇒ run() **throws** (evidence is mandatory, no false success).
- **Implement Via Local Provider run() SUCCESS glue — NOT_MEASURABLE in CI (honest).** run() calls `implementViaLocalProviderEscalating(patch, {})` with no injection point; the success path requires BOTH a real local-model generator AND `localProviderActivation === AUTONOMOUS_SANDBOXED` (environment-dependent, absent in CI). The success LOGIC is already fully proven by `implement-via-local-provider.test.ts` (direct call with injected generate/verify) and the run() FAIL-CLOSED branch by `dispatch-authorization-invariant.test.ts`. The only untested sliver is the run() success-glue, which needs a real model; adding a production seam purely for testability was rejected as an invasive change without clear need. Classified **NOT_MEASURABLE** (not PASS, not FAIL) — carried as a visible residual.

### Day-2 verdict
Gap #1 (consequential evidence probes) CLOSED + proven; gap #4 Provider-Activation run() CLOSED, Implement-success-glue NOT_MEASURABLE (honest, logic proven elsewhere). Remaining: gap #3 (IDENTITY pipeline wiring — Day 2/6), gap #5 (stage co-located tests — Day 4), gap #6 (unattended scheduler — CTO decision). No security control weakened; results distinguished PASS/FAIL/BLOCKED/NOT_MEASURABLE.

### Day-1 verdict
State established, continuation verified (with honest limit), research grounded, cartography complete, gaps prioritized, one ready repair landed. **Day 2 next:** gap #1 (consequential evidence probes) + gap #4 (run() dispatch tests), with careful per-executor evidence analysis to avoid regressing legitimate runs.
