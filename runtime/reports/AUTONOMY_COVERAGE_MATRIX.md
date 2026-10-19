# ODG — Autonomy Coverage Matrix (per cycle-stage, evidence-grounded)

**Date:** 2026-10-19 · **Base:** `31eeaa8` (Lots A–D). **Method:** 3 parallel read-only audits, each practice→real
`file:line`/test/artifact; classification is honest (what ODG's own code EMITS at runtime = autonomous; what a
human/provider authors = not). **This measures CYCLE-STAGE coverage, NOT "every mission runs autonomously"** —
see the denominator note.

## Denominator & method
- **Denominator = 11 autonomy cycle-stages** (the CTO's enumerated end-to-end list).
- **Numerator = stages ODG performs AUTONOMOUSLY with real evidence** (ODG code executes it + emits a proof artifact/test).
- Each stage is also labelled: DEMONSTRATED-AUTONOMOUS · GOVERNED-OPERATOR · BLOCKED · EXCLUDED-by-design · DECLARED.
- **No global "% autonomous" headline is claimed** beyond this defined denominator; the live per-mission autonomy
  *rate* is separate and tiny (N=1–3, see §10 / ANTI_ILLUSION_METRICS §1).

## Matrix

| # | Cycle-stage | Classification | Evidence (file:line / test / artifact) | Honest gap |
|---|---|---|---|---|
| 1 | Component discovery & understanding | **DEMONSTRATED-AUTONOMOUS** (structural) | `runtime-model.ts:91-329`→`capability-registry.ts:34-50` (185 caps, live `2026-10-19`); `knowledge-engine.ts:12-94` (1391 files); `mission-scan.json` (229 missions/185 proven) — all computed from disk at runtime | `runtime-context.json` **STALE `2026-07-27`** (`runtime-context-loader.ts:19` regenerates on cache-MISS only, never on staleness); `ODG_OPERATIONAL_MANIFEST.json` is a hand-authored DECLARED projection; discovery is structural, not semantic |
| 2 | Mission selection & prioritization | **DEMONSTRATED-AUTONOMOUS** | `runtime-model.ts:203-218` proven-filtered + roadmap-ordered queue; `migration-selector.ts:40-96` risk-ranker; live queue has **zero overlap** with the 185 proven (cannot queue a done mission) | "completed"=="proven" depends on ledger/reconciliation; a done-but-unrecorded mission would linger PENDING |
| 3 | Root-cause diagnosis | **DEMONSTRATED-AUTONOMOUS** (observe+propose) | `self-diagnostic.ts:58-120` live `self-diagnostic-report.json` (NO_DIVERGENCE, converged); `root-cause-engine.ts:33-90`→`root-cause-report.json`; `self-diagnostic-cycle.test.ts` pass | PREPARE_NOT_APPLY (`self-diagnostic.ts:8-16`), `applied:false`; repair proven only on synthetic faults; applying a live fix is gated (stage 6) |
| 4 | Planning & execution contracts (synthesis) | **DEMONSTRATED-AUTONOMOUS** | `mission-contract-factory.ts:191-303` + `mission-synthesizer.ts:1-25`; of 229 on-disk contracts **~98% ODG-generated** (`source:mission-contract-factory`/`mission-synthesizer`), only **1 hand-authored**; `corrective-mission.json` auto-prepared | synthesis is deterministic NL→contract (no semantic design); execution of the contract = stage 6 |
| 5 | Governed authorization of actions | **DEMONSTRATED-AUTONOMOUS** (refusal authority) | `action-gate.ts:121-244` deny-by-default; `capability-authorization.ts:310-312` `grant.human!==true ⇒ DENY` (ODG cannot self-authorize); tests 35+55 assertions pass | holds *refusal/escalation* authority, not *grant* authority — positive grant must be human (by design) |
| 6 | **Implementation & orchestration** | **BLOCKED / GOVERNED-OPERATOR** (autonomous only for a narrow sliver) | autonomous: `local-fixers.ts:20-76` (deterministic transforms), `decision-engine.ts:69-99` (patch-memory replay), `build-recovery-engine.ts:291-372` (bounded TS-repair). NOT autonomous: `odg-delegate.ts:12` patch is *"the ONLY step ODG does not own"*; `patch-executor.ts:44-45,115-121` edits provenance `PROVIDER/CONTRACT`, never ODG; `IMPLEMENT_MISSING_CAPABILITIES`→stubs (`:583-612`) | **THE GENUINE AUTONOMY GAP.** Novel engineering is authored by an external provider; gated by `build-recovery-engine.ts:353,386-409` + `providerActivation="MANUAL_ONLY"` + human grant. 23/24 queued missions `requiresEngineering:true` ⇒ need the provider |
| 7 | Tests & independent verification | **DEMONSTRATED-AUTONOMOUS** | `odg-test-report.ts:79-81` PASS/FAIL/BLOCKED, no false-success (blocked≠pass); `mechanical-acceptance.ts:17-19,53` facts-not-claims; `validation-engine.ts:76,186,267` independent probes | checks declared tests pass, not test adequacy/mutation/coverage |
| 8 | Error handling · recovery · resume | **DEMONSTRATED-AUTONOMOUS** | `checkpoint-engine.ts:130-148` wired in `odg-run.ts:104-174` (self-driven resume); `idempotency-live.test.ts` ALL PASS (replay/stale-CAS→zero mutation); `odg-recover.test.ts` 23 (incl. the false-success fix) | `build-recovery-report.json` is a stale stub — no recent live artifact of a red build repaired end-to-end |
| 9 | Memory · persistence · effective reuse | **DEMONSTRATED-AUTONOMOUS** (EFFECTIVE proven causally) | CAPTURED→…→REUSED each with a signal (`patch-memory.ts:40/61/33/74`); **EFFECTIVE** `learning-effective-ab.test.ts` A/B (same signature, reuse the only variable) + `learning-chain.ts:67-75` downgrades a flat effect | EFFECTIVE proof is a single synthetic A/B, not an accumulated production corpus |
| 10 | Coverage · efficiency · limits measurement | **DEMONSTRATED-AUTONOMOUS** (honest) | `autonomy-measure.ts`/`autonomy-rate.ts:48,109` (`evaluateSLO` WITHIN/BREACH/**INSUFFICIENT_EVIDENCE**); `odg-cockpit.ts:111-134` EFFICIENCY with `UNKNOWN`; `ANTI_ILLUSION_METRICS.md` separates live vs fixed 25% | live sample tiny (N=1–3); no provenanced SLO target exists ⇒ `evaluateSLO` returns INSUFFICIENT_EVIDENCE (honest, not operational) |
| 11a | Continuation & compass self-update | **DEMONSTRATED-AUTONOMOUS** | `compass-update.ts:36-41` fail-closed (PASS only if acceptanceMet AND evidence exists, else DOWNGRADED); auto-invoked via `odg-local-pipeline.sh:33-43` trap; `compass-checkpoint.json` real | advisory only (`nextAction` carries no authority) |
| 11b | Validation → **acceptance / commit** | **EXCLUDED-by-design (correct, NOT a gap)** | `mission-lifecycle.ts:140-148` caps at VERIFIED while in-scope tree uncommitted; *"ODG never auto-commits (D1)"*; `mission-lifecycle-s4-commit-gate.test.ts` pass | human commit is the acceptance act — intentional governance boundary |

## Honest coverage verdict
- **9 of 11 cycle-stages are DEMONSTRATED-AUTONOMOUS** (1,2,3,4,5,7,8,9,10), **+ stage 11a** (continuation) autonomous.
- **Stage 11b (acceptance/commit) is EXCLUDED-by-design** — human-gated, correctly enforced, NOT counted as a gap.
- **Stage 6 (implementation of novel engineering) is the ONE genuine autonomy gap** — ODG governs/plans/routes/verifies the change but does not author it end-to-end; a provider/operator does, behind the `MANUAL_ONLY` + human-grant gate.
- **Therefore: ODG is autonomous across the full engineering cycle EXCEPT authoring novel code.** That single boundary is a deliberate governance decision (provider-activation authorization), not a missing capability. **No "100% autonomous" claim is made** — and "the mission queue is exhausted" is explicitly NOT equated with full autonomy (23/24 queued engineering missions still require the provider).

## Priority gaps & dependencies
1. **Stage 6 — autonomous implementation of novel engineering (HUMAN decision).** Dependency: the engineering-provider-authorization decision + `providerActivation` policy (`runtime-mode.json` MANUAL_ONLY). Either (a) CTO authorizes ODG to use a provider for engineering (defining billing/scope/authority gates), or (b) accept that novel engineering stays operator-provided under ODG governance. **This is the single highest-leverage item and it is a CTO decision.**
2. **Stage 1 fidelity — `runtime-context.json` staleness (AUTONOMOUSLY fixable, bounded).** `runtime-context-loader.ts`/`.js` regenerate on cache-miss only. Fix = regenerate on staleness too. Blast radius: pipeline-entry loader (`odg-run`, `mission-context-builder`) + an equivalence bench → needs a proper contract + test (see next mission).
3. **Stage 8 evidence freshness — `build-recovery-report.json` stub.** Not a code defect; needs a real red-build repair to produce a live artifact (cannot fabricate).
4. **Stage 10 — SLO not operational.** Needs a provenanced CTO-declared target + sufficient sample (documented NOT-OPERATIONAL in ANTI_ILLUSION_METRICS §9).

## Next mission (contract-ready, autonomy-increasing, within provider authorization)
**`REFRESH_RUNTIME_CONTEXT_ON_STALENESS`** — make Stage-1 discovery self-current.
- Objective: `runtime-context-loader` regenerates the RuntimeContext when the cache is MISSING **or STALE** (older than a bounded TTL), fixing the frozen `2026-07-27` self-model.
- Write-set: `runtime/core/runtime-context-loader.ts` + `.js` + a NEW `runtime/core/runtime-context-loader.test.ts` (pure exported `isStale(context, nowMs, maxAgeMs)` unit-tested; miss/stale→regenerate, fresh→no spawn).
- Dependency/risk: dual-port parity + `runtime-context-loader-equivalence.e2e.test.ts` must stay green; the staleness check must be deterministic (clock injected into the pure helper) so the equivalence bench is not made flaky; TTL generous (e.g. 24h) to avoid resc/load.
- Acceptance: tsc 0×2; dist rebuilt; equivalence bench green; new unit test green; `odg-run` still boots; `runtime-context.json` refreshes to a current `generatedAt` on next load.
