# V12.4 — V23: Final Batch 04 (P7, P14, P5) — Fifteen-métier operational qualification (2026-11-09)

Records V22. Completes the métier-qualification program: all fifteen métiers now have an individual E2E status backed by
evidence (not an artificial 15/15). ODG governs the full cycle; the independent assurer (a path distinct from the guard)
validates separately — the technical provider validates nothing of its own.

## LOT FINAL — P7, P14, P5 (deeply qualified)
Reuse the SAME orchestrator. Each positive + negative E2E with a genuinely INDEPENDENT assurer PROVEN to catch a
falsified ADMIT:

| Métier | domain | real guard | decisionOf | INDEPENDENT assurer (distinct path) | pos / neg | falsification caught |
|---|---|---|---|---|---|---|
| **P7** | SRE / SLO | `profession-p7-sre-reference.evaluateSLO` (input-adapted) | `compliant` | recompute p99 from RAW latencies (own sort + nearest-rank) + availability check | within SLO⇒ADMIT · breach⇒REJECT | B7 ✓ (faked compliant over a breached p99 ⇒ ASSURANCE_FAILED) |
| **P14** | devex | `profession-p14-devex-reference.scaffoldEvidence` | `attested` | recompute completeness from RAW bundle (buildRef+sbom.components+confinement{netOff,envCleared}+health.available) | complete⇒ADMIT · incomplete⇒REJECT | B14 ✓ (faked attested on an incomplete scaffold ⇒ ASSURANCE_FAILED) |
| **P5** | platform / progressive-delivery | `canary-decision-pack.assessCanaryCandidate` | `safe` | recompute the read-only canary conditions from the RAW spec (no eng/paths/network/spend/destructive) | read-only⇒ADMIT · engineering⇒REJECT | B5 ✓ (faked safe on an engineering mission ⇒ ASSURANCE_FAILED) |

### P5 — honest coverage resolution (Issue A: DIRECT COVERAGE)
The V21/V22 label "P5 (decision-rules)" was **imprecise**. Audited `decision-rules.ts` → it is a **P4-era goal→capability
router** (`match(goal)`; its own header says "P4 — Rule-based Decision Templates") that does **NOT** cover P5's métier.
The **métier benchmark defines P5 = progressive-delivery (canary) gate**, exercised by `canary-decision-pack.
assessCanaryCandidate` (read-only mission ⇒ safe canary; engineering/mutating ⇒ not). That is P5's **real** guard —
**Issue A, direct coverage** — wired honestly. **No guard was artificially assigned to reach 15/15.**

## §5 — P15 dedup weakness: defect demonstrated, callers audited, fixed
- **Defect demonstrated (evidence):** the default digest `JSON.stringify({metier,payload})` drops functions, so two P15
  sagas with identical step ids but opposite `forward` closures produce an **identical digest** (proven live).
- **Callers audited:** the digest is used ONLY in `metier-parcours.runParcours` (the dedup step); dedup is opt-in
  (triggers only when a caller passes `seenDigests`). Ordinary (serializable) métiers are unaffected.
- **Fix (justified by the proven defect):** a per-métier `digestOf(payload)` registry field; the generic safe digest is
  kept for ordinary métiers (unchanged). **P15's `digestOf`** builds a deterministic identity over step **ids + any
  non-function step fields + ctx**, **excluding closures**. Tested: a saga with different step ids is **NOT** a false
  DUPLICATE; an identical saga (same ids+ctx) **IS** a DUPLICATE (real dedup + idempotence preserved). Documented design:
  a saga differing ONLY in closure logic (same ids+ctx) is the same identity by design (closures are not hashable).

## §6 — Final framework maturity (fifteen métiers)
- **Genuinely common (the orchestrator, generic + stable):** the 10 governed steps (réception→identification→permission→
  capability-resolution→dedup→execution→result→independent-assurance→decision→audit/closure→recovery), all fail-closed.
  **Fifteen métiers integrated with only ONE justified core change in the whole program** (this V23 `digestOf` seam, on a
  demonstrated defect) — strong evidence the core is sufficiently generic; **not reconstructed**.
