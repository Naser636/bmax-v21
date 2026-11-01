# ODG Ten Capability Demonstrators P1–P10 (V1)

**CTO Master Campaign V2, Phase 5.** Date **2026-11-01**. Ten technical-capability demonstrators, one per profession, **composed from already-MERGED modules (reuse-first; G-01…G-08 + the permanent core)** — not ten new builds. Each demonstrator states: the scenario, the modules it composes, **what is runnable TODAY on ODG's own repo (synthetic) vs what needs a NEW governed lot**, its honest **maturity (R0–R5, none R4+)**, and its evidence output. **No demonstrator is a client deployment; all are own-repo/synthetic demonstrations. Any NEW code = a full governed lot (WORK_ITEM_CONTRACT → focused tests → both tsconfigs → build:runtime → full regression → independent adversarial validation → PR → 2 green CI → merge) — none is shipped as "done" here without that.**

## Readiness legend
- **COMPOSABLE-TODAY** — runnable now by composing merged modules in a demonstrator harness; no new production module required (a thin, separately-governed demo script may still be needed).
- **NEEDS-GOVERNED-LOT** — requires new glue/production code; listed as a candidate lot, NOT claimed built.

## The ten demonstrators

### P1 — Legacy-Modernization Safety Net (COMPOSABLE-TODAY, R3)
**Scenario:** capture a module's behavioral baseline, apply a refactor, prove behavior preserved (or flag CHANGED), with tamper-evident provenance. **Composes:** G-01 characterization-baseline (captureBaseline/compareToBaseline) + evidence-provenance (stamp/verify) + patch-executor (write-confined edit). **Runnable today:** yes — G-01's merged test suite already demonstrates BEHAVIOR_PRESERVED/CHANGED/NO_BASELINE on own-repo targets. **Evidence:** provenance-stamped baseline + comparison verdict. **Gap:** a multi-file "modernization session" wrapper = NEEDS-GOVERNED-LOT.

### P2 — Governed Agent Action (COMPOSABLE-TODAY, R3)
**Scenario:** an agent proposes an action; the gate returns ADMIT/DENY/ESCALATE fail-closed; admitted actions run under GovernedExecutor; the verdict is chartered. **Composes:** third-party-agent-gate (evaluateAgentAction) + agent-governance-harness + GovernedExecutor/authorizeExecution + G-02 charter-record + G-07 misleading-case-corpus (resistance check). **Runnable today:** yes — merged suites demonstrate deny-by-default + OWASP-Agentic-Top-10 handling + the honest 0.25 k-eval resistance figure. **Evidence:** chartered verdict (subject/method/ground-truth) + resistance score. **Gap:** live third-party-agent adapter = NEEDS-GOVERNED-LOT.

### P3 — CRA/SBOM Evidence Bundle (COMPOSABLE-TODAY, R3) — *top-ranked profession*
**Scenario:** generate a CycloneDX SBOM for a target, apply fail-closed license policy, attest provenance, seal a golden-path evidence bundle, export an OSCAL-interop pack. **Composes:** sbom-audit-service + license-policy (SPDX fail-closed) + supply-chain-attest + G-05 golden-path-evidence-bundle + G-08 evidence-pack-export. **Runnable today:** yes — each module is merged with passing suites; the bundle→export chain is demonstrable on own-repo dependencies. **Evidence:** sealed bundle (SBOM+confinement+health) + interop export (oscalNative:false, no SATISFIED/CERT). **Gap:** a single CRA-deadline-oriented "one-command" composition wrapper = NEEDS-GOVERNED-LOT (strong candidate — highest-ranked market).

### P4 — Dataset-Quality Gate (COMPOSABLE-TODAY, R2–R3)
**Scenario:** declare dbt-style assertions over a dataset, run them, emit SARIF, gate on IMPLEMENTED vs NOT_YET_IMPLEMENTED. **Composes:** G-04 dataset-quality-assertions (+toSarifFromDatasetQuality) + dataset-quality-service + independent-label-policy. **Runnable today:** yes — G-04's injected-defect fixtures demonstrate detection + valid SARIF. **Evidence:** SARIF log + assertion coverage. **Gap:** fairness on real data stays NO_DATA until an independently-labelled set (owner-gated OG-03); forwarding assertionType into SARIF = small NEEDS-GOVERNED-LOT (the G-04 non-blocking note).

### P5 — Golden-Path Evidence Emitter (COMPOSABLE-TODAY but R1 — HONEST)
**Scenario:** a paved build path emits a sealed SBOM+confinement+health bundle. **Composes:** G-05 golden-path-evidence-bundle + hermetic/bwrap build + odg-health. **Runnable today:** the *evidence-bundle* step is runnable; **but ODG has NO complete IDP — O8 is spec-only.** **Maturity R1 (honest).** This demonstrator proves the *evidence-emission* slice only, not a platform. **Gap:** an actual IDP/self-service portal = large NEEDS-GOVERNED-LOT / owner-scoped; NOT claimed.

### P6 — Evidence-Gated Acceptance (COMPOSABLE-TODAY, R3) — *deepest capability*
**Scenario:** parse a Gherkin spec into deny-by-default criteria, evaluate a candidate result, run it up the reality-gate ladder, resist misleading cases, charter the verdict. **Composes:** G-03 executable-spec-intake + mechanical-acceptance + reality-gate + k-eval + G-07 misleading-case-corpus + G-02 charter-record. **Runnable today:** yes — all merged with passing suites; this is ODG's core evaluation-integrity chain. **Evidence:** reality-gate state + chartered ACCEPT/REJECT/BLOCKED/UNKNOWN + resistance score. **Gap:** a unified "acceptance-run" CLI = NEEDS-GOVERNED-LOT.

