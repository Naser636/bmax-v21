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

### Cartography — IN PROGRESS (2 read-only agents: 9-primitive map + declared-vs-operational capability gaps). Gap inventory + prioritization to follow in this day.

### Next action
Synthesize cartography → prioritized gap inventory (gravity×probability×impact×reversibility) → execute the highest-value bounded authorized repair; carry the unattended-scheduler question to the CTO as an explicit authorization decision.
