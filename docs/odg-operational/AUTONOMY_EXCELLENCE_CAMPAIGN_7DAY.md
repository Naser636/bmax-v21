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

### Day-1 verdict
State established, continuation verified (with honest limit), research grounded, cartography complete, gaps prioritized, one ready repair landed. **Day 2 next:** gap #1 (consequential evidence probes) + gap #4 (run() dispatch tests), with careful per-executor evidence analysis to avoid regressing legitimate runs.
