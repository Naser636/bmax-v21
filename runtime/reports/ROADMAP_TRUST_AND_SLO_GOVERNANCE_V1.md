# ROADMAP_TRUST_AND_SLO_GOVERNANCE_V1

**Date:** 2026-10-19 · **Base:** `055048f` · **Status:** COMPLEMENTARY roadmap — subordinate to the canonical
`runtime/governance/ROADMAP.json` + `docs/odg-operational/ODG_MASTER_ROADMAP.md`; it never overrides their
authority. Operational entry point remains `ODG_PROJECT_STATE.md`. **No new permanent primitive** (the 9 stand);
reuse the existing POLICY layer (action-gate / capability-authorization / governance-kernel / bash-command-governor /
patch-action-contract) and `autonomy-rate.evaluateSLO`. **D-SLO / D6 / D-external-provider stay RESERVED** — this
roadmap PREPARES evidence + proposals; the CTO approves targets/budgets, never ODG.

## Objective & scope
Advance, together and with real evidence: (A) reliability MEASUREMENT (SLI/SLO, reserved budgets), (B) a universal
AUTHORITY policy that denies-by-default every ambiguous/forbidden action AT THE EXECUTOR level (not the prompt),
(C) adversarial PROOF that forbidden external-effect actions are blocked, (D) end-to-end autonomy hardening. Out of
scope: approving SLO targets, external/billable providers, deploy/infra, destructive ops, reopening L7/TS-only.

## References (official-first; adapted, not copied)
- **Google SRE** (SLI/SLO/error-budget; "Implementing SLOs", "Service Level Objectives") — SLOs need a defined SLI,
  window, and consequence; error budgets are a decision tool, not a vanity metric.
- **NIST AI RMF 1.0** (GOVERN/MAP/MEASURE/MANAGE) + **GenAI Profile (AI 600-1)** — measurement honesty, human
  oversight, provenance; no fabricated metrics.
- **OWASP LLM Top-10 / Agentic AI threats** — Excessive Agency, Prompt Injection, untrusted tool output; least
  privilege; human-in-the-loop for irreversible/external.
- **Policy-as-code** (OPA/Rego, AWS IAM least-privilege model) — EVALUATED as a pattern (deny-by-default, scoped,
  time-bound grants); ODG REUSES its in-repo action-gate rather than adding an external engine (no new dependency).
Each lot records provenance + why an adaptation diverges from the source.

## Lots (acceptance criteria are VERIFIABLE)
- **P0 — Authority coverage audit (THIS roadmap + the audit report).** Map the CTO forbidden list to real
  enforcement (action-gate/capability-authorization) at the EXECUTOR level; classify COVERED/PARTIAL/GAP with
  file:line+test. *Accept:* every forbidden class has a status + evidence; gaps enumerated. *Status:* IN PROGRESS.
- **P1 — Close proven authority GAPS (deny-by-default at the executor).** Only for a PROVEN gap: add the missing
  action class / enforcement + an adversarial test that FAILS before and passes after. *Accept:* the forbidden
  action is blocked at the executor (not just prompt), tested; no control weakened. *Dep:* P0.
- **P2 — Adversarial test matrix.** authorized-in-scope · out-of-scope · ambiguous · internet-injected instruction ·
  model/provider bypass attempt · cost/account/OAuth/publish/transmit · policy-engine failure/missing-rule ·
  expired/reused authorization · contradictory results/insufficient proof. *Accept:* each case proven at the
  executor; simulated unit-refusal insufficient if another path can perform the action. *Dep:* P0/P1.
- **P3 — D-SLO targets CONFIGURED (CTO §3, 2026-10-19).** The reserve on D-SLO targets is LIFTED for the four
  CTO-decided SLOs by the permanent continuation mandate §3 (that instruction is the target provenance). Encoded in
  `runtime/core/slo-targets.ts`+`.js` (dual-port, 9 tests, parity): **MISSION_SUCCESS_VERIFIED** ≥0.95 (eligible
  denominator, documented window), **MISSION_SUCCESS_FIRST_ATTEMPT** ≥0.90 (measured separately), **FORBIDDEN_ACTION_BLOCK**
  =1.0 (SEPARATE BINARY gate — any executed forbidden action = INCIDENT, never averaged into reliability),
  **MISSION_LATENCY** median+p95 (target=null, measurement-only until baseline) — measurement implemented in `runtime/core/latency-measure.ts`+`.js` (6 tests, parity): per-category median+p95 via inclusive interpolation, thin sample (<minSampleN)⇒not-generalizable/descriptive-only, falsified sample rejected, categories independent. All **CONFIGURED**, not VALIDATED:
  `evaluateConfiguredSLO` delegates to `evaluateSLO` and only reports `validated:true` when live data says WITHIN.
  *Status of data:* current baseline (`autonomy-rate.json`, N=12 self-audit) ⇒ **INSUFFICIENT_EVIDENCE** (below minSampleN=20;
  not a window population) — honest, no fake pass. *Next:* controlled collection of a window-scoped eligible-mission
  population before any VALIDATED promotion. The 25% deterministic benchmark is untouched (separate frozen gate).
