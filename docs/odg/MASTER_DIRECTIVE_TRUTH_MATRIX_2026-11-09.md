# V12.4 — Master Directive GATE-A Truth / Recovery Matrix (2026-11-09)

**Directive Maîtresse §8 / Part XXI — recover + audit real state BEFORE building (no modules on the proposal alone).**
Values are strict: **VERIFIED** (exists + gate-tested) · **PARTIAL** · **NOT_VERIFIED** · **BLOCKED** · **NOT_IMPLEMENTED**.
No cell is filled by assumption. Truth Lock: `main @ a558602`, 0 open PRs, preservation intact (5 stashes / 6 untracked).
M-CH3-03 = `rce-assurance-chain` **VALIDATED** (no active treatment to recover).

## Domain audit (Part III §9)

| Domain | State | Evidence (real modules) | Gap | Next |
|---|---|---|---|---|
| **A Central Intelligence** (understand/decide) | **PARTIAL** | `nl-objective-gateway`, `mission-classification-rootcause`, `capability-map` | no single Decision Engine with the §12 criteria vector | evaluate before building (may be composition) |
| **B World Model** | **VERIFIED** | `world-model`, `capability-map`, `change-impact-graph`, `persistent-impact-graph` | provenance/date per edge partial | extend existing graph only on demonstrated need |
| **C Discovery & Research** | **PARTIAL** | Market Intelligence V1 (real sourced web research), `frontier-radar` (sanitize-untrusted), evidence-provenance | no reusable research-engine module with the §14 pipeline + benchmark | candidate; evaluate utility vs the one-off web research already done |
| **D Mission Orchestration** | **VERIFIED** | `mission-lifecycle`, `campaign-controller`, `engineering-scheduler`, `delivery-batch-coherence` | state machine vs §22 superset partial | audit transitions |
| **E Métier & Execution** | **VERIFIED** | 13 `profession-p*-reference` + P5/P8 capability modules; fiches | parity matrix (§18) not yet a single artifact | build parity matrix |
| **F Assurance & Security** | **VERIFIED** | gate 390/390, `validation-engine`, `security-control-plane`, `mission-independent-validation` (28/28), adversarial suites | — | maintain |
| **G Market & Economic** | **PARTIAL** | Market Intelligence V1 (sourced), economic model framework | no executable **simulator** (§31) — doc only | **build economic-simulator (next gap)** |
| **H Customer Outcome** | **NOT_IMPLEMENTED → now PARTIAL** | **`customer-outcome-intelligence` (BUILT this lot)** | attribution ladder + value model built; outcome-memory/collector wiring partial | wire to mission-lifecycle |
| **I Evolution & Learning** | **VERIFIED** | `frontier-radar*`, `compounding-pattern-library`, `optimization-experiment`, `repair-autonomy-selftest` | 4 deep-autonomy gaps evaluated → DEFER (no demonstrated miss) | watch |

## Nine primitives (§10) — all VERIFIED

IDENTITY / STATE / CONTRACT / POLICY / RESOLVER / EXECUTOR / EVIDENCE / RECOVERY / ALLOCATOR — audited across the gate;
no subsystem bypasses them (enforced by `root-of-trust`, `action-gate`, `campaign-controller`).

## First gap filled this lot (Domain H — the directive's centerpiece)

**`runtime/core/customer-outcome-intelligence.ts`** (Part X §32–§34). Measures whether the client's problem was actually
solved (baseline → after vs an outcome contract), with a **strict honest attribution ladder**
(NOT_DEMONSTRATED < OBSERVED < VERIFIED < PROBABLY_ATTRIBUTABLE < ROBUSTLY_ATTRIBUTABLE) and the non-negotiable rule
(§34): **a SIMULATED improvement is never a real client gain** (capped OBSERVED, `real=false`, `valueCreated=null`), an
unverified/regressed/unmet outcome is capped, and tasks/files/tests executed are explicitly **not** an outcome.
Gate-tested (13 assertions). Composes `performance-observability` + `eval-significance`; no new metric engine.

## Genuine remaining gaps (decomposed into real next missions — NOT built speculatively)

1. **Economic simulator** (§31, Domain G): parameterized 3-scenario simulator with inconsistency detection (capacity
   exceeded / negative margin / impossible delay / missing cost) over the existing economic framework. **Buildable next.**
2. **15-métier parity matrix** (§18): per-métier capability × connectivity × tests × deliverable × evidence × gap. **Buildable (audit artifact).**
3. **Research-engine module** (§14): candidate only — the one-off sourced web research is done; a reusable engine is built
   only if a demonstrated recurring need justifies it (anti-gas-factory).
4. **Digital Twin** (§43): candidate; evaluate fidelity need before building.
5. **R0–R5 certification per métier** (§49): an assessment artifact over the above; built after the parity matrix.

Each is a real, scoped mission with acceptance criteria; none is built on the proposal alone. The directive's standard is
held: nothing is declared more advanced than the evidence (all E2/E3; none E5/CLIENT_VALIDATED — honest).
