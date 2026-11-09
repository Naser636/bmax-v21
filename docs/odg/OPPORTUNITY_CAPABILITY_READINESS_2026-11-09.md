# V12.4 — Métier Opportunity Prioritization (CTO Continuation §6, 2026-11-09)

**Honest scope.** A *full* opportunity ranking (§6) weighs demand · urgency · competition · ease-of-sale · margin — all
**market dimensions that require external data ODG does not have and will not fabricate** (`[MARKET-RESEARCH-REQUIRED]`).
What ODG **can** rank now, from real internal evidence, is **capability-readiness**: proof level, automation already in
place, owner-gated barrier, and distance-to-first-technical-delivery. This is the defensible half of §6; the market half
is explicitly deferred to the §5 external-research gate.

## Capability-readiness ranking (internal evidence only — market dimensions NOT included)

Scoring (each 0–3, higher = more ready): **Proof** (E3 adversarial gate-tested = 3) · **Automation** (how much is already
coded) · **Low-barrier** (3 = no owner-gated dep; 0 = billing/GPU/exposure required) · **Short-TTD** (time-to-first-
technical-delivery).

| Métier | Proof | Autom. | Low-barrier | Short-TTD | Readiness | Owner-gated dep |
|---|---|---|---|---|---|---|
| **P3** Security/DevSecOps | 3 | 3 | 3 | 3 | **12** | none (scan is self-contained) |
| **P6** Quality/AI-Eval | 3 | 3 | 3 | 3 | **12** | none |
| **P1** Full-Stack | 3 | 3 | 3 | 2 | **11** | none |
| **P10** EU Regulatory/Assurance | 3 | 3 | 3 | 2 | **11** | none (evidence-prep only; no cert) |
| **P4** Data | 3 | 3 | 3 | 2 | **11** | none |
| **P15** Automation/Workflow | 3 | 3 | 3 | 2 | **11** | none |
| **P11** Document/IDP | 3 | 2 | 3 | 2 | **10** | none |
| **P7** SRE/Performance | 3 | 2 | 3 | 2 | **10** | none |
| **P12** Streaming | 3 | 2 | 2 | 2 | **9** | infra for live scale |
| **P9** FinOps | 3 | 2 | 2 | 2 | **9** | real cost feeds |
| **P2** AI/Agentic | 3 | 2 | 2 | 2 | **9** | provider keys (owner) |
| **P14** DevEx | 3 | 2 | 2 | 1 | **8** | platform host |
| **P8** API/Business (e-invoice) | 3 | 2 | 1 | 1 | **7** | billing provider (owner-gated) |
| **P5** Cloud/Platform IDP | 2 | 2 | 1 | 1 | **6** | IDP product + host (owner-gated) |
| **P13** AI Infra/GPU | 3 | 1 | 0 | 1 | **5** | GPU host (owner-gated, cost) |

## Top-5 by capability-readiness (initial focus — the other 10 are NOT abandoned)

**P3, P6, P1, P10, P4** (and P15 tied). Each is E3-proven, fully internal (no owner-gated dependency), and the technical
demonstration already exists. **What can be built + tested immediately without a client, per §6:**
- **P3 Security:** a repo-scan report product over `scanProject` (synthetic target repos; fully offline).
- **P6 Eval:** an eval-run product over `evaluate` + eval-significance + benchmark-contamination (synthetic corpora).
- **P1 Full-Stack:** a behaviour-preserving refactor + reference-delivery package over `refactorPreservesBehaviour`.
- **P10 Regulatory:** a compliance-evidence-prep dossier generator over `buildEvidencePrep` (source-cite-or-refuse; no cert claimed).
- **P4 Data:** a data-quality/lineage report over `assessDataQuality` + `checkLineage` (synthetic datasets).

All five can produce a **verified technical demo on synthetic data today** — no client, no spend, no publishing.

## What this ranking deliberately does NOT claim

- It is **not** a market ranking. Demand, competition, pricing, and margin (`[MARKET-RESEARCH-REQUIRED]`) are **absent**,
  so no métier is called a "best business opportunity" here — only "most technically ready."
- Readiness ≠ revenue. A high score means ODG can *demonstrate* the capability soon, not that it will *sell*.
- The final §6 opportunity ranking is produced only after the §5 external market study supplies sourced demand/competition/
  pricing data (owner-gated). Until then this capability-readiness view stands in its place, honestly labelled.