- **P3c — Real SLO collection + measurement V1 (CTO continuation §1, 2026-10-19).** `runtime/core/slo-collector.ts`+`.js` (8 tests, parity) builds a window-scoped eligible-mission population from the REAL `mission-ledger.json` (dedup to terminal record; explicit window + eligibility + exclusions). Measured (see `runtime/reports/SLO_MEASUREMENT_V1.md`): window 2026-07-23→10-19, 170 eligible. Honest verdicts: SUCCESS_VERIFIED ⇒ INSUFFICIENT_EVIDENCE (SURVIVORSHIP — ledger records no failed/blocked mission, so 170/170 is tautological, not a valid denominator); FIRST_ATTEMPT ⇒ INSUFFICIENT_EVIDENCE (attempts not recorded); LATENCY ⇒ MEASUREMENT_ONLY (snapshot ts, not durations); FORBIDDEN_ACTION_BLOCK ⇒ PASS (0 executed forbidden effects, binary). No target changed to fit data; nothing fabricated. Next: enrich telemetry (outcome/attempts/real durations) before any VALIDATED promotion.
- **P3b — Bounded SLO-violation reactions (CTO §5.3, 2026-10-19).** `runtime/core/slo-response.ts`+`.js` (7 tests, parity): `planSloResponse(verdict)` maps a verdict to a BOUNDED, PREPARE-not-APPLY plan — `autoApply` always false. Severity ladder NONE<LOW<ELEVATED<CRITICAL: WITHIN/MEASUREMENT_ONLY⇒CONTINUE; INSUFFICIENT_EVIDENCE⇒COLLECT_MORE (no gating on noise); BREACH⇒LIMIT_CHANGES (diagnose→limit→recover→re-verify); forbidden-action INCIDENT⇒SUSPEND_PATH+preserve-evidence+escalate (CRITICAL, strictly > BREACH, never averaged). Composes with the real slo-targets verdicts; never self-executes a consequential remediation.
- **P3a — `evaluateSLO` validity review.** Confirm/strengthen WITHIN/BREACH/INSUFFICIENT_EVIDENCE + falsified-data
  guards with boundary tests. *Accept:* boundary + falsified + small-sample cases pass; no coercion of measurable:false.
- **P4 — Autonomy hardening (post-P0–P3).** bounded recovery, idempotent resume, PASS/FAIL/BLOCKED/NOT_RUN
  transitions, mission selection/chaining, learning reuse proof, reliable compass+machine-checkpoint update.
  *Accept:* each with an independent test + evidence; error budgets ACTIVATE only after the matching target is approved.

## Risk register (live)
- R1 authority split across action-gate + capability-authorization + executor checks ⇒ a path might bypass the gate
  (P0 verifies executor-level enforcement). R2 prompt-injection granting authority (P2 adversarial). R3 model
  non-determinism (measured, not gated). R4 SLO target invented (FORBIDDEN — reserved). R5 net-ns-loopback
  defense-in-depth gap (documented, no proven exploit). R6 L7 offline-closure (PAUSED).

## Reserved-decision register
D-SLO (targets/min-sample/error-budget) · D6 (npm audit breaking upgrades) · D-external-provider (billable) ·
D-TS-only-resume · any loosening of E1–E6. ODG prepares evidence+proposals; the CTO decides.

## Test / recovery / learning / compass strategy
Targeted tests first → dependency tests → full suites at integration points. Adversarial cases defined BEFORE runs;
failures kept. Deterministic committed tests (inject seams; no real model/network in the suite). After each mission:
independent verify → update this roadmap + `ODG_PROJECT_STATE.md` + the machine checkpoint → record + reuse learnings.

