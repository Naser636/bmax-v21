# ODG — Métier Excellence Study (world references → comparison → build)

> **SÉRIE 13.** Per-métier P1–P15: current ODG capability, measured baseline, world references (dated, sourced,
> primary where possible), critère-by-critère comparison, demonstrated gaps, buildable opportunity, and a decision
> (INTEGRATE / IMPROVE / WATCH / REJECT). **Honesty:** no world-ranking, certification, or client result is invented;
> reputation ≠ technical superiority; external content is untrusted data. Where an improvement is buildable locally, a
> prototype + test is built and linked. Appended métier-by-métier; this doc is the canonical study (no parallel registry).

---

## P1 — Software / Full-Stack (autonomous software engineering)

1. **ODG capability.** `profession-p1-fullstack-reference.ts` — behaviour-preservation via a sealed characterization
   baseline (`characterization-baseline`): a refactor is safe only if observed behaviour is preserved; coverage gap ⇒
   INCOMPLETE (fail-closed). Reinforced by `change-impact-graph` (dep/impact), `objective-fidelity`, repair modules.
2. **Baseline (measured).** Behaviour-preservation verdicts are deterministic + reproducible; `change-impact-graph`
   now returns the real TS dependency graph (fixed SÉRIE 12). No SWE-bench-style issue-resolution score is claimed
   (ODG does not run a live model on SWE-bench — that is an owner-gated E5 experiment).
3. **World references (dated, sourced).**
   - **SWE-bench Verified** — gold-standard issue-resolution benchmark; top agent (Claude Mythos Preview) 93.9%, Opus 4.7 87.6%, GPT-5.3 Codex 85% (late May 2026). [demandsphere radar; Beyond SWE-Bench 2026]
   - **Critical finding:** ~**19.78%** of "solved" SWE-bench Verified cases are **semantically wrong** — pass the stated test yet functionally incorrect. [arXiv 2609.08149 SWE-Bench Pro Verified; Beyond SWE-Bench 2026]
   - New complementary benchmarks: SWE-Chain (release-level upgrades, arXiv 2605.14415), SWE-Touch (user edits, 2608.02499), SWE-Cycle (2605.13139), ChainSWE multi-bug (2607.02606), DeNovoSWE (repo-from-scratch, 2606.10728).
   - "Reality is the final verifier" — agents over-trust self-reports; real execution is the oracle (arXiv 2609.12039).
4. **Comparison (critère by critère).**
   | Critère | World best | ODG | Verdict |
   |---|---|---|---|
   | Issue-resolution rate | 85–94% (live models) | not run (owner-gated E5) | ODG does not compete here without a live-model experiment |
   | Semantic correctness of a "solved" fix | ~19.78% semantically wrong even at the top | **behaviour-preservation is the gate; held-out change ⇒ not safe** | **ODG's doctrine directly targets this gap** |
   | Over-trust of green tests | a known failure mode | "green build never sufficient" + characterization | ODG aligned |
5. **Demonstrated gap.** ODG's P1 reference checked behaviour-preservation but did not explicitly COMBINE the
   stated-test signal with the characterization signal to name the "passes-tests-but-semantically-wrong" case.
6. **Opportunity (built).** `p1-semantic-regression-guard.ts` — SAFE only when stated-tests-pass AND held-out
   behaviour preserved; tests-pass + behaviour-changed ⇒ **SEMANTIC_REGRESSION** (the 19.78% case), fail-closed.
7. **Prototype.** Built + tested (`p1-semantic-regression-guard.test.ts`, 7 assertions). Composes P1's baseline; no new engine.
8. **Tests/benchmarks needed.** A live-model SWE-bench run to quantify how many agent "fixes" the guard would catch is
   an owner-gated E5 experiment (real model, real repos) — NOT_RUN; documented, not faked.
9. **Results.** The guard deterministically flags the semantic-regression failure mode on synthetic before/after sets.
10. **Decision: INTEGRATE** (the guard, local + synthetic) + **WATCH** (a live SWE-bench E5 experiment — owner-gated).

---

## P2 — AI / ML / Agentic

1. **ODG capability.** `profession-p2-ai-reference.ts` — held-out (leakage-free) quality via `benchmark-factory` +
   prompt-injection resistance via `frontier-radar.sanitizeExternal`; `third-party-agent-gate` (ADMIT/DENY/ESCALATE).
2. **Baseline.** Held-out accuracy + injection-refusal are deterministic; contamination/metric-gaming flagged.
3. **World references.** τ-bench **pass^k** across k independent rollouts (single-pass overstates reliability); BFCL
   (AST / executable / irrelevance tracks); **NIST AI Agent Standards Initiative (Feb 2026)**; OWASP LLM/Agentic Top-10.
4. **Comparison.** ODG had held-out accuracy but **no reliability-under-repetition** metric; τ-bench's pass^k is the
   frontier reliability standard. Injection resistance: ODG aligned (sanitizeExternal + quarantine).
