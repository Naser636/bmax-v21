# V319 §6 — Métier reference project: M2 (BTP / TP document intelligence) + reusable 13-point template

**Status: ONE complete reference project of 20 (template for the rest).** Backed by EXECUTED tests (re-run green this
session), not prose. Honest level: the capability engines are **TESTED / INDEPENDENTLY_VERIFIED** at the unit level;
this is NOT a claim that the BTP métier is "excellent" or operational — per §6, a passing internal suite ≠ excellence.
Reuses existing engines; builds no parallel module.

## Métier roster reconciliation (authoritative)
`odg-program-metier-matrix.ROSTER20`: **P1–P15 PRINCIPAL** (Fullstack, AI/ML, Security/supply-chain, Data-eng,
Cloud/DevOps, Eval/quality, SRE, API/integration, FinOps, Regulatory, Document-intelligence, Streaming, AI-infra,
DevEx, Workflow) + **M1–M5 COMMERCIAL** (M1 CRA/SBOM, **M2 BTP/TP document intelligence**, M3 FinOps, M4 Data-eng,
M5 Accessibility). This reference project covers **M2**.

## The reusable §6 reference-project template (13 points)
`objective+contract · environment · data+provenance · baseline · tests · security · performance · cost · recovery ·
independent benchmark · limits · cross-métier transfer`. Each métier's reference project fills these from EXISTING
engines; a métier is only "excellent" when an INDEPENDENT benchmark (not its own suite) confirms it on unseen inputs.

## M2 reference project (filled)
| Point | Content |
|---|---|
| **Objective + contract** | From a chantier description/plan/photo → structured quantities → a costed estimate with explicit assumptions. Contract: never present an uncertain estimate as a certain measure; human-confirm before any contractual commitment. |
| **Environment** | ODG runtime, pure/deterministic engines; no network in the cost path. |
| **Data + provenance** | Inputs are caller-supplied; prices come from a tariff library / supplier source — **never invented**. Document extraction via `document-intelligence` (P11). |
| **Baseline** | Naive single-number estimate vs the 3-level engine (contributive → operating → net). |
| **Tests (EXECUTED, green this session)** | `chantier-profitability.test` ✅, `parc-stock-engine.test` ✅, `workforce-labour-engine.test` ✅, `document-intelligence.test` ✅, `odg-product-design-engine.test` ✅ — **5/5 PASS**. |
| **Security** | No fabricated prices (fail-closed on missing tariff); unproven-claim detector; injection-resistant (document content is never a governance instruction); OWNER_GATED before orders/quotes/payments. |
| **Performance** | Deterministic, in-memory, no clock/network ⇒ reproducible; micro-scale (document/estimate), not a throughput system. |
| **Cost** | COST SSOT (`odg-economic-model`); invariant **SELLING ≠ COST ≠ NET**; `imputeToChantier` anti-double-count (V149/V150). |
| **Recovery** | Fail-closed on missing inputs/prices; no partial estimate presented as complete; rollback = no canonical write (estimates are proposals). |
| **Independent benchmark** | REQUIRED and NOT YET DONE: an independent held-out set of real chantiers with ground-truth quantities/costs (owner-provided) to measure estimate error — the internal suites are necessary but **not** sufficient for an "excellent" verdict. Status: **PENDING (held-out corpus owner-gated)**. |
| **Limits** | Every estimate must expose units, assumptions, price sources, and uncertainty. No takeoff from plans/photos yet (that is the RMP-BTP-TAKEOFF gap vs Procore/Autodesk Forma). Multilingual client UX (§7) not built. |
| **Cross-métier transfer** | Reuses P11 document-intelligence, P9/M3 FinOps (cost model), P10 regulatory (CRA/compliance), M5 accessibility (client UX). A shared tariff/units layer transfers to M4 data-eng. |

## Honest verdict
M2's capability **engines are unit-TESTED (5/5 green)** and compose through the canonical cost model with the
anti-overclaim invariants. M2 is **NOT** declared "excellent": the **independent held-out benchmark is PENDING**
(owner-provided real-chantier ground truth), and the plan/photo **takeoff** + multilingual client UX are gaps. This
is one reference project; the remaining 19 follow the same 13-point template, each gated on its own independent
benchmark before any excellence claim.

## Next (PROPOSED, not authorized)
- Owner-provided held-out chantier corpus → run the independent benchmark → measure estimate error vs ground truth.
- RMP-BTP-TAKEOFF (plan/photo quantities) — the largest capability gap for M2 + §7.
- Lots of 3: pair M2 with P11 (document-intel) + P9/M3 (FinOps) for a cross-métier reference lot.

No canonical/production change; no secrets; reuses existing engines (no second module).
