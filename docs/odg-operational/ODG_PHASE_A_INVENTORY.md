# ODG — APEX PHASE A CAPABILITY INVENTORY (persistent, documentary)

> Persistent record of the Phase A truth audit. **Documentary only; grants nothing; not a new architecture.**
> Referenced from `ODG_MASTER_ROADMAP.md` §A/§D. Evidence is classified honestly: a status marked
> *(tests run this session)* means the named suite was executed at this checkpoint; *(not re-run)* means the
> code+tests exist but were not executed in the session that wrote this file — historical reports are NOT
> counted as this-session execution. **Coverage = domain + key-module level; not every one of the 76
> `runtime/core` modules was call-path-traced.** The full `npm test` suite was NOT run (provider/ollama/openai
> tests risk real network calls — out of the read-only scope).

- Audit checkpoint: `395faaa` → recorded at `396…`/this mission (branch `main`).
- Status vocabulary: IMPLEMENTED_AND_TESTED · IMPLEMENTED_NOT_PROVEN · PARTIAL · DISCONNECTED · MISSING · BLOCKED.

## Matrix (domain → key paths → status → evidence)

| Dom | Key paths | Status | Evidence |
|---|---|---|---|
| A Core — resolution | `runtime/core/capability-router.js` | IMPLEMENTED_AND_TESTED | capability-router 10, wake1-resolver-connect 12 *(run this session, prior sprints)*; DISCONNECTED from `src/runtime` migrated route (DEF-007, intentional) |
| A Core — execution | `runtime/core/capability-executors.js` | IMPLEMENTED_AND_TESTED | capability-executors 31 *(run)* |
| A Core — state/transition | `runtime/core/state-transition.js` | IMPLEMENTED_NOT_PROVEN | code + test present *(not re-run)* |
| A Core — authorization | `runtime/core/capability-authorization.js` | IMPLEMENTED_NOT_PROVEN | code inspected; full suite *(not re-run)*; deny-by-default proven in prior sprints |
| A Core — evidence/ledger | `runtime/core/mission-ledger.js` | IMPLEMENTED_AND_TESTED | ledger idempotent/label *(run, prior sprints)*; proven-only gate |
| A Core — recovery | `runtime/core/build-recovery-engine.js` | IMPLEMENTED_NOT_PROVEN | code + test present *(not re-run)* |
| A Core — allocation/economics | `budget-contract/ledger.js`, `cost-accounting.js`, `economic-unit/verification.js`, `live-cost-metering.js`, `price-resolution.js` | IMPLEMENTED_NOT_PROVEN | code + tests present *(not re-run)*; internal cost/budget, NOT revenue/finance |
| A Core — vnext | `src/runtime/vnext/*` (goal/strategy/resource-allocation/constitution) | DISCONNECTED | gated-off by design |
| B Gov/missions | `src/runtime/mission-cli.ts`, `governance-kernel.js`, `self-diagnostic.js`, `mission-contract-factory.js`, `runtime/governance/state-machine.json` | IMPLEMENTED_AND_TESTED | governance-kernel 12, self-diagnostic 26, mission-lifecycle 20 *(run)*; `authorizeMission` non-exploitable (DEF-006) |
| C Memory/learning | `capability-learning.js`, `patch-memory.js`, `post-release-learning.js` | IMPLEMENTED_AND_TESTED *(advisory)* | **APEX-B1 this session**: capability-learning 7, patch-memory 11, reuse-accounting ✓, post-release-learning ✓ (RC=0). Cycle create→validate(upstream, independent)→promote(precedent, unvalidated⇒0)→monitor(reuseCount). **No-auto-grant proven by construction** (no authority token) + test I "hit is edits-only — no authority/permission field". Reuse is advisory, revalidated by pipeline |
| D Multi-agent/fleet | `fleet-bridge/collector/dispatcher/envelope/stage/authority.js` | PARTIAL (by design) | **Phase D audit (this session)**: role boundaries respected (worker = ZERO write authority, V45); apply only via `patch-proposal-apply` (ODG mission+authorizedPaths, patch-executor = sole authority); no auto-apply; propose-only + independent validation, **no consensus** (intended, DEC-005). Tests run: fleet-authority 6/6, fleet-bridge 5/5. UNPROVEN: provider→applyProposal end-to-end; no dedicated envelope/stage test |
| E Finance quant | `finance-sim.js` (P0), `finance-data-connector.js` (P2 read-only data), `finance-paper.js` (P2 paper) + walk-forward P1 test | **PARTIAL** (sim + read-only data + paper) | finance-sim 15/15, walk-forward 10/10, connector 10/10, paper 9/9 *(run this session)*; **LIVE read-only** Coinbase BTC-USD daily candles demonstrated end-to-end (HTTP 200, 350 bars, sha256 provenance, fresh/stale gating) → sim ACCEPT, executed:false. No-look-ahead + determinism preserved; fictitious orders only; fee/slippage = explicit assumptions. **Still MISSING/deferred (separate authz): real backtest/risk-control, any execution.** No profitability claim; NOT production |
| F Commercial | `client-intake.js`, `odg-client.js`, `email-gateway.js`, `quote.js`, `invoicing.js`, `payments.js`, `pilot-delivery-packager.js`, `intake-endpoint.js`, `src/app/api/intake`, `src/app/site`, `launch-readiness.js` | IMPLEMENTED_AND_TESTED (local) / INTEGRATION_VERIFIED (local, mocks) | this-session suites: intake22, CLI13, email18, quote8, invoicing18, payments14, packager35, endpoint8, route7, site5, launch7, deploy9, journey19. **Production/deploy/legal NOT verified** (DEF-009/012) |
| G Security/trust | `bash-command-governor.js` (sandbox+redactor), `capability-authorization.js`, `capability-probes.js`; realpath/sha256 confinement (packager) | IMPLEMENTED_NOT_PROVEN | code inspected; suites *(not re-run)*; historical proofs in memory |
| H Evaluation | `runtime/bin/odg-verify.js`, `odg-health.js`; 366 test files | IMPLEMENTED_AND_TESTED | `odg verify` RC=0 *(run this session)*; full suite not run (network hazard) |

## Demonstrated missing connections / gaps
- Finance quant entirely MISSING (E).
- Multi-agent contradiction/consensus layer absent (D).
- Learning reuse is advisory (revalidated), not autonomous self-improvement (C).
- Resolver off the migrated route (A, DEF-007 intentional).
- Deployment reachability of site/API unverified (F, DEF-012).

## Not verified this session (depth limits)
Per-module call-path tracing of all 76 core modules; this-session re-execution of economic/budget/cost/price,
bash-governor, capability-authorization full suite, build-recovery, state-transition, capability-probes,
fleet-*, provider-*/ollama (last two = network hazard, deliberately not run).

## Recommended phase order (post-B1)
C (learning — **verified B1**) → C-interfaces → D (multi-agent roles if a gap is proven) → F closeout
(human config/deploy/legal) → E finance **in simulation, execution disabled**, last and separately authorized.