5. **Gap.** No pass^k reliability metric — a single-pass accuracy can hide flakiness.
6. **Opportunity (built).** `p2-passk-reliability.ts` — pass^k (reliable only if ALL k rollouts pass, fail-closed) +
   `reliabilityDrop = pass^1 − pass^k` exposing hidden flakiness; names flaky tasks.
7. **Prototype.** Built + tested (8 assertions). Complements held-out eval; no new engine.
8. **Tests/benchmarks needed.** A live-model multi-rollout run on τ-bench-style tasks is an owner-gated E5 experiment.
9. **Results.** Deterministically distinguishes a reliable task set (pass^k=1) from a flaky one (pass^1=1, pass^k<1).
10. **Decision: INTEGRATE** (the metric) + **WATCH** (live τ-bench E5 — owner-gated).

---

## P7 — SRE / Reliability / Performance

1. **ODG capability.** `profession-p7-sre-reference.ts` (p50/p95/p99, SLO, chaos RTO/RPO) + `dora-metrics` + `reliability-dora-demonstrator`.
2. **Baseline.** SLO + error-budget-burn computed; percentiles deterministic.
3. **World reference (primary).** **Google SRE Workbook, Ch.5 "Alerting on SLOs"** — multi-window multi-burn-rate
   alerting (14.4×/6×/3×/1× for 1h/6h/1d/3d); a page needs a long AND a short window to reduce false alarms.
4. **Comparison.** ODG computed a burn but used a single window; the industry standard is multi-window.
5. **Gap.** No multi-window confirmation ⇒ more false pages / slower detection trade-off not optimised.
6. **Opportunity (built).** `p7-burn-rate-alert.ts` — multi-window alert (page only when BOTH windows exceed burn),
   standard Google tiers, fail-closed.
7. **Prototype.** Built + tested (10 assertions). Complements the P7 SLO reference; no new engine.
8. **Tests/benchmarks.** Real telemetry replay is owner-gated (provenanced telemetry baseline, E5).
9. **Results.** Fires PAGE only on sustained both-window burn; single-window spikes do not page.
10. **Decision: INTEGRATE** (multi-window alerter) + **WATCH** (real telemetry E5).

## P3–P6, P8–P15 — comparison summary (ODG already aligned; WATCH)

Full research confirms ODG's existing references match or encode the frontier doctrine; no forced build (building a
module where none is needed would be churn). Each carries a **WATCH** for a live/E5 experiment (owner-gated).

| Métier | World reference (2026) | ODG capability | Verdict |
|---|---|---|---|
| **P3** Cybersecurity | agentic supply-chain (CSA); only ~1/5 AI-suggested deps safe; bash-trick agent bypass | `license-policy`, bwrap confinement, P3 scan + **`p3-dependency-trust-gate` (SÉRIE 14 BUILT)** | **BUILT** — pre-install trust gate (exact-pin + safe-to-bundle license + integrity + typosquat), fail-closed |
| **P4** Data | data contracts, lineage, schema-evolution, **PSI drift** | P4 quality+lineage+schema-compat + **`p4-distribution-drift` (SÉRIE 14 BUILT)** | **BUILT** — Population Stability Index drift detection, fail-closed on unseen categories |
| **P5** Cloud/Platform (IDP) | golden-path IDP, evidence emitters | `deployment-readiness` + `golden-path-evidence-bundle` + `deploy/` package | ALIGNED on the evidence slice; IDP product owner-gated |
| **P6** Quality/Eval | held-out, contamination, reward-hacking | `benchmark-factory` (leakage/metric-gaming) + P6 held-out + `meta-intelligence` | ALIGNED — frontier validates ODG (R5) |
| **P8** API/e-invoice | EN 16931, **SemVer discipline**, breaking-change detection | `api-contract` + `einvoice-validator` + **`p8-semver-enforcement` (SÉRIE 14 BUILT)** | **BUILT** — breaking change ⇒ major-bump required, else SEMVER_VIOLATION |
| **P9** FinOps | FOCUS spec, unit economics, AI token cost | P9 OBSERVED/ESTIMATED/SIMULATED separation + budget-stop | ALIGNED on separation; **buildable: AI unit-economics (see P9 below if built)** |
| **P10** Regulatory | AI-Act role, anti-overclaim | `ai-act-role-classifier` + `regulatory-assurance.assertNotCertified` | ALIGNED; cert is external (NOT_CERTIFIED) |
| **P11** IDP/Document | Factur-X, OCR pipelines | `einvoice-validator` + parser/extract | ALIGNED on structured; real OCR owner-gated |
| **P12** Streaming | exactly-once, replay, backpressure, **event-time watermarks** | P12 ordering/dedup/replay + **`p12-watermark` (SÉRIE 14 BUILT)** | **BUILT** — Flink/Beam watermarks + late-event policy (ON_TIME/LATE/DROPPED), fail-closed |
| **P13** AI Infra/GPU | serving throughput, pass^k, cost | `inference-engine` cpu-reference vs gpu-SIMULATED honesty | ALIGNED on honesty; real GPU (E5) owner-gated |
| **P14** DevEx | golden paths, scaffolding | `golden-path-evidence-bundle` + `deploy/` | ALIGNED on evidence; graduated-CI owner-gated |
| **P15** Automation/Workflow | durable orchestration, approvals, **saga compensation** | `workflow-engine` + **`p15-saga-compensation` (SÉRIE 14 BUILT)** | **BUILT** — compensate committed steps in reverse on failure; COMPENSATION_FAILED fail-closed |

