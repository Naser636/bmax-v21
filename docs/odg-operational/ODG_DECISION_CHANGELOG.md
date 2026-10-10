# ODG — DECISION & CHANGE CHANGELOG (permanent, documentary)

> Traceable journal of CTO decisions and semantically-important changes. **Documentary only — grants NO
> permission, creates NO runtime memory / authority registry / primitive, and does NOT modify the frozen
> Master.** Authority order unchanged (Master FICHE_01–06 → Runtime Constitution → CTO Directives → ROADMAP.json).
> Git holds the exact diffs; this journal records the WHY, the decision and the consequences, and references
> commits for technical detail. Companion to `ODG_MASTER_ROADMAP.md` and `ODG_DEFECT_REGISTER.md`.
>
> Entry kinds are labelled: **[CTO-DECISION]** (issued by the CTO), **[CANONICAL]** (a rule from the fiches),
> **[TECH-CHANGE]** (a repo change), **[FINDING]** (a technical observation), **[HYPOTHESIS]** (unconfirmed).
> Status ∈ PROPOSED · ACCEPTED · REJECTED · SUPERSEDED · UNVERIFIED. Dates are only given when verifiable.

## CTO decisions (this reconciliation, 2026-10-09)

### DEC-001 — FICHE_07 is the canonical method authority [CTO-DECISION] — ACCEPTED (2026-10-09)
- Decision: FICHE_07 (method chain, FICHE_07:6) is canonical. The roadmap §C table is a **subordinate
  explanatory mapping** only; it may not omit, replace or contradict any canonical step/stop-state.
- Source: FICHE_07:6; reconciled in `ODG_MASTER_ROADMAP.md` §C. Checkpoint: `fede03a`. Evidence: §C now quotes
  the FICHE_07 chain verbatim + terminal `ONE NEXT AUTHORIZED ACTION` / `UNKNOWN|BLOCKED`.
- Affects: all future missions use the FICHE_07 chain. Reopen if FICHE_07 is itself amended by an authorized Master change.

### DEC-002 — Phase 0 / Truth Lock is an OPERATIONAL requirement, not a six-fiches rule [CTO-DECISION] — ACCEPTED (2026-10-09)
- Decision: Truth Lock / Phase-0 precedence comes from the repo protocol + carnet, NOT from the six fiches;
  it must not be presented as an explicit fiches rule.
- Source: `ODG_AUTONOMOUS_WORK_PROTOCOL.json`, `CLAUDE.md`, `docs/audit/phase-0/current/PHASE_0_CARNET.md`
  (grep of the six fiches for "phase 0" = empty — see roadmap note §7 of the reconciliation report).
- Affects: the resumption sequence (roadmap §B) keeps Truth-Lock-first, labelled operational. Reopen if a future
  authorized Master edit inscribes it in the fiches.

### DEC-003 — Roadmap order ≠ authorization [CTO-DECISION / CANONICAL] — ACCEPTED (2026-10-09)
- Decision: selecting the next step (roadmap §H) is never permission to develop or ACTIVATE a capability;
  the §I human gates + canonical contracts gate activation.
- Source: `ODG_V5_ROADMAP_WITH_WORK_METHOD.md:20,551`. Checkpoint: `fede03a` (invariant added to roadmap header).
- Affects: next-mission selection never auto-activates; activation needs explicit authorization.

### DEC-004 — Frozen fiches are not edited for ordinary historical changes [CTO-DECISION] — ACCEPTED (2026-10-09)
- Decision: FICHE_01–06 stay frozen/canonical; ordinary evolutions are logged here and linked to reference
  docs, never written into the fiches.
- Source: this mission §2.D; Master framing "FINAL · FROZEN · CANONICAL". Evidence: reconciliation edits touched
  only operational docs (git status of `docs/odg-master-v5` empty at `fede03a`).
- Affects: all documentation work. Reopen only via an authorized Master-amendment mission.

### DEC-005 — No security control restored/removed without proof + intent + authorization [CTO-DECISION] — ACCEPTED (2026-10-09)
- Decision: evaluate any prior control change by intent/contract; do not auto-restore a deliberately-removed
  protection nor remove a still-required one without a separately authorized mission.
- Source: this mission §2.E; linked `ODG_DEFECT_REGISTER.md` DEF-006 (authorizeMission non-exploitable),
  DEF-007 (resolver-off-route intentional). Checkpoint: `fede03a` (lesson added to register).
- Affects: security-touching missions require an explicit authorized scope.

## Confirmed changes (repo-verified; production NOT claimed)

