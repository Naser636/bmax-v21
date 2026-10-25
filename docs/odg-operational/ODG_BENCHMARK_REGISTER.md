# ODG Benchmark & Technology-Decision Register (A / B / C)

**As of:** 2026-10-25 · All external rows **live-sourced on 2026-10-25** (WebSearch + WebFetch functional this session).

> Discipline: this records what competitors/standards actually are, with sources. It does **NOT** claim ODG beats
> any of them — that requires a comparable-task benchmark we have **not** run. Licence categories are kept distinct:
> **MIT/Apache = permissive OSS** · **Elastic License 2.0 = source-available (use restrictions, no resell-as-service)**
> · **Proprietary = closed**. Governance categories kept distinct: **framework (voluntary)** vs **certifiable
> standard** vs **binding law**.

---

## 1. Domain A/B — agent orchestration, observability, evals, guardrails, tracing

| Tool | What it does | Licence | Deploy | Notes |
|------|-------------|---------|--------|-------|
| **LangGraph** | Stateful multi-step agent workflows (graph nodes, persistence/checkpointing, human-in-loop, recovery) | **Split**: `langgraph` lib + `langchain-core` = **MIT**; `langgraph-api` server = **Elastic License 2.0** | Both (OSS lib self-host; managed Platform paid) | checkpointing/recovery ideas relevant to Domain A |
| **LangSmith** | Hosted tracing, evals/experiments, datasets, prod monitoring | **Proprietary** (closed SaaS) | SaaS; self-host Enterprise only | trace-volume + per-seat billing |
| **Langfuse** | OSS LLM observability/tracing, evals, prompt mgmt, datasets | **MIT** core (few Enterprise features commercial) | Both (self-host no usage limits, or SaaS) | acquired by ClickHouse 2026-01-16, stated to stay OSS |
| **Braintrust** | Eval-first: dataset-centric evals, scoring, experiments, prod obs | **Proprietary** (no OSS core) | SaaS; BYO-cloud on Enterprise | strong eval UX; lock-in risk |
| **Arize Phoenix** | LLM/agent tracing, evals, debugging; OTLP + OpenInference (OTel) auto-instrument | **Elastic License 2.0** (source-available, NOT OSI; no resell-as-service) | Both (self-host unrestricted except resale; managed "AX") | speaks OpenTelemetry |

**Terminology note:** Phoenix and `langgraph-api` are **source-available (ELv2)**, not OSI open-source. Only
LangGraph's core library and Langfuse's core are true permissive OSS (MIT).

## 2. Domain C — intelligent document processing / OCR / extraction / reconciliation

| Tool | Capability | Licence / billing | Deploy | Price posture |
|------|-----------|-------------------|--------|---------------|
| **UiPath Document Understanding** | IDP in the UiPath platform: classify+extract (120+ doc skills), validation + human-in-loop exceptions, feeds RPA for downstream reconciliation | Proprietary; consumption-based (~0.2 PU/page std, 0.4 generative; per-operation billing from 2026-07) | Both (Cloud or on-prem) | high / quote-only; add-on ~$10k–$200k/yr; +20–30% consumption contingency |
| **ABBYY Vantage** | No/low-code IDP + OCR (200+ langs, 26 barcode fmts); pre-trained invoice/PO/receipt/contract/bank-statement skills | Proprietary; page-based (~$0.02–$0.10/page) or transaction | Both (SOC2 cloud EU/US/AU, on-prem, edge) | custom-quoted; year-1 services ~30–60% of licence |
| **Rossum** | Template-free "Aurora" doc AI for invoice/AP extraction; validation queues, approval routing; 276 langs + handwriting; P2P/ERP integrations | Proprietary; acquired by Coupa 2026-05-12 | Primarily SaaS (regional residency); single-tenant optional | starter ~$18k/yr; est. ~$25k–$120k+/yr; connectors paid |

All three are **closed, quote-driven enterprise** products. They set the **capability bar** (template-free
extraction, validation queues, exception handling, ERP/P2P hooks) — ODG does **not** claim parity on accuracy or
language coverage absent a comparable benchmark.

## 3. Governance standards — framework vs certification vs law (never conflate)

| Standard | Nature | Key facts |
|----------|--------|-----------|
| **NIST AI RMF 1.0** | **Voluntary framework** (not law, not a cert) | Jan 2023; Govern/Map/Measure/Manage; no official attestation — any "RMF certification" is a private training cert |
| **ISO/IEC 42001:2023** | **Certifiable standard** (voluntary to adopt; audit → certificate) | First AI management-system standard; certifies the **management system, not the product**; 3-yr certificate; held by AWS/Anthropic/Microsoft |
| **EU AI Act** | **Binding law** (risk-tiered, penalties) | Transparency (Art. 50) + GPAI enforcement live **2026-08-02**; high-risk Annex III → **2027-12-02**; Annex I → **2028-08-02**; high-risk needs conformity assessment, QMS, CE marking, registration |

Sources (all accessed 2026-10-25): LangGraph LICENSE (github.com/langchain-ai/langgraph); Langfuse
self-hosting docs; Arize Phoenix LICENSE (ELv2 confirmed from repo); LangSmith/Braintrust pricing pages; UiPath DU
blog + vendr; ABBYY Vantage + vendr; Rossum capterra/erpresearch; NIST/ISO/EU-AI-Act official + analysis pages.

## 4. Technology decisions for ODG (reuse-first, licence-safe)

| Decision | Choice | Rationale | Licence red line |
|----------|--------|-----------|------------------|
| Trace model (A/B) | Instrument to **OpenTelemetry / OpenInference** (vendor-neutral) | both Phoenix & Langfuse speak it; avoids single-vendor SDK lock-in | — |
| Observability backend (if adopted) | **Langfuse (MIT)** for self-host | only self-host option whose licence permits embedding/redistribution | avoid proprietary LangSmith/Braintrust vendor-in |
| Eval pattern (B) | Adopt **dataset-centric eval + scoring** as a *design idea* | industry convergence | build on MIT core; **do not** copy ELv2 code into a hosted service we resell |
| ELv2 code (Phoenix, langgraph-api) | **Do not** copy wholesale into our managed/hosted offer | ELv2 forbids resell-as-service | internal use or reimplement against MIT |
| IDP (C) | Treat UiPath/ABBYY/Rossum as the **capability bar** | all closed, quote-only, per-page | no parity claim without a benchmark |
| Governance posture | **NIST AI RMF** internal scaffold; structure toward **ISO/IEC 42001**; treat **EU AI Act as law** | free voluntary vs certifiable vs binding | never present a framework as a legal requirement or vice-versa |

## 5. What ODG must still prove (gaps vs the bar)

- A comparable-task **benchmark harness** (same inputs, measured precision/recall/latency/cost) before any
  superiority claim — **not built**.
- Template-free / unstructured extraction (Domain C) — **interface + cost estimate only**, not implemented.
- OpenTelemetry-compatible trace export — **not built** (decision recorded; implementation pending).