---

## P9 — FinOps (unit economics, built)

1. **ODG capability.** `profession-p9-finops-reference.ts` — OBSERVED/ESTIMATED/SIMULATED cost separation + budget-stop.
2. **Baseline.** Cost kinds kept strictly separate; budget-stop on OBSERVED spend.
3. **World reference.** AI-FinOps frontier: the decision metric is **cost per successful outcome** (unit economics),
   not total cost — failed/retried attempts consume budget without value (FOCUS spec; AI cost/unit-economics 2026).
4. **Comparison.** ODG separated cost kinds but did not compute cost-per-success.
5. **Gap.** No unit-economics metric ⇒ a low total cost could still be economically unviable (all spend on failures).
6. **Opportunity (built).** `p9-unit-economics.ts` — cost-per-success on OBSERVED cost only; zero successes ⇒
   undefined (null, never 0); `wasteRatio` surfaces spend on failed attempts; `withinUnitBudget` fail-closed.
7. **Prototype.** Built + tested (9 assertions). Complements the P9 reference; no new engine.
8. **Tests/benchmarks.** Real cloud-billing unit economics is owner-gated (E5).
9. **Results.** Distinguishes a viable unit economic (€0.25/success) from an unviable one (0 successes ⇒ not viable).
10. **Decision: INTEGRATE** (unit-economics) + **WATCH** (real billing E5).

---

## SÉRIE 15 — deep study of the 6 ALIGNED métiers (P5, P6, P10, P11, P13, P14)

Each was re-researched for a NEW transferable advantage; a prototype was built ONLY where a real gap was established.

| Métier | 2026 world reference | ODG already has | Gap → decision |
|---|---|---|---|
| **P5** Cloud/Platform | progressive delivery (canary/blue-green), platform engineering (Backstage) | `canary-decision-pack` (assess + decision pack), `deployment-readiness`, `deploy/` | progressive delivery covered → **ALIGNED**; WATCH live rollout (E5) |
| **P6** Quality/Eval | **mutation testing** (Stryker/PIT) — a passing suite ≠ bug-catching | held-out eval + metric-gaming (benchmark-factory) | **no test-effectiveness measure → BUILT `p6-mutation-testing`** (kill/survive, fail-closed) |
| **P10** Regulatory | EU AI-Act staged obligations (GPAI 2025, high-risk 2026/2027) | `ai-act-role-classifier` (+ STANDARDS_OBLIGATIONS_REGISTER timeline), `regulatory-assurance` anti-overclaim | timeline already encoded → **ALIGNED**; cert external (NOT_CERTIFIED) |
| **P11** Document | RAG/IDP, extraction-confidence, Factur-X | `einvoice-validator`/parser/`factur-x-extract` | structured path covered → **ALIGNED**; real OCR/scanned corpus = E5 owner-gated |
| **P13** AI Infra/GPU | continuous batching, KV-cache, speculative decoding | `inference-engine` (cpu-reference vs **gpu-SIMULATED honesty**) | honesty gate covered; real GPU serving = **E5 owner-gated** → **ALIGNED** (no synthetic GPU-perf claim) |
| **P14** DevEx | DORA four keys, SPACE/DX developer-experience | `dora-metrics` (fourKeys), `golden-path-evidence-bundle`, `deploy/` | DORA covered → **ALIGNED**; graduated-CI product = E5 |

### P6 build detail
`p6-mutation-testing.ts` — inject mutants, measure **kill vs survive** against a test oracle; a surviving mutant = a
test-suite gap. Fail-closed: no oracle / original-fails-own-suite / **zero mutants ⇒ invalid (NOT a pass)**. Directly
encodes §4's doctrine *"passing its own tests ≠ excellent"*. 9 assertions. Decision **INTEGRATE**.

---

*Genuine métier builds across Série 13–15: **P1, P2, P3, P4, P6, P7, P8, P9, P12, P15** (10). Honestly **ALIGNED**: P5,
P10, P11, P13, P14 (5). Each build is grounded in a dated/primary world reference and composes existing ODG modules
(no new engine); each ALIGNED verdict cites the existing module that already encodes the frontier doctrine.*