| ID | Checkpoint | Date | Change (semantic) | Status | Evidence |
|---|---|---|---|---|---|
| CHG-COMMERCIAL | `985c836`→`b94bc85` | 2026-10-09 | governed commercial OS: intake, `odg client` CLI, email (IMAP/SMTP, send off), quote, invoicing, payments, delivery packager, site `/api/intake` route | TESTED_LOCALLY | per-module suites; `commercial-journey.test.js` 19 |
| CHG-D52CED8 | `d52ced8` | 2026-10-09 | delivery packager symlink confinement (DEF-001) | ACCEPTED (local) | `pilot-delivery-packager.test.js` 13a-d |
| CHG-D77F174 | `d77f174` | 2026-10-09 | **LOCAL INTEGRATION fix**: same-origin site serving + configurable persistent store + collision-safe ids (DEF-002/003/004) | TESTED_LOCALLY (**production NOT verified**) | `deployment-readiness.test.js` 9, `site-serving.test.ts` 5; `odg verify` RC=0 |
| CHG-71A2BE2 | `71a2be2` | 2026-10-09 | registered `ODG_MASTER_ROADMAP.md` + `ODG_DEFECT_REGISTER.md` | ACCEPTED | docs-only; `odg verify` RC=0 |
| CHG-FEDE03A | `fede03a` | 2026-10-09 | reconciled roadmap method chain + canonical invariants with FICHE_07/Master | ACCEPTED | docs-only; citations verified |

> `d77f174` is explicitly a LOCAL integration repair; DEPLOYMENT_VERIFIED = none (no deploy performed).

## APEX program progress

### CHG-PHASE-A — Phase A inventory persisted [TECH-CHANGE / FINDING] — ACCEPTED (2026-10-09)
- Persisted the read-only capability audit to `ODG_PHASE_A_INVENTORY.md` (referenced from roadmap §A/§D).
  Headline findings: E Finance quant = **MISSING**; D multi-agent = PARTIAL (no debate/consensus); C learning
  = advisory; F commercial = TESTED_LOCALLY/INTEGRATION_VERIFIED (local), production NOT verified.

### CHG-APEX-B1 — Learning-cycle verification [FINDING] — ACCEPTED (2026-10-09)
- Result: **NO defect reproduced.** Cycle create→validate(upstream, independent)→promote(precedent;
  unvalidated/mismatched/stale ⇒ zero, fail-closed)→monitor(reuseCount) confirmed. Invariant **"learning never
  self-grants permissions" holds by construction** (modules `capability-learning.js`/`patch-memory.js`/
  `post-release-learning.js` contain NO authority/grant/permission token) and is asserted by existing test
  `post-release-learning.test.js` (I: "hit is edits-only — no authority/permission field"; C/D/E/F fail-closed).
- Evidence (run this session, RC=0): capability-learning 7, patch-memory 11, patch-memory-reuse-accounting ✓,
  post-release-learning ✓. **No application code changed** (a guard was not added because no defect was
  demonstrated — adding one would invent a defect, FICHE_07 MINIMAL CHANGE).
- Effect: APEX-B1 objective satisfied; next = Phase C (shared contracts, read-only design first).

### CHG-PHASE-C — Shared-contracts map persisted [FINDING / TECH-CHANGE] — ACCEPTED (2026-10-09)
- Persisted `ODG_SHARED_CONTRACTS_MAP.md` (referenced from roadmap §A). Finding: Finance/Commerce/Multi-agent
  can reuse the EXISTING contracts (identity, C03 state, authority/action-gate, acceptance verdict, proven-only
  ledger, economic units, invoice→settlement, resolution/execution, advisory learning, recovery) with **NO new
  primitive/authority/engine**. Genuinely ABSENT interfaces are domain-specific and deferred: Finance (data
  ingestion/provenance, no-look-ahead validator, backtest/walk-forward, risk-control — simulation-only, SEPARATE
  CTO authorization), Commerce value-attribution (NOT_NEEDED for line-item billing), Multi-agent consensus
  (NOT_NEEDED/deferred; consensus ≠ proof, DEC-005). Reuse ≠ verified integration (several primitives UNPROVEN this session).
- Effect: Phase C design done; no implementation. Next = CTO decision on Phase D (multi-agent roles only if a
  gap is proven) or authorize a bounded Finance-SIMULATION mission.

### CHG-PHASE-D — Multi-agent role audit closed [FINDING] — ACCEPTED (2026-10-09)
- Result: **NO multi-agent defect reproduced.** Role boundaries respected on inspected paths: propose
  (fleet-dispatcher + worker, worker has ZERO write authority — locked by `fleet-authority.test.js` V45) →
  authorize/execute (NOT in fleet; `patch-proposal-apply.applyProposal` requires ODG-supplied mission+
  authorizedPaths and is re-enforced by patch-executor = sole authority; called by `autonomy-runtime-adapter.ts`)
  → prove (`mission-ledger` proven-only) → accept (`mechanical-acceptance`). Collector `authorizeMission`
  (DEF-006 tautology) is a vacuous WORKFLOW gate (fleet does not execute; VALIDATED = envelope status), not an
  execution authority. Provenance preserved (requestId correlation). Fleet disabled by default.