### P7 — Reliability Evidence + DORA Read-Model (COMPOSABLE-TODAY, R2–R3)
**Scenario:** define an SLO + error budget, collect survivorship-guarded signals, compute denominator-explicit DORA four-keys, PREPARE (never auto-apply) a response, record incident recurrence. **Composes:** slo-targets/collector/response (autoApply=false) + G-06 dora-metrics (fourKeys) + incident-recurrence + checkpoint-engine + code-health-service. **Runnable today:** yes on synthetic runs — G-06 math + SLO PREPARE-not-APPLY are merged/tested. **Evidence:** four-key read-model (null where unobserved) + PREPARE plan. **Gap:** real DORA keys stay null until a provenanced baseline + stamped campaign run (owner-gated).

### P8 — E-Invoice Conformance + Governed Workflow (COMPOSABLE-TODAY, R2–R3) — *#2 market*
**Scenario:** build a neutral EN-16931 invoice, round-trip through Factur-X/UBL/CII, run it through the governed commercial pipeline with explicit prepared≠sent≠signed≠cashed stages. **Composes:** einvoice-* (round-trip) + commercial-pipeline (12-stage) + mission-*/campaign-controller. **Runnable today:** yes — einvoice round-trip + SENT-only-with-provider-proof are merged/tested. **Evidence:** conformance result + audit-chained pipeline state. **Gap:** a live PDP/Plateforme-Agréée connector (France 2026 mandate) = NEEDS-GOVERNED-LOT + owner-gated external connectivity.

### P9 — Prove-the-Number FinOps (COMPOSABLE-TODAY, R2–R3)
**Scenario:** extract observed usage, compute unit economics on a comparable basis, allocate costs, refuse un-provable numbers. **Composes:** economic-extractor + unit-economics + economic-unit + budget-ledger/budget-contract (ALLOCATOR) + cost-accounting. **Runnable today:** yes on observed own-repo/synthetic usage — merged/tested. **Evidence:** provable unit-economics + allocation; refusal on un-provable inputs. **Gap:** FOCUS-format conformance = honest non-goal; live cloud-billing ingestion = NEEDS-GOVERNED-LOT + owner-gated external credentials.

### P10 — Source-Cited Regulatory Evidence Pack (COMPOSABLE-TODAY, R2–R3) — *#4 market*
**Scenario:** classify an AI system's AI-Act role, map clauses to mechanisms (mechanism≠satisfied), assemble a compliance-evidence pack, export OSCAL-interop, refuse any uncited/superlative claim, label NOT_CERTIFIED. **Composes:** ai-act-role-classifier + iso-* clause matrices + regulatory-assurance (source-cite-or-refuse) + compliance-evidence-pack + G-08 evidence-pack-export + excellence-policy. **Runnable today:** yes — merged/tested; O3 readiness matrix is byte-identical reproducible (10/10). **Evidence:** role classification + clause→mechanism map (0 SATISFIED) + interop pack labelled NOT_CERTIFIED. **Gap:** none to *certify* (by design — ODG is not a cert body); a live regulatory-register feed = NEEDS-GOVERNED-LOT + owner-gated.

## Summary
| Demonstrator | Readiness | Maturity | New code needed? |
|---|---|---|---|
| P1 Modernization safety net | COMPOSABLE-TODAY | R3 | session wrapper (lot) |
| P2 Governed agent action | COMPOSABLE-TODAY | R3 | live adapter (lot) |
| P3 CRA/SBOM evidence bundle | COMPOSABLE-TODAY | R3 | one-command wrapper (lot) ← priority |
| P4 Dataset-quality gate | COMPOSABLE-TODAY | R2–R3 | assertionType→SARIF (small lot) |
| P5 Golden-path evidence | COMPOSABLE-TODAY (slice) | **R1** | full IDP (owner-scoped) |
| P6 Evidence-gated acceptance | COMPOSABLE-TODAY | R3 | acceptance CLI (lot) |
| P7 Reliability + DORA | COMPOSABLE-TODAY | R2–R3 | provenanced baseline (owner-gated) |
| P8 E-invoice conformance | COMPOSABLE-TODAY | R2–R3 | PDP connector (lot + owner-gated) |
| P9 Prove-the-number FinOps | COMPOSABLE-TODAY | R2–R3 | billing ingest (lot + owner-gated) |
| P10 Regulatory evidence pack | COMPOSABLE-TODAY | R2–R3 | register feed (lot + owner-gated) |

**Honest reading:** nine of ten demonstrators are composable TODAY from merged, independently-validated modules at R2–R3 on synthetic/own-repo data; P5 is R1 (evidence slice only, no IDP). None is a client deployment. Each "new code needed" item is a **candidate governed lot**, not a claim of work done. **Priority new lot (if authorized): the P3 CRA/SBOM one-command composition** — top-ranked market + all constituent modules already merged.

## Acceptance (Phase 5)
Ten demonstrators, one per profession, reusing G-01…G-08 + merged core ✓ · each cites only merged modules ✓ · each separates runnable-today from needs-governed-lot ✓ · honest maturity, none R4+ ✓ · P5 R1/no-IDP explicit ✓ · no client-deployment or false "built" claim ✓ · any new code flagged as a future governed lot with full discipline ✓. **Next: Phases 6–12 (Gate-D integration, commercial design, accelerated execution, blockers, R0–R5 benchmarks, canonical docs, governed rules, closure).**