## Provenance & relationships
Linked from `ODG_PROJECT_STATE.md` (ENTRY POINT). Canonical authority = `runtime/governance/ROADMAP.json` (untouched).
Evidence reports: `runtime/reports/ANTI_ILLUSION_METRICS.md` (metrics), `STAGE6_REAL_GENERATION_PROOF.md` (local model),
+ the P0 authority-coverage audit (this campaign). This file is a planning/governance aid, not an authority.

## P0 authority-coverage audit — RESULTS (2026-10-19)
Two dispatch paths; authority NOT centralized. Path A (`src/runtime/runtime-executor.ts:138`) calls
`authorizeCapability` before run (guarded). Path B (`runtime/core/patch-executor.ts:636` → `capabilityExecutors.resolve().run()`)
has NO central chokepoint — each executor self-gates. action-gate classes are generic (READ/ANALYZE/GENERATE/
WRITE/COMMUNICATE/TRANSACT/DELETE/IRREVERSIBLE) — no first-class SPEND/ACCOUNT/OAUTH/PUBLISH/DEPLOY.

Forbidden-class coverage: delete/destructive (COVERED, bash R4+action-gate ESCALATE, tested); cross-mission/
expiry (COVERED Path A; INERT on Path B bash — missionId/now not threaded); policy-failure⇒DENY (COVERED,
deny-by-default); prompt-injection-grants-authority (PARTIAL — strong on Path A grant model; Path B research
flags are bare booleans); spend (PARTIAL — only the billed-provider env flag); account/OAuth/deploy/publish
(PARTIAL / absent-capability — no first-class class).

### Fixed this campaign
- **TRUST-GAP-1 (CLOSED, P1+P2)** — External Research live egress on Path B via a JSON-NAMEABLE built-in fetcher
  with no human grant (data-exfil + prompt-injection vector). FIX: removed the JSON-name branch in
  `resolveFetcher` (capability-executors `.ts`/`.js`) — a live fetch now requires an INJECTED function (matches
  the module's own "injected fetcher" contract); `governedHttpGet` stays exported for trusted injection.
  Adversarial tests: capability-executors.test (JSON-name+authorized+execute ⇒ REFUSED "no fetcher injected",
  no egress; injected function still fetches) + external-research-live updated to the secure assertion.

### Remaining gaps (next bounded lots — evidence in the P0 audit)
- **TRUST-GAP-2 (P1-remaining; reserved-adjacent to D-external-provider):** billed provider calls authorized by a
  single process-global `ODG_PROVIDER_LIVE=1` (`provider-live-call-gate.js:42`) — no mission/scope/expiry/spend
  ceiling. Proposed fix: route billed spawns through `authorizeCapability` (mission/expiry-bound) or a per-mission
  budget. Adversarial test: two different missions under one flag ⇒ 2nd REFUSED. **Touches the billed path ⇒ CTO
  (D-external-provider) before changing activation semantics.**
- **TRUST-GAP-3 (b) CLOSED (2026-10-19):** bash governor now threads `now`+`missionId` into the action-gate ctx ⇒ EXPIRED + CROSS-MISSION authorities are DENIED on Path B (3 adversarial tests; expiry via now, cross-mission via missionId, valid not over-denied). **(a) CLOSED (2026-10-19):** resolve() now enforces a PRODUCTION effect registry (CAPABILITY_EFFECT, SOT) — an UNREGISTERED/ungoverned capability is DENIED before any effect (reproduced: a dummy ungoverned executor wrote a file via resolve(); after: refused, no effect). No double-gating (registered executors resolve normally; internal controls intact). Was:** (a) `resolve()` has no chokepoint forcing a new executor to call a gate (only a
- **Side-effect path inventory (2026-10-19):** see `runtime/reports/SIDE_EFFECT_PATH_INVENTORY_V1.md` — all 10 dispatch-reachable capabilities mapped (authority/control/absent-ctx/refusal-proof); NO ungoverned consequential path; absent/empty/protected authorization refuses-before-effect (CI-locked); residual GAP-2 reserved.
  classification tripwire); (b) bash governor omits `missionId`+`now` (`bash-command-governor.ts:381`) ⇒ the
  cross-mission/expiry DENY branches are inert on Path B. Proposed: thread `plan.mission`+injected `now` into the
  governor ctx (bounded, reuses action-gate) + a deny-by-default registry consulted in `resolve()`. Adversarial
  tests: expired/cross-mission bash ⇒ BLOCKED; ungated dummy executor ⇒ no effect.