- Evidence (run this session, RC=0): `fleet-authority.test.js` 6/6, `fleet-bridge.test.js` 5/5.
- Limits (UNPROVEN this session): provider→applyProposal end-to-end not exercised (avoids network);
  no dedicated `fleet-envelope`/`fleet-stage` test executed; `fleet-bridge.js` daemon partially inspected.
- Governance: DEC-005 applies (no authority-bearing consensus to be added); DEF-006/DEF-007 keep their prior
  classification (non-defect / intentional). **No additional multi-agent implementation is justified.**
- Effect: APEX Phase D closed (audit). Next = CTO decision (Finance-SIMULATION bounded mission, separate authz).

### CHG-FINANCE-SIM-P0 — Bounded Finance-SIMULATION P0 [TECH-CHANGE] — ACCEPTED (2026-10-09)
- CTO-authorized bounded implementation. New `runtime/core/finance-sim.js` + `.test.js` (15/15 this session).
  SIMULATION-ONLY: local deterministic fixtures only; **no network, no broker/order/portfolio, no execution**
  (`executed:false`, no execute/order/broker export). Reuses `economic-unit` (ASSET integer money) + VERDICT
  vocabulary from `mechanical-acceptance` (NOT evaluateAcceptance — mission-shaped). Invariants proven:
  invalid/unsourced/temporally-inconsistent data REJECTED/BLOCKED (fail-closed); **no look-ahead** (truncation
  invariance + explicit LOOK_AHEAD throw); determinism (same input+params ⇒ identical result); traceability
  (inputHash+params). **No profitability/validity claim.** Evidence: finance-sim 15/15, economic-unit +
  mechanical-acceptance regressions green; `odg verify` RC=0. Checkpoint recorded at this mission's commit.
- Effect: Phase A inventory E = MISSING → PARTIAL (sim P0). Deferred (separate authz): market-data ingestion,
  backtest/walk-forward, risk-control, any real execution.

### CHG-FINANCE-SIM-P1 — Walk-forward validation (test-only) [FINDING] — ACCEPTED (2026-10-09)
- CTO-authorized P1. **No defect reproduced** ⇒ **no application-code change**; added TEST-ONLY harness
  `runtime/core/finance-sim-walkforward.test.js` (10/10) reusing the existing finance-sim API (ingest/decideAt/
  runSimulation) — NO backtesting engine, NO new primitive, NO network/execution. Proven over multiple local
  folds: strict decision/future separation (truncation-equal), NO train↔validate leakage (future-bar mutation
  never changes a past decision), historical invariance when adding future obs, fail-closed on insufficient
  windows / non-monotonic timestamps / missing source, determinism (folds+inputHash), no source mutation,
  executed:false. **No profitability/risk claim.** Evidence: walk-forward 10/10, finance-sim P0 15/15; `odg verify` RC=0.
- Effect: finance-sim no-look-ahead + determinism guarantees hold across walk-forward windows. Finance stays
  PARTIAL (sim). Deferred (separate authz): market-data ingestion, real backtesting, risk-control, execution.

### CHG-FINANCE-P2 — Real public data (read-only) + paper-trading [TECH-CHANGE / FINDING] — ACCEPTED (2026-10-09)
- CTO-authorized bounded real-data validation (read-only public source, no auth) + local paper trading. New:
  `runtime/core/finance-data-connector.js` (+test 10/10), `runtime/core/finance-paper.js` (+test 9/9).
  Injected bounded GET (GET-only, no redirects, bytes/timeout bounded, no auth/secret); fail-closed
  HTTP_ERROR/MALFORMED/INVALID_ROW/NON_MONOTONIC_TIME/STALE/FETCH_FAILED; provenance (source, instrument,
  collectedAt, sha256 dataHash, marketTsRange, nature) with **STALE ⇒ decisionsAllowed:false**. Paper module:
  virtual portfolio, **fictitious orders only** (`fictitious:true`, `executed:false`), fee/slippage as EXPLICIT
  ASSUMPTIONS (not real costs). Reuses finance-sim + economic-unit; no new primitive/engine.
- **LIVE one-shot demonstration (this session, read-only):** Coinbase Exchange public candles
  `GET /products/BTC-USD/candles?granularity=86400` → HTTP 200, 21483 B, **350 daily bars**, sha256
  `fcf8683b…`, market range epoch 1761350400→1791504000, latest candle age ~0.81 d (fresh, **historical/delayed
  daily OHLC, NOT realtime**), fed through finance-sim ⇒ ACCEPT, executed:false. Evidence (gitignored scratch):
  `scratchpad/p2-live-evidence.json`. **No profitability/risk claim; P&L is a SIMULATION figure.**
