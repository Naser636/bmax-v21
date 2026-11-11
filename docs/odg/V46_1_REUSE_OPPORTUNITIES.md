# V46.1 — Reuse / mutualization opportunities (code-proven basis)

> From the real dependency matrix (`V46_1_15_METIERS_DEPENDENCY_MATRIX.json`, coherence pass). **No quantified gain is asserted without a stated method.** Opportunities are derived from PROVEN facts: (a) métier leaves are highly self-contained (many import 0 internal modules), (b) component-level cross-métier reuse is low, (c) each métier re-implements its own report/evidence shape.

## The core finding that creates the opportunity
The 15 métiers share **conventions** (PURE, fail-closed, dual-export, same test harness) but **not shared leaf components**. Each métier deliverable builds its own: input parsing, scoring, **report generation**, and **evidence/traceability**. There is **no single shared "diagnostic → normalize → score → report → evidence" layer** consumed by all 15 — proven by the matrix's NOT_APPLICABLE density and the 0-import leaves.

## Opportunity matrix (effort / beneficiaries / risk — gains qualitative, method stated)
| # | Mutualization | Beneficiary métiers (proven basis) | Effort | Expected effect (method) | Risk | CTO priority |
|---|---|---|---|---|---|---|
| O1 | **Shared report generator** (JSON+PME-markdown) | all 15 (each currently hand-rolls a report; V44 P3/P11 reports are bespoke) | **M** | fewer lines per new offer; consistent client-facing reports. *Method: count the per-offer report code written for P3/P11 (~30–40 lines each) × remaining 13 métiers = the duplication avoided.* | low (a formatting layer, no runtime change) | **HIGH** |
| O2 | **Shared evidence/traceability wrapper** (reuse `evidence-provenance`, the measured #1 hub, 31× imports) | all 15 (only P10→P3 currently chains it at leaf) | M | uniform sha256/provenance on every deliverable. *Method: today only governance-layer modules import it; wiring the 15 leaves to it standardizes evidence.* | low | **HIGH** |
| O3 | **Shared normalize/ingest** (manifest/XML/CSV parsers) | P3, P4, P8, P11 (parsing-heavy) | S–M | one validated parser set vs per-métier. *Method: P3 uses `componentsFromManifest`, P11 `einvoice-parser` — generalize to a shared ingest.* | medium (coupling) | MEDIUM |
| O4 | **Shared scoring/eval primitive** | P2, P6, P9, P10 (all score/grade) | M | one scoring engine (reuse `eval-metrics`). *Method: these métiers each compute pass/score independently.* | medium | MEDIUM |
| O5 | **ALLOCATOR primitive** (the MISSING one) | cross-cutting (cost/budget allocation) | M–L | fills a proven primitive gap (no canonical allocator module). *Method: audit found no single allocator; logic is dispersed.* | medium | MEDIUM |
| O6 | **Shared offer/pricing + commercial-workflow** (reuse `commercial-pipeline`, prepared≠sent) | all 15 (P11 already uses it) | S | one governed prepared≠sent flow for every offer. | low | MEDIUM |

## What NOT to do
- **Do not build 15 separate systems** — but also **do not force-couple** the clean self-contained leaves; mutualize only the *cross-cutting* layers (report, evidence, ingest, scoring), keeping métier logic isolated.
- **Do not claim a quantified efficiency gain** until the duplication is actually measured (O1's method above is the way to measure it).

## Priority sequencing (CTO)
1. **O1 + O2** (report + evidence) — HIGH, low risk, benefits all 15, and directly accelerates L2→L4 packaging (the V46 priority). Build once, reused by every offer.
2. **O3 (ingest)** for the parsing-heavy métiers (P3/P4/P8/P11).
3. **O4 (scoring)** + **O5 (allocator)** as the scoring/FinOps métiers mature.
All reuse EXISTING primitives/components — **no new runtime, no new primitive beyond the proven ALLOCATOR gap.**
