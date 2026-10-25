# ODG_CAPABILITY_BASELINE — evidence-based (2026-10-25)

Scope: capabilities relevant to three commercial domains — **A** AI agents / complex-process automation, **B** agent reliability/governance/evaluation, **C** high-volume complex-process automation (document/data reconciliation). Truth-lock: HEAD `28c15a5`, branch `main` ≡ origin, 5 stashes, worktree = compass modified + untracked docs. All evidence below is from offline tests (zero network/LLM; CPU-only) unless marked otherwise.

## DEMONSTRATED — governance & reliability (domain B, the moat)
Source: `runtime/core/*.ts` (active; `.js` are byte-parity legacy). 17 test files PASS under tsx, **zero network/LLM/paid API** (adversarially confirmed 0 provider loads).

| Capability | File | What it proves | Evidence |
|---|---|---|---|
| Economic verification | `economic-verification.ts` | deny-by-default verdict (FAILED>INCOMPLETE>VERIFIED>UNKNOWN) from facts only; ledger conservation; spend-without-observation caught | `.test.ts` + economic-commit-gate + **economic-enforcement-adversarial** (0 provider loads) + economic-wiring — PASS |
| Mechanical acceptance | `mechanical-acceptance.ts` | **facts-not-claims** gate (authority, write-set, forbidden paths, evidence seal, state transition); deny-by-default | `.test.ts` PASS. Limit: opt-in (`control.required`); legacy missions ungated |
| No-false-success detection | `autonomy-eval-harness.ts` | golden-set eval; 7 independent dimensions; **false-success detection**; UNAVAILABLE≠0 | `.test.ts` 8 PASS |
| Self-diagnostic | `self-diagnostic.ts` | EXPECTED-vs-OBSERVED → incident; repairs **PREPARE_NOT_APPLY** (no autonomy over authority) | 64 + 16 + 3 PASS |
| Checkpoint/resume | `checkpoint-engine.ts` | resumable pipeline; **FAILED-not-resumable**; baseline-relative dirty attribution | 27 PASS |
| Bounded self-repair | `build-recovery-engine.ts` | tsc→fix→re-run while errors strictly decrease; snapshot/revert; **false-success refusal** on non-zero exit | 25 PASS. Only module that mutates source (authorized paths, revert-guarded) |
| Recurrence / learning | `incident-recurrence.ts`, `learning-chain.ts`, `post-release-learning.ts` | FROZEN_LOOP/RECURRENCE; CAPTURED→…→**EFFECTIVE** with no-fabricated-effect | recurrence 3 / resolution 13 / chain PASS |
| Cost control | `PersistentLedger` (film), economic-unit/extractor | reserve-before-call, halt-before-cap, settle-to-worst-case; OBSERVED quantities fail-closed | film ledgers (15/31, 0 orphan reservations); extractor 11 PASS |

**Fresh proof this session (domain B applied to domain C):** `docs/odg-operational/proof-reconciliation/` — a bank/ledger reconciliation engine + an **independent verifier** that catches planted false-success. Positive: recall 1.0 / precision 1.0 (5/5 discrepancies). Negative/robustness **10/10** (missing/malformed/non-numeric input fail-closed; hidden-discrepancy, inflated-matches, spurious-finding all rejected; idempotent; no-report⇒FAIL). Runtime <0.2s, €0.

## DEMONSTRATED — commercial operations stack (delivery rails)
| Capability | File | Status | Caveat |
|---|---|---|---|
| Client intake | `client-intake.ts` (22/22), `intake-endpoint.ts` (8/8) + Next route | DEMONSTRATED | email `sendEmail` **always fail-closed/disabled** |
| Quote / Invoicing | `quote.ts` (8/8), `invoicing.ts` (18/18) | DEMONSTRATED | invoicing = **local JSON ledger**; NO tax-authority/e-invoice (Factur-X) integration |
| Payments | `payments.ts` (14/14) | DEMONSTRATED | **HMAC webhook RECONCILER only**, not a payment SDK; no outbound charge; card data refused; live gated by `PAYMENT_LIVE_ENABLED=1` |
| Finance analytics | `finance-sim.ts` (15/15)+walk-forward (10/10), `finance-paper.ts` (15/15), `finance-data-connector.ts` (10/10) | DEMONSTRATED | **SIMULATION/PAPER only** (`executed:false`); connector uses injected fetcher, offline in tests |
| Commercial journey | `commercial-journey.ts` (19/19), `odg-client` CLI (13/13) | DEMONSTRATED | orchestration/read-model only |

## PARTIAL / PLANNED
- **LLM-driven extraction** (for true document processing, domain C at scale) — the reconciliation proof used structured CSV; unstructured-document extraction (OCR/LLM) is **NOT yet demonstrated in-repo** (would need a model, flagged as a gap).
- **Live external integrations** (ERP/bank APIs, e-invoicing, SMTP) — all **gated/disabled by design**; none proven against a real external system.
- Economic/acceptance gates are **opt-in**, not wired into every release path by default.

## Capability verdict for the 3 domains
- **B (reliability/governance): STRONG, DEMONSTRATED** — this is ODG's genuine differentiator (no-false-success, independent verification, deny-by-default, recovery, learning-chain).
- **C (high-volume reconciliation/data automation): DEMONSTRATED for structured data** (reconciliation proof); **GAP = unstructured-document extraction** (needs an LLM/OCR step, not yet built/tested).
- **A (general agent integration): PARTIAL** — orchestration exists but the space is commoditised by MIT-licensed frameworks (LangGraph/CrewAI); ODG's edge is only the governance layer on top.

## Non-technical gap (dominant)
**Buyer access is UNPROVEN.** No current contracts, references, certifications, or a live pipeline were established in this mission (outreach is not authorized). The binding constraint is commercial access, not capability.
