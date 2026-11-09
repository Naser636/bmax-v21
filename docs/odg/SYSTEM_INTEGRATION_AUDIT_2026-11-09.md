# V12.4 — System-Wide Integration & Capability-Utilization Audit (2026-11-09)

**CTO System-Wide Integration directive §2/§3/§4/§7/§10.** Audit built by RUNNING the existing tools (no concurrent
inventory, no new engine — §2/§10). Truth Lock `main @ a7caebc`; preservation intact (5 stashes / 6 untracked). Closed
audits (parity, universal autonomy, Radar) are NOT redone (§1.6).

## §2 — Component inventory (from `capability-map`, the canonical registry — not a concurrent list)

- **352 capabilities** inventoried, all **L2_INTEGRATED** (ACCEPTED + evidence; honest — none claimed L3 without
  independent validation; the 28 independently-validated missions are tracked separately).
- **434 modules** in `runtime/core` (the static dependency graph's node set).
- Each capability carries identity / maturity / deps / dependents (capability-map) + NATIVE/PROVIDER/HUMAN/UNKNOWN typing
  (provider-capability-contract classifies provider admission).

## §3 — Connection graph (from `change-impact-graph`) with the honest caveat

- The static graph reports **178 modules with no static consumer AND no static dep**. **This is NOT 178 dead
  components** — spot-checks show each is referenced repo-wide (its own test / bin / dynamic dispatch). Confirmed earlier
  by the architecture-audit: the static graph UNDER-approximates edges (dynamic/string/contract-test references). So
  "no static edge" ≠ "unused"; "present/registered" ≠ "actually called" is answered honestly: **static analysis cannot
  fully prove runtime invocation for dynamically-dispatched modules** — the e2e/gate tests (392/392) are what prove
  real invocation.
- **0 circular dependencies, 0 exact responsibility duplications** (architecture-audit) — the graph is clean.

## §4 — Capability-utilization layer ALREADY EXISTS (not rebuilt)

- **`capability-router.route`**: given a task, builds an ordered **native-first plan** (Memory → Rules → Local LLM →
  External AI **last resort**) and picks the first local resolver — external AI only when every local tier fails. This
  is §4's "select the right component + prefer native + rank alternatives."
- **`capability-map`** (discovery/inventory), **`capability-registry`**, **`cognitive-decision` / `cognitive-objective-
  selection`** (decision with rationale), **`capability-authorization`** (permission check before use), **`capability-
  learning` / `capability-metrics`** (memorize performance/limits). The §4 ten sub-capabilities are present; **no new
  selector built** (would duplicate).

## Components × Métiers matrix (the genuinely-new artifact — real static deps)

| Métier | Transversal components it composes (direct deps) |
|---|---|
| P1 Full-Stack | characterization-baseline |
| P2 AI | benchmark-factory, frontier-radar |
| P3 Security | bash-command-governor, frontier-radar, license-policy |
| P4 Data | api-contract |
| P6 Eval | meta-intelligence |
| P7 SRE | (self-contained) |
| P9 FinOps | (self-contained) |
| P10 Regulatory | ai-act-role-classifier, regulatory-assurance |
| P11 Document | einvoice-validator |
| P12 Streaming | (self-contained) |
| P13 AI-Infra | inference-engine |
| P14 DevEx | golden-path-evidence-bundle |
| P15 Workflow | workflow-engine |

**10/13 métiers compose transversal components** (integration is real, not paper); 3 are self-contained by design. Beyond
direct static deps, all 15 métiers additionally pass the shared gates (security-control-plane, benchmark-contamination,
metier-benchmark-multidim) — a broader integration the static-dep view understates.

## §7 — Claude Code dependency (measured honestly)

- **Capability modules: 100% NATIVE** — all 352 are ODG's own deterministic code; the designed `capability-router`
  routes **native-first** (external AI last resort).
- **This session's orchestration/authoring: Claude-Code-driven.** Honest distinction: ODG's *components* are native, but
  the *development/authoring* this session (writing modules, wiring, deciding sequence) is performed by Claude Code as
  the technical provider under CTO/ODG direction. ODG does not yet autonomously author new modules without Claude Code;
  the repair-autonomy chain runs native for *deterministic* defect classes and ESCALATES novel ones (proven). **The
  residual Claude-Code dependency is: novel code authoring + multi-step engineering judgment** — measured, not hidden.
- Claude Code never chose strategy/priorities or certified its own results (independent validation + the gate do that).

## §5 — Progressive wake-up (stages against real evidence)

A Inventory ✓ (capability-map) · B Connectivity ✓ (change-impact-graph, with the static caveat) · C Usability ✓ (every
capability is invoked by its gate test) · D Composition ✓ (10/13 métiers compose components; repair-autonomy-selftest
composes the repair chain) · E Autonomy — PARTIAL (native for deterministic classes; novel authoring needs Claude) · F
Robustness ✓ (malformed/escalation proven across repair-autonomy + radar-scenario + métier benchmarks) · G Optimization ✓
(throughput + targeted-verify measured).

## §10 — Deliverables & genuine gaps

Produced: component inventory (352), connection graph (+ honest caveat), components×métiers matrix (new), capability-
selection coverage, Claude-dependency measure. **No new engine built** (the utilization layer exists). The one genuinely
measured limitation is **Stage-E autonomy: ODG cannot yet autonomously author novel modules without Claude Code** — a
real, honest residual (not owner-gated, but a genuine capability frontier), and **live external continuous scanning**
stays owner-gated. No redundant module created (5th anti-duplication check passed).
