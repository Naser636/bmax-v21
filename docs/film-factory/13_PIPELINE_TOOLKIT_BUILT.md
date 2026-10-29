# ODG-native Film-Orchestration Toolkit — BUILT + TESTED (not planned) — override response

Per the full-autonomy override: stopped at plans for what ODG can build now; **built and tested** the zero-cost,
no-privilege orchestration layer. Finished, inspectable artifacts under `docs/film-factory/pipeline/`:
`film-pipeline.mjs` (toolkit), `film-pipeline.test.mjs` (**17/17 PASS**), `run-demo.mjs` + `production-run.json`
(end-to-end simulated run). Kept OUT of the governed production runtime (no contract/production change); promotable
into `runtime/` later via a proper work-item contract.

## What is implemented + proven (reuses the proven ODG spine)
| Capability | Implemented | Test evidence | Reuses |
|---|---|---|---|
| Budget ledger (hard €4,000 cap) | `BudgetLedger` commit/spend/remaining; **refuses any crossing spend** | over-cap spend REFUSED; negative throws | economic/ledger |
| Shot/asset ledger + provenance | `makeShot`/`recordGeneration` (id/scene/version/cost/status + **sha256 provenance**) | records cost+provenance+status | evidence-provenance |
| Acceptance gate (FAIL-CLOSED) | `acceptanceGate` (faceMatch/drift/lipsync/export/continuity); blocks dependents | accepts clean; rejects+lists; fail-closed on missing QC; dependent blocked | validation-engine |
| Defect classify + bounded retry | `classifyDefect`/`retryPlan` (retry ≤N, **never scene-restart**, else ESCALATE) | classify continuity/quality; retry→escalate at cap | self-diagnostic |
| Continuity register | `continuityCheck` (every character introduced + locked ref) | flags un-introduced character | evidence-provenance |
| Rights/release check | `rightsReleaseCheck` (non-ownership-clear or AI-undisclosed → block) + `releaseGate` | blocks right-to-use asset; release blocked while a shot REJECTED | — |

## End-to-end simulated run (`production-run.json`) — control logic only, NO media
Ran the 14-shot opening through the pipeline with **SIMULATED** QC (deterministic; `outputBytes:0` = no real
media). Result: **14/14 accepted**, **1 retried** (S6 hero-VFX: seeded continuity defect → classified → targeted
retry → accepted), budget {committed €324.4, spent €25.6, remaining €3,650, cap €4,000 enforced}, continuity OK,
rights OK, **release gate OPEN** — all simulated.

## Honest boundary (critical)
This proves **orchestration/accounting/gating/retry/continuity/rights CONTROL LOGIC**, tested + run. It is **NOT a
film, NOT real media, NOT a produced shot** — the "generation" is a deterministic placeholder. The actual
generative stages (image/video/voice/music) remain **EXTERNAL_SERVICE_REQUIRED** and edit/export needs an
authorized **ffmpeg** install — both gated on the `12` approval (≤€350 + ffmpeg). The native control layer is now
ready to drive those stages the moment they are authorized.

## Dependency order satisfied
Budget-ledger + acceptance-gate + shot-ledger were built FIRST (they protect the €4k and prevent contamination),
exactly as `11` prescribed — so no paid generation can run uncontrolled or un-gated.