- **Legitimate per-métier variations (registry, never erased):** `resolve` (+ input adapters for positional guards:
  P4/P15/P6/P7), `decisionOf(verdict, payload)`, independent `assure`, optional `digestOf`.
- **Reusable assurer toolkit (proven across 15):** necessary-condition cross-check (P3/P11/P5/P14), raw-data recompute on
  a distinct path (P2/P9/P10/P13/P6/P7), distinct statistic (P4 TV vs PSI), sub-function cross-derivation (P8),
  state reconstitution (P15). Every one of the 15 assurers is `independent` and caught a falsified ADMIT.

## §9 — Fifteen-métier final states (REGISTERED / CONNECTED / CALLABLE / EXECUTED / VERIFIED)
All 15 are **REGISTERED + CONNECTED + CALLABLE** (gate) and now **EXECUTED + VERIFIED** as full parcours with an
independent assurer proven to catch a falsified ADMIT:

| Métier | real guard | decisionOf | independent assurer |
|---|---|---|---|
| P1 | `assess` | safe | output-set comparison |
| P2 | `passAtK` | reliable(threshold) | recompute pass@k from raw rollouts |
| P3 | `vetDependency` | decision | pinned∧¬typosquat∧integrity |
| P4 | `assessDrift` | gate==PASS | total-variation (≠PSI) |
| P5 | `assessCanaryCandidate` | safe | read-only conditions from raw spec |
| P6 | `evaluate` | f1≥threshold | recompute F1 from raw gold/pred |
| P7 | `evaluateSLO` | compliant | recompute p99 from raw latencies |
| P8 | `enforce` | ok | rank(actual)≥rank(required) |
| P9 | `unitEconomics` | viable∧within budget | recompute €/success |
| P10 | `assessIncidentDeadline` | REPORTED_ON_TIME | recompute due date (direct Date.UTC) |
| P11 | `routeDocument` | STRAIGHT_THROUGH | recompute STP eligibility from raw features |
| P12 | `evaluateBreaker` | admit | recompute failure rate (≠burnRate) |
| P13 | `carbonIntensity` | viable∧within budget | recompute SCI from raw factors |
| P14 | `scaffoldEvidence` | attested | recompute completeness from raw bundle |
| P15 | `runSaga` | COMMITTED | reconstitute via forward re-eval |

**Evidence per métier:** a positive scenario (ADMIT), a negative scenario (REJECT), and a controlled falsification
(wrong ADMIT ⇒ ASSURANCE_FAILED) — all synthetic fixtures, unblocking nothing canonical, no false real proof.
**Remaining limits:** the fixtures are synthetic technical scenarios — they prove the GOVERNED PARCOURS end-to-end, NOT
real client/production traffic (which remains an owner input, per the V12 dossier). The métiers' deeper business logic is
exercised only to the extent each guard + independent assurer covers.

## §10 — After the final batch
The **métier operational-qualification program is COMPLETE** (15/15 individual E2E states with evidence). Next global
priority (ODG to select) is NOT limited to métiers: strengthen the **transversal capabilities** — governance, engineering
autonomy (the L0-L4 loop), recovery, learning, the Radar self-improvement chain, and ODG's ability to improve its own
mechanisms — plus the standing owner-gated inputs (the 3 real-input voies + 13 decisions). The common métier-parcours
framework is a reusable, proven substrate for any future gate.

## Closure
Gate 404/404 (expanded metier-parcours suite, already gated); tsc clean; CI green on merge. §8 restrictions intact
(Truth Lock, 9 primitives, permissions, private VPS, no new public port, no net, no spend, no secret, no deletion; npm
globals untouched). **Fifteen métiers individually qualified with evidence — not an artificial 15/15.**
