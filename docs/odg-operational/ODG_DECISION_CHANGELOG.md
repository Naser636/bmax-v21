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

## Open decisions (pending CTO)
- **OD-1** [HYPOTHESIS→PROPOSED] Replace the roadmap §C mapping table with the FICHE_07 chain only, or keep the
  subordinate table? Current: kept as subordinate mapping (DEC-001). Reopen = CTO preference.
- **OD-2** [PROPOSED] Elevate Phase-0 precedence to a canonical fiches rule? Current: operational-only (DEC-002).
  Requires an authorized Master-amendment decision.

## Non-verifiable / limits
- Decisions from conversations PRIOR to the commit history visible in this repo are **not fully recoverable**;
  only repo-verifiable checkpoints and this session's CTO decisions are recorded. Earlier periods = UNVERIFIED.
- No dates are asserted beyond those verifiable from Git (`git log`) or the current session date (2026-10-09).
