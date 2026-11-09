# V12.4 — P1–P15 Métier Realization Fiches (CTO Continuation §4, 2026-11-09)

**Technical fields are REAL** (from the in-repo profession/capability modules + their gate-tested demos). **Commercial
fields** (target clients/sectors, competitor prices, proposed prices, margins) **require external market data that ODG
cannot obtain or fabricate** (no internet; external research owner-gated) — they are marked **`[MARKET-RESEARCH-REQUIRED]`**
and left for the §5 external-research gate, never invented. **No métier is declared commercially operational** — each has
a *verified technical demonstration* (its gate-tested `runReferenceProject` / E3 adversarial case), not a paid delivery (§12).

Legend: **OP** = operational & gate-tested · **TB** = to build · **DEMO** = the verified technical demonstration ·
`[MR]` = `[MARKET-RESEARCH-REQUIRED]` (external, not fabricated).

---

### P1 — Software / Full-Stack
- **Mission:** autonomous software engineering; behaviour-preserving refactor + reference delivery.
- **OP:** `refactorPreservesBehaviour`, `runReferenceProject` (E2 reference + E3 behaviour-changing-refactor/coverage-gap). DEMO: gate-tested.
- **TB:** client-project intake→delivery packaging (partly in `pilot-delivery-packager`). **Services/products/automations/prices/clients/margin:** `[MR]`.

### P2 — AI / ML / Agentic
- **Mission:** agentic/LLM systems with injection resistance.
- **OP:** `injectionResistance`, `runReferenceProject` (E3 prompt-injection). + lethal-trifecta-gate, tool-definition-integrity. DEMO: gate-tested.
- **TB:** productized agent template. **Commercial:** `[MR]`.

### P3 — Security / DevSecOps
- **Mission:** security scanning + adversarial hardening.
- **OP:** `scanProject`, `syntheticProject` (E2 scan + E3 adversarial). + security-control-plane (5 gates→1 verdict), secret-rotation-hygiene. DEMO: gate-tested.
- **TB:** client-repo scan report product. **Commercial:** `[MR]`.

### P4 — Data (Engineering/Analytics)
- **Mission:** data quality, lineage, schema compatibility, idempotent replay.
- **OP:** `assessDataQuality`, `checkLineage`, `schemaCompatibility`, `idempotentReplay`. + dataset-freshness, pii-minimization. DEMO: gate-tested.
- **TB:** pipeline-as-a-service. **Commercial:** `[MR]`.

### P5 — Cloud / Platform / DevOps (IDP)
- **Mission:** golden-path platform, progressive delivery.
- **OP (via capability modules):** `deployment-readiness`, `canary-decision-pack` (canary/blue-green), `deploy/` package, `progressive-delivery-gate`. DEMO: gate-tested.
- **TB:** full IDP product (owner-gated). **Commercial:** `[MR]`.

### P6 — Quality / AI-Evaluation
- **Mission:** honest evaluation resistant to metric-gaming.
- **OP:** `evaluate`, `syntheticCorpus` (E3 metric-gaming). + eval-significance, benchmark-contamination, calibration-trust-gate. DEMO: gate-tested.
- **TB:** eval-as-a-service dashboard. **Commercial:** `[MR]`.

### P7 — SRE / Distributed / Performance
- **Mission:** SLO evaluation, chaos recovery, latency percentiles.
- **OP:** `evaluateSLO`, `percentiles`, `chaosRecovery` (E3 chaos). DEMO: gate-tested.
- **TB:** SLO-monitoring product. **Commercial:** `[MR]`.

### P8 — API, Integration & Business Software (incl. FR e-invoicing)
- **Mission:** API-contract validation + French e-invoicing compliance.
- **OP (via capability modules):** `api-contract`, `einvoice*` (DOCTYPE/ENTITY reject), commercial-pipeline. + e-invoice in-force dates. DEMO: gate-tested.
- **TB:** e-invoicing SaaS (billing owner-gated, `p01-billing-sandbox`). **Commercial:** `[MR]`.

### P9 — FinOps (unit economics)
- **Mission:** cloud/AI unit economics with OBSERVED/ESTIMATED/SIMULATED separation + budget stop.
- **OP:** `computeCosts`, `budgetStop`, `auditSeparation`, `COST_KINDS`. + p9-budget-burndown-forecast. DEMO: gate-tested.
- **TB:** FinOps reporting product. **Commercial:** `[MR]`.

### P10 — EU Regulatory / AI Assurance & Compliance
- **Mission:** regulatory evidence prep without overclaim.
- **OP:** `buildEvidencePrep` (E3 overclaim/undetermined). + regulatory-assurance (source-cite-or-refuse), ai-act-in-force, iso NOT_CERTIFIED honesty. DEMO: gate-tested.
- **TB:** compliance-dossier product. **Commercial:** `[MR]`.

### P11 — Document Processing / IDP
- **Mission:** document extraction with mandatory-field + calculation checks.
- **OP:** `processDocument` (E3 missing-mandatory/broken-calc). + p11-document-routing. DEMO: gate-tested.
- **TB:** IDP SaaS. **Commercial:** `[MR]`.

### P12 — Real-Time Streaming / Event-Driven
- **Mission:** ordered/exactly-once stream processing with replay consistency.
- **OP:** `processStream`, `replayConsistent` (E3 out-of-order/duplicate). + circuit-breaker, dead-letter-quarantine, idempotency-key-collision. DEMO: gate-tested.
- **TB:** streaming-pipeline product. **Commercial:** `[MR]`.

### P13 — AI Infra / GPU
- **Mission:** model serving with capacity boundaries + simulated-vs-measured honesty.
- **OP:** `serveAndMeasure` (E3 capacity/honesty). + quantization-honesty-gate, software-carbon-intensity. DEMO: gate-tested.
- **TB:** inference-hosting product (GPU owner-gated). **Commercial:** `[MR]`.

### P14 — DevEx golden-path
- **Mission:** scaffold evidence bundles, confined golden paths.
- **OP:** `scaffoldEvidence` (E3 incomplete-scaffold/unconfined). + golden-path PoC (`poc/o8-golden-path`). DEMO: gate-tested.
- **TB:** internal-developer-platform product. **Commercial:** `[MR]`.

### P15 — Automation / Workflow
- **Mission:** workflow orchestration with approval gates + flaky/error handling.
- **OP:** `orchestrate`, `PROCESS` (E3 missing-approval/flaky). DEMO: gate-tested.
- **TB:** workflow-automation SaaS. **Commercial:** `[MR]`.

---

## Honest realization status

- **Operational & gate-tested (technical):** all 15 métiers have a verified technical demonstration (E2 reference + E3
  adversarial, or capability-module equivalent for P5/P8). This is **proof of engineering capability, not a sold service.**
- **To productize:** each métier's SaaS/product packaging is `TB` and most carry an owner-gated dependency (billing,
  GPU, public exposure, real client).
- **Commercial dimensions** (clients, sectors, competitor/proposed prices, margins): **`[MARKET-RESEARCH-REQUIRED]`** —
  ODG will not fabricate them. They are filled only when the owner authorizes external research or supplies sourced data
  (§5). Until then these cells stay explicitly empty — an honest gap, not a guess.