- Regressions green: finance-sim P0 15/15, walk-forward P1 10/10, economic-unit PASS; `odg verify` RC=0.
- Boundaries preserved: no order/broker/portfolio/execution, no secret/auth/paid subscription, no autonomous
  strategy change, no unbounded/continuous network. Finance = PARTIAL (sim + read-only data + paper); NOT production.

### CHG-FINANCE-P2.1 — Enforce stale-lock on paper trading [TECH-CHANGE] — ACCEPTED (2026-10-09)
- Audit reproduced DEF-013: `decisionsAllowed:false` (STALE/HTTP_ERROR/failed source) was an **unconsumed
  advisory flag** — `paperTrade`/`runSimulation` ignored it, so new fictitious orders were generated on stale
  data (historical `runSimulation` returns ACCEPT regardless). Clarified meaning: **ACCEPT = the historical
  computation is well-formed, NOT an authorization to produce a fresh-data decision.**
- Minimal fix (write-set: `finance-paper.js` + `finance-paper.test.js`): added ENFORCED seam
  `paperTradeFromSource(source, positions, opts)` — fail-closed `DECISIONS_BLOCKED` (0 orders, executed:false)
  when `source.ok!==true` or `decisionsAllowed!==true`; only a fresh+ok source produces orders. ACCEPT does
  NOT re-enable. Reuses existing `paperTrade`; no new primitive.
