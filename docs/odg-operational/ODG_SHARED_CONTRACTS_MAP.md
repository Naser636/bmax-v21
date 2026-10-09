# ODG — SHARED CONTRACTS MAP (APEX Phase C design, documentary)

> **Read-only design artifact.** Shows how Finance (simulation), Commerce and Multi-agent **reuse the
> EXISTING contracts and primitives** — it creates NO new primitive/authority/engine/consensus layer, no
> second evidence store or verdict, and does NOT recopy the frozen Master. Reuse possibility ≠ verified
> integration. Companion to `ODG_MASTER_ROADMAP.md`, `ODG_PHASE_A_INVENTORY.md`, `ODG_DEFECT_REGISTER.md`.
> Checkpoint of audit: `cc49930`. Evidence legend: **PROVEN** (EXISTANT ET PROUVÉ, test run), **UNPROVEN**
> (EXISTANT MAIS NON PROUVÉ this session), **ABSENT**, **NOT_NEEDED** (NON NÉCESSAIRE now / deferred).

## 1. Shared contracts & primitives (existing) → consumers → reuse by domain
| Contract / primitive | Path | Demonstrated consumers | Finance(sim) | Commerce | Multi-agent | Evidence |
|---|---|---|---|---|---|---|
| Mission/request identity | `runtime/core/mission-contract-factory.js`, `fleet-envelope.js`, `client-intake.js` | commerce intake, fleet | reuse | reuse (PROVEN) | reuse (envelope) | PROVEN (commerce local) |
| C03 state transition | `runtime/core/state-transition.js` | action-gate, self-diagnostic, artifact-state, world-model, capability-probes | reuse | reuse | reuse | PROVEN |
| Authority / action-gate | `capability-authorization.js`, `action-gate.js`, `patch-action-contract.js` | runtime-executor, nl-gateway, bash-governor | reuse | reuse (PROVEN) | reuse | PROVEN (deny-by-default) |
| Acceptance verdict | `mechanical-acceptance.js` → `acceptance-facts.js` | acceptance-facts | reuse | reuse | reuse | PROVEN |
| Proven-only evidence/ledger | `mission-ledger.js`, `artifact-state.js` | fleet-dispatcher/collector, `src/runtime/ledger-record-adapter.ts`, packager | reuse | reuse (PROVEN) | reuse | PROVEN |
| Economic quantities | `economic-unit.js` (COST_UNIT/ASSET), `cost-accounting.js`, `price-resolution.js`, `budget-contract/ledger.js`, `live-cost-metering.js` | budget/cost/metering | reuse (ASSET+price) | reuse (PROVEN) | reuse (cost) | PROVEN(commerce) / UNPROVEN(finance) |
| Invoice→collection→settlement | `quote.js`, `invoicing.js`, `payments.js` | `odg-client.js` | reuse (billing) | PROVEN (local/mocks) | — | PROVEN (local) |
| Resolution / execution | `capability-router.js` (resolver), `capability-executors.js` | decision-engine / RuntimeExecutor | reuse (executors) | reuse | reuse | PROVEN; resolver DISCONNECTED from `src/runtime` route (DEF-007, intentional) |
| Learning (advisory) | `capability-learning.js`, `patch-memory.js`, `post-release-learning.js` | decision-engine, capability-router, local-autonomy, mission-ledger | reuse | reuse | reuse | PROVEN advisory (APEX-B1; no self-grant) |
| Recovery | `build-recovery-engine.js`, `self-diagnostic.js` | validation/pipeline | reuse | reuse | reuse | UNPROVEN (this session) |

## 2. Domain-specific interfaces genuinely ABSENT (per Phase A audit)
| Interface | Domain | Status | Rule |
|---|---|---|---|
| Market-data ingestion + provenance | Finance | ABSENT | reuse `price-resolution`/`economic-unit.ASSET` provenance pattern; impl = separate CTO authz |
| No-look-ahead / time-series validator | Finance | ABSENT | new interface only if a Finance-sim mission is authorized |
| Backtest / walk-forward harness | Finance | ABSENT | simulation-only; execution DISABLED |
| Risk-control contract | Finance | ABSENT | required before any (future) real execution |
| Value ATTRIBUTION → contractual right (FICHE_07 l.118 front) | Commerce | ABSENT / **NOT_NEEDED** | current billing is line-item (quote-based); attribution only needed for value-based billing |
| Contradiction / consensus contract | Multi-agent | ABSENT / **NOT_NEEDED (deferred)** | consensus ≠ proof (DEC-005); add only if a gap is proven |

## 3. Duplication-of-authority risks (flagged, not resolved here)
Any future domain MUST reuse — never duplicate — the single authority (`capability-authorization`), the single
proven-only evidence ledger (`mission-ledger`), and the single verdict (`mechanical-acceptance`). A consensus
layer must never become a second authority (DEC-005). No second state source / no parallel runtime
(CTO_DIRECTIVES:45; FICHE_05:18; V5:738–739). The resolver must not be re-added as a parallel engine on the
migrated route (DEF-007 is an intentional separation, not a defect to "fix").

## 4. Limits (not demonstrated this session)
Economic/finance, recovery, security, fleet suites were not re-run this session (UNPROVEN label). Reuse is a
**possibility grounded in shared contracts**, not a verified cross-domain integration. Finance remains ABSENT as
a simulation capability; **any Finance implementation requires separate CTO authorization**.

## 5. Conclusion
No new primitive/authority/engine is required to connect Finance/Commerce/Multi-agent to ODG — the shared
contracts exist and are reusable; the only genuine gaps are domain-specific and deferred/authorization-gated.