- Evidence: finance-paper 13/13 (incl. #6 fresh-allowed/stale-blocked/http-error-blocked/null-blocked);
  regressions connector 10/10, finance-sim 15/15, walk-forward 10/10, economic-unit PASS; `odg verify` RC=0.

### CHG-FINANCE-P2.2 — Single governed paper-trading entry point [TECH-CHANGE] — ACCEPTED (2026-10-09)
- Census: NO production consumer of `paperTrade`/`paperTradeFromSource` existed (tests only); bare `paperTrade`
  was exported and could bypass the freshness gate. (`src/core/simulation-runner.ts runSimulation` is an
  UNRELATED opportunity-sim — name collision, not the finance path.)
- Consolidation (write-set: `finance-paper.js` + `finance-paper.test.js`): added `runGovernedPaper(source,
  params, opts)` = the SINGLE governed parcours (gate `source.ok` + `decisionsAllowed` → `finance-sim.runSimulation`
  → internal paper → provenance+inputHash preserved; executed:false). **Un-exported bare `paperTrade`** — public
  exports are now only the gated entries (`runGovernedPaper`, `paperTradeFromSource`) + explicit
  `__internalPaperTrade` for unit tests. A historical ACCEPT cannot lift the gate; blocked results carry no
  partial portfolio (pure, no mutable state ⇒ atomic). No new primitive/engine; reuses finance-sim + economic-unit.
- Evidence: finance-paper 20/20 (incl. #7 governed entry fresh/stale/http-error/null/invalid-params, #8
  no-bypass `paperTrade===undefined`, #9 atomicity); regressions finance-sim 15, walk-forward 10, connector 10,
  economic-unit PASS; `odg verify` RC=0. No network/broker/order; fictitious only.

### CHG-FINANCE-P2.3 — Deprecate `__internalPaperTrade` (governed-only exports) [TECH-CHANGE] — ACCEPTED (2026-10-09)
- `__internalPaperTrade` was used only by finance-paper.test.js (no src/production). Removed it from exports;
  the kernel `paperTrade` is now MODULE-PRIVATE. Public exports = gated only: `runGovernedPaper`,
  `paperTradeFromSource` (+ `CODE`). Tests migrated to the governed API: SMA(window=2) on closes
  [1000,1100,1050,1200] yields positions [1,1,0,1], so the hand-computed P&L (gross44/costs9/net35) is now
  asserted via `runGovernedPaper` on a fresh connector source. The kernel's LENGTH_MISMATCH/INVALID_INPUT
  guards are unreachable via the governed path (connector guarantees valid, length-matched bars) ⇒ kept as
  defensive internals, documented, not public-API tested.
- Evidence: finance-paper 15/15 (incl. `paperTrade===undefined` AND `__internalPaperTrade===undefined`, gate
  STALE/HTTP_ERROR/null/invalid-params ⇒ BLOCKED, atomicity, provenance/determinism); regressions finance-sim
  15, walk-forward 10, connector 10, economic-unit PASS; `odg verify` RC=0. Finance remains **PARTIAL, NON production**.

### DEC-006 — Finance FROZEN @ P2.3 [CTO-DECISION] — ACCEPTED (2026-10-09)
- Decision: **freeze Finance at stage P2.3.** Status remains **PARTIAL / NON PRODUCTION.** No further Finance
  development, no additional market data, no broker, no authenticated/real-time market access, no advanced
  backtest, no risk-control, and **no real execution** without a SEPARATE CTO authorization.
- Scope frozen (all SIMULATION-ONLY, executed:false, no network at rest): P0 `finance-sim.js`; P1 walk-forward
  (test-only); P2 `finance-data-connector.js` (read-only public data, one-shot live demo only) + `finance-paper.js`
  (governed paper); P2.1 enforced stale-lock (DEF-013); P2.2/P2.3 single governed entry `runGovernedPaper`,
  gated-only exports (`paperTrade`/`__internalPaperTrade` not exported). No profitability/risk claim.
- Effect on next mission: **no implementation mission is authorized by default** — roadmap §H now states the
  next step requires a fresh CTO decision (APEX A/B1/C/D done/closed). Reopen only by explicit CTO authorization.

### FINDING-DIAG-RC1 — `odg diagnose` RC=1 is honest, not a success [FINDING] — recorded (2026-10-09)
- `./runtime/bin/odg diagnose` ⇒ **RC=1**, incident INC-99d1c870bc1a3607 FROZEN, divergence
  `mission-context-stale` CRITICAL. Confirmed SAME historical RESIDUE as DEF-005: `mission-plan.json`
  (NL_IMPLEMENT_E4DDB6BA) vs `patch-execution.json` (ADD_GOVERNED_EXTERNAL_RESEARCH_EXECUTOR), no
  `current-mission.json` — two unrelated past runs' stale generated artifacts. CRITICAL-on-different-stamps is
  **intentional and locked** (self-diagnostic.test.js #12). **NOT a source defect; RC=1 is the correct honest
  signal, not a failure to mask.** Any cleanup = a SEPARATE authorized artifact-hygiene mission (gitignored
  generated state), never a change to the locked control. No action taken (read-only reconciliation).

### CHG-DEF-005-HYGIENE — Resolve mission-context-stale residue by artifact hygiene [TECH-CHANGE] — ACCEPTED (2026-10-09)
- CTO-authorized artifact-hygiene mission. PREVIEW confirmed the divergence-driving pair was stale, gitignored,
  from two dead runs, with NO active mission: `runtime/generated/mission-plan.json` (NL_IMPLEMENT_E4DDB6BA,
  2026-10-08) and `runtime/generated/patch-execution.json` (ADD_GOVERNED_EXTERNAL_RESEARCH_EXECUTOR, 2026-10-08);
  `current-mission.json` absent; the mission-queue is a regenerated roadmap list, not a resume mechanism.
- ACTION: backed up both to scratchpad, then removed exactly those two gitignored files (no rm -rf, no pattern
  delete). Both are regenerated by any future pipeline run.
- RESULT: `./runtime/bin/odg diagnose` ⇒ `Mission: (none loaded)`, Divergences 0, Incident none, NO_DIVERGENCE,
  **RC 1→0** (honestly reflects "no active mission"). `./runtime/bin/odg verify` RC=0.
- CONTROL INTEGRITY (non-negotiable): the detection mechanism is UNTOUCHED — `self-diagnostic.js` and its tests
  have no diff; `self-diagnostic.test.js` 26/26 incl. the locked #12 stale-context detection still fires on real
  divergence. The FROZEN incident ledger was **NOT deleted** (history preserved); RC=0 comes from the genuine
  absence of a current divergence, not from masking. No tracked file, canonical fiche, code, test, threshold or
  secret changed. ⇒ DEF-005 status: RESOLVED (residue cleared, control intact).
- LIMIT: sibling stale artifacts (mission-context/decision/execution-plan.json) left in place — not
  divergence-driving (the detector reads only mission-plan + patch-execution); harmless residue.

### DEC-007 — Close OD-1 (method table) & OD-2 (Phase 0) [CTO-DECISION] — ACCEPTED (2026-10-09)
- **OD-1 CLOSED — keep the subordinate table, annotated.** FICHE_07:6 stays the canonical authority; the
  roadmap §C table remains a subordinate mapping (DEC-001 upheld). Per the OD-1/OD-2 audit, the §C
  OBSERVE/DIAGNOSE row is annotated to name the four canonical steps `MEASURE → LOCALIZE → CLASSIFY → PROVE
  ROOT CAUSE` (closing the compression gap). Canonical chain/order/authorization gates unchanged; table not
  removed; no new method invented.
- **OD-2 CLOSED — Phase 0 stays operational; TRUTH LOCK is already canonical.** Evidence: TRUTH LOCK is in
  FICHE_07 (chain line 6 + §3) and the protocol (`ODG_AUTONOMOUS_WORK_PROTOCOL.json:29,98`, `CLAUDE.md:12`);
  "Phase 0" appears in NO frozen fiche as a rule (grep). DEC-002 upheld (operational-only); DEC-004 upheld
  (frozen fiches not amended). No Master amendment authorized or needed.
- Scope: documentary only (`ODG_MASTER_ROADMAP.md` §C annotation + this entry). No code/test/fiche/manifest/
  defect-register change. Evidence: OD-1/OD-2 read-only audit (prior turn); `odg verify` RC=0.

### CHG-RWL-B4 — Client-store backup/restore (read-only, integrity-verified) [TECH-CHANGE] — ACCEPTED (2026-10-09)
- RWL-B4 executed. Root cause: no programmatic backup/restore/integrity mechanism for the client store
  (`runtime/generated/clients/**`) ⇒ loss/corruption/inconsistent-restore risk. Minimal change (write-set:
  `runtime/core/client-store-backup.js` + `.test.js`; doc `LAUNCH_READINESS.md`; this entry; roadmap status):
  `backup` (read-only, never mutates source), `verify` (per-file + manifest sha256 ⇒ tamper detection),
  `restore` (explicit target, refuses non-empty unless force, re-hashes each file, fail-closed
  INTEGRITY_MISMATCH). Reuses `client-intake.storeState`; no new primitive. **Retention/deletion NOT
  implemented** (no contract ⇒ human policy, RWL-D2). Store holds no secrets (verified).
- Evidence (run this session, RC=0): `client-store-backup.test.js` 12/12 (round-trip byte-identical, source
  not mutated, tamper/corrupt-manifest/non-empty-target fail-closed, no-secret); regressions client-intake 22,
  deployment-readiness 9; `odg verify` RC=0. Status: RWL-B4 **PROVEN (local)** — restore proven by executed
  round-trip test, not by build alone. Next per roadmap §H: RWL-B5 (incident runbook).

### CHG-RWL-B5 — Incident/observability runbook [TECH-CHANGE / FINDING] — ACCEPTED (2026-10-09)
- RWL-B5 executed (doc-only). PROVEN signals this session (command → exit code): `odg verify` RC=0
  (build/tsc/gitClean + contracts 88/88), `odg diagnose` RC=0 (NO_DIVERGENCE), `odg health` RC=0
  (Runtime/Foundation/Pipeline/Brain READY; 169 caps ready/12 missing; BLOCKERS = roadmap NEEDS_CONTRACT,
  informational), `odg client launch` overall + per-capability states. Recovery seams present:
  `build-recovery-engine.js`, `client-store-backup.js` (RWL-B4).
- Created `ODG_INCIDENT_RUNBOOK.md`: signals→meaning→exit semantics, SEV-1/2/3 + escalation, diagnose→contain→
  recover→verify, rollback/resume criteria, evidence-to-keep + no-secret, known residue (DEF-005 not an
  incident), host-dependent numeric thresholds marked **À DÉFINIR** (owner/dependency, not invented), human-
  authorization actions. No new primitive/metric/infra. Write-set: runbook doc + roadmap status + this entry.
- Status: RWL-B5 **PROVEN (local, documentary)** — procedures verified against real command behaviour; numeric
  SLO thresholds remain NOT PROVEN (require a deployed host, RWL-C1/E1). Next per §H: Phase C/D/E/F are
  human/resource-gated ⇒ highest-leverage unlock = CTO provision of host + real client.

### CHG-TRUST-A — Autonomy chain audit + DEF-014 + A–L consolidation [FINDING / DOC] — RECORDED (2026-10-09)
- Truth Lock re-verified (NOT assumed): HEAD=`f88f2a1`=origin/main, worktree clean. `src/app/autonomy-loop/
  MARKER.md` residue reverted to HEAD earlier this session under explicit human authz (gitClean restored).
- **DEF-014 DEMONSTRATED & REPRODUCED** (see register): a governed Validation **BLOCKED** (`pipelineOk=false`)
  makes the autonomy loop **hard-halt EXECUTION_FAILED** and strand independent downstream missions — unlike a
  Release-Manager NO_RELEASE which correctly defers (D2/S4). Root cause proven in code; reproduced in scratchpad
  `repro-blocked-halt.ts` (repo untouched). Also: a fail-closed BLOCKED is escalated to `runViaProvider` (live
  provider spawn) before halting — an unauthorized-network/live-call hazard. **This corrects an earlier
  session claim that FIX_AUTONOMY_CONTINUE was fully implemented — it is only PARTIAL (NO_RELEASE path only).**
- Tests actually run this session (local, no network, all green): autonomy/validation suites (runtime-autonomy,
  autonomy-escalation-pending-commit, autonomy-local-loop, validation-engine-recorded-noop, persistent-autonomy-
  controller, corrective-queue-intake, probe-freshness, engineering-terminal-verdict, objective-proof-gate,
  consequential-executor-gate, nl-authorization) + chain-link (scope-observer, action-gate, patch-executor-
  governance-guard, mission-lifecycle ×3, mechanical-acceptance, checkpoint-engine, capability-executors) + repro.
- Rejected synthetic contract `SYNTH_PROVIDER_CHAIN_PROOF.json` — 3 anomalies (false `generatedBy:factory`
  provenance dodging the gitClean exclusion; self-stamped `status:AUTHORIZED`; done_when unsatisfiable for a
  gitignored target in ENGINEERING mode since engineering-changed is git-tracked-only). **Not created.**
- Scope: documentary only (this entry + `ODG_DEFECT_REGISTER.md` DEF-014 + `ODG_REAL_WORLD_LAUNCH_ROADMAP.md`
  PHASE H A–L). No code/test/fiche/manifest change. 9 primitives intact. External research stays **DEFERRED**.

### PHASE-3 STOPPING POINT (preserve verbatim)
- **Checkpoint:** `f88f2a1` (re-verified current, clean) — do not assume it stays current on resume.
- **Reproduced defect:** Validation BLOCKED can lead to EXECUTION_FAILED and abandon independent missions (DEF-014).
- **Files concerned:** `src/runtime/autonomy-runtime-adapter.ts`, `src/core/runtime-autonomy.ts`.
- **Correction NOT applied:** existing contract does not correctly cover these `src/**` paths (mis-scoped `runtime/**`).
- **Next governed action:** prepare a correctly-scoped engineering contract (+ regression test for `pipelineOk=false`)
  to fix BLOCKED handling WITHOUT auto-escalation to an unauthorized external provider. Do NOT edit those files
  until governance establishes the authorization and write-set. Do NOT create the rejected synthetic contract
  until its structure/provenance/acceptance anomalies are resolved.

### CHG-OD-3 — DEF-014 remediation (defer-on-BLOCKED, no provider escalation) [TECH-CHANGE] — VERIFIED; COMMITTED LOCALLY @ `2aa6dab` (2026-10-09)
- OD-3 executed under CTO authorization. Write-set (exact, nothing else touched): `src/runtime/autonomy-runtime-
  adapter.ts` (+60/−3 — `runLocalPipeline` classifies a governed Validation BLOCKED vs a crash: FAILED stage ==
  "Validation Engine" via `pipeline-checkpoint.json` AND fresh `mission-report.json` `validated:false`+status
  BLOCKED/PARTIAL for this mission ⇒ `reason:"VALIDATION_BLOCKED"`, fail-safe→crash otherwise; `runPipeline`
  returns such an outcome WITHOUT calling `runViaProvider`), `src/core/runtime-autonomy.ts` (+29 — defer-and-
  continue on `reason==="VALIDATION_BLOCKED"` with D2/S4 parity; synthesized NO_RELEASE record, all-false gates ⇒
  honest terminal BLOCKED, never VALIDATED_PENDING_COMMIT; genuine crash still `EXECUTION_FAILED`), new test
  `src/tests/autonomy-blocked-defer.test.ts`.
- Evidence (this session, exit 0 unless noted): regression **8/8** (BLOCKED→defer+GOOD released+terminal BLOCKED;
  NO_RELEASE parity; crash→EXECUTION_FAILED distinct; D1 no provider on governed block; D3 crash still escalates);
  scratchpad `repro-blocked-halt.ts` **FLIPPED** (Scenario A now `status=BLOCKED, completed=["GOOD_MISSION"]`, was
  EXECUTION_FAILED/stranded); 8 neighbour autonomy suites green; `npx tsc --noEmit` **RC=0**.
- Status: **VERIFIED — committed locally @ `2aa6dab`** (D1 held: ODG did not auto-commit; a human authorized this
  single local commit, which also carries these docs). **NOT pushed as of 2026-10-09**; no network/deploy then.
  (Reconciliation 2026-10-10: `2aa6dab` is now published in `origin/main`/HEAD `581d1f1` — see CHG-OD-4.)
  `npm run build`/`odg verify` (Next build, does not exercise this path) NOT re-run — proof = tsc + tests + repro.
  External research stays **DEFERRED**. Detail: `ODG_DEFECT_REGISTER.md` DEF-014.

### CHG-OD-4 — Evidence reconciliation: DEF-014 push status + Track J gate state [FINDING / DOC] — RECORDED (2026-10-10)
- Executed under CTO DIRECTIVE "ODG EVIDENCE RECONCILIATION". Documentary only; write-set = exactly the three
  operational docs (`ODG_DEFECT_REGISTER.md`, this changelog, `ODG_REAL_WORLD_LAUNCH_ROADMAP.md`). No source/test/
  contract/permission/frozen-fiche change. No commit/push/network/deploy.
- **Truth Lock (verified, not assumed):** HEAD=`581d1f1` = `origin/main` = `origin/HEAD`, worktree clean, 0 ahead.
  `2aa6dab` IS an ancestor of HEAD and is contained in `origin/main`.
- **DEF-014 / OD-3 reconciliation (current evidence):** the prior records stated the OD-3 fix `2aa6dab` was
  "committed locally, NOT pushed, `main` ahead of `origin/main`". That is now obsolete — `2aa6dab` is published in
  `origin/main` (later commits `151ac7b`…`581d1f1` sit on top; `main` is NOT ahead). Push residual is CLOSED. The
  original 2026-10-09 decision narrative (CHG-OD-3) is preserved and date-qualified; history is NOT rewritten.
- **Track J reconciliation (historical vs current):** the **historical** isolated gate (captured 2026-10-09 22:52,
  `bwrap --unshare-net`, egress `ENETUNREACH`) reported **371/372 PASS** with 1 suite
  `runtime/core/bash-command-governor.test.js` **BLOCKED_BY_ISOLATION** (needs nested bubblewrap). That suite was
  **later** corrected by `602257a` (governed-bash fail-closed on sandbox launch failure); its **host** test passed
  **52/52** (host evidence, this session). The **full 372-suite gate has NOT been rerun at the corrected HEAD
  `581d1f1`** — Track J is therefore **NOT claimed 372/372** and remains **PARTIAL**.
- **Preserved limitations:** live end-to-end autonomy loop **NOT PROVEN**; `npm run build`/`odg verify` **NOT re-run**
  (not overstated); **ADD_GOVERNED_EXTERNAL_RESEARCH_EXECUTOR remains DEFERRED**.

### CHG-OD-5 — Track J recorded PROVEN at HEAD `6f815ba` [FINDING / DOC] — RECORDED (2026-10-10)
- Executed under CTO DIRECTIVE "RECORD TRACK J PROVEN — DOCUMENTATION ONLY". Documentary only; write-set = exactly
  two docs (`ODG_REAL_WORLD_LAUNCH_ROADMAP.md` row J, this changelog). No source/test/contract/permission/
  generated-artifact change. No commit beyond the doc commit; no push/network/deploy.
- **Truth Lock (verified, not assumed):** HEAD=`6f815baf6fd2448882daab532408144cfff830a1`, branch `main`, worktree
  clean, 1 ahead of `origin/main` (unpushed).
- **Verified result (current evidence, HEAD `6f815ba`):** official `runtime/bin/odg verify` ran **once** under proven
  network isolation (`bwrap --unshare-net`; loopback-only, egress `ENETUNREACH`; temporary sandbox HOME with only
  `/home/ubuntu/.config/git/ignore` bound read-only — no `.ssh`/`.gitconfig`/`.aws`/`.npmrc`/SSH-agent, no writable
  host state) → **exit 0**. `runtime/generated/runtime-verify.json` (`generatedAt 2026-10-10T10:27:50.355Z`, fresh):
  `build:true`, `typescript:true`, `gitClean:true`, `generatedContractsValid:true` (88/88).
- **Regression (current evidence):** full project-runner gate **374/374 PASS** = 371 under network isolation + 3
  host carve-outs (`bash-command-governor` 52/52 real bubblewrap; git-dependent `scope-observer` + `clean-workspace`),
  run at HEAD `581d1f1`. `6f815ba` is **docs-only** atop `581d1f1` (code identical, diff-confirmed), so the regression
  covers `6f815ba`'s code.
- **Historical (distinguished):** the earlier 2026-10-09 22:52 isolated gate read 371/372 with one suite
  BLOCKED_BY_ISOLATION; corrected later by `602257a`. That capture is NOT the current proof.
- **Scope / limits (explicit):** Track J is PROVEN for build + type-check + gitClean + generated-contracts +
  regression gate at this HEAD. It does NOT prove runtime behaviour beyond those gates. **Live end-to-end autonomy
  remains NOT PROVEN** (Track F); **`ADD_GOVERNED_EXTERNAL_RESEARCH_EXECUTOR` remains DEFERRED**. Evidence artifacts
  (`runtime-verify.json`, gate/verify logs under `/home/ubuntu/.cache/…` and the scratchpad) are **NOT committed**.

## Open decisions (pending CTO)
- **OD-3 (CLOSED — reconciled 2026-10-10; see CHG-OD-4)** — remediation of **DEF-014** applied + VERIFIED in the
  3-file OD-3 write-set (CHG-OD-3 above). Push residual is now **CLOSED**: `2aa6dab` is published in `origin/main`
  (ancestor of HEAD `581d1f1`); `main` is NOT ahead of `origin/main`. Autonomy's BLOCKED-defer path is PROVEN
  locally; the live end-to-end autonomy loop remains **NOT PROVEN**.
- (OD-1/OD-2 closed by DEC-007; OD-* reopen only on explicit CTO request.)

## Non-verifiable / limits
- Decisions from conversations PRIOR to the commit history visible in this repo are **not fully recoverable**;
  only repo-verifiable checkpoints and this session's CTO decisions are recorded. Earlier periods = UNVERIFIED.
- No dates are asserted beyond those verifiable from Git (`git log`) or the current session date (2026-10-09).
