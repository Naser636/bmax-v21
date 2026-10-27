# ODG Consolidated Readiness Register — V10 (2026-10-26)

Single register of the agent-governance + production-readiness program (V5–V10). Budget €0, hermetic. Status per
item: **PROVEN** (test evidence, this repo) · **SIMULATED** (hermetic sim agent/executor/clock) · **PARTIAL** ·
**UNTESTED** (prod) · **EXTERNAL** (needs auditor/legal/insurer/KMS/cert/real-agent) · **BLOCKED** (CTO/authorization).
No claim of certification, legal conformity, production authN/isolation, or universal-agent compatibility.

## A — Orchestration & execution
| Capability | Status | Evidence |
|---|---|---|
| Mission selection/planning, contracts, controlled execution | PROVEN | runtime pipeline + validation-engine (V-prior); unchanged |
| Independent verification / no-false-success | PROVEN | validation-engine + harness independent verify (V7/V8); 62→63 gate |
| Errors/resume/idempotence/rollback/recovery | PROVEN | checkpoint-engine, idempotency-guard, odg-recover; harness ERROR_RECOVERED (V7) |
| Observability / end-to-end traceability | PROVEN (internal) / PARTIAL (export UX) | mission-ledger, compass, harness sha-stamped transitions (V7/V8) |

## B — Third-party agents
| Capability | Status | Evidence |
|---|---|---|
| Cryptographic identity (Ed25519 challenge-response) | PROVEN (TEST-ONLY) | agent-identity 22/22 (V9/V10) |
| Key lifecycle: revocation, rotation, TTL-expiry (injected clock), concurrent sessions, clock-skew | PROVEN (injected clock, TEST) | V10 lifecycle tests; **prod clock/KMS = EXTERNAL** |
| Session↔contract↔identity binding + anti-replay | PROVEN | agent-identity + harness pre-gate (V9) |
| Adapter integration / tool & param validation / supply-chain | PROVEN | gate ASI02/ASI04 (V6); license-policy + supply-chain-attest reused |
| Structural drift & dangerous combinations | PROVEN | gate ASI01 + combinatorial (V7/V8) |
| **Semantic** intent drift | PARTIAL (structural only) | honestly scoped; needs a policy/model signal (out of €0 scope) |
| Human gate / stop / quotas / recovery | PROVEN | gate ESCALATE + budgets; harness (V5–V8) |
| Real-result verification | PROVEN (sim) / UNTESTED (real) | harness evidence-bound (V8); real agent = EXTERNAL |
| **Real external-agent integration** | BLOCKED/EXTERNAL | needs a real connection + authorization; all local prep done |

## C — Isolation & security
| Capability | Status | Evidence |
|---|---|---|
| Least privilege / scope confinement / secret non-exposure | PROVEN | gate scope checks; identity result carries no key material (V9) |
| Injection / tool-misuse / privilege-escalation / exfiltration | PROVEN (OWASP-mapped) | gate+harness adversarial suites (V5–V8) |
| Tenant isolation | PARTIAL (hermetic LOGICAL proto) | agent-identity namespaced registry; cross-tenant nonce rejected (V9) |
| Authenticated execution boundary (`authorizeExecution`) | PROVEN (TEST) | V14: no exec unless a sealed, provenance-verified, authenticated + contract/tenant-bound admission re-verifies at exec time; bare/unauthenticated ADMIT (authBound:false), tampered, cross-tenant, wrong-contract, missing-context, replayed → refused; execution spy proves zero exec after refusal (harness 55/55). Gate stays a pure evaluator (V13). Direct `deps.executor` call outside the harness = the caller's responsibility; the SANCTIONED path is `authorizeExecution`. Prod authN/isolation = EXTERNAL |
| Executor encapsulation (`createGovernedExecutor`) | PROVEN (TEST, module-controlled) | V15: wraps a raw executor; handle exposes ONLY {execute,stats} (frozen), raw captured in closure + unreachable from the handle ⇒ given only the handle there is no path to run it without a verified, context-bound authorization (RUNTIME guarantee via lexical scope — NOT a TS type, NOT a convention). Adversarial (harness 66/66): absent/tampered/cross-tenant/wrong-contract/missing-context/wrong-execId/unauthenticated-ADMIT → refused + raw spy zero; refusal short-circuits before raw (no throw); non-fn ctor input throws; runStep internal path unregressed. **HONEST LIMIT:** cannot stop a consumer who retains their OWN raw-fn reference — that is OUTSIDE module control; the sanctioned pattern hands the consumer ONLY the handle. Prod authN/isolation = EXTERNAL |
| Sequence execution governance (`runSequence`) | PROVEN (TEST) | V16: each step resolves its OWN fresh authorization (`authForStep`), so step-1's proof can never drive step-2 (replay ⇒ AUTH_DENIED); a blocking step (deny/auth-deny/contract-or-tenant-mismatch/escalate-reject/error-recovered/unverified) HALTS the sequence — no later step runs; result carries {stopped,stoppedAt,stopReason,completed,ranCount}. Adversarial (harness 75/75) with exec spies + exact counts: valid 3-step auth seq; replayed step-1 proof; contract change between steps; intermediate DENY; executor error; resume-after-fix; empty seq; no raw executor/deps retained in the result. **HONEST LIMIT:** HALT is NOT a transaction — steps executed BEFORE the failure are NOT rolled back (no rollback is claimed). Prod authN/isolation = EXTERNAL |
| Governed executor wired into the control path (`deps.governedExecution`) | PROVEN (TEST) | V17: opt-in mode in which runStep/runSequence invoke the raw executor ONLY through createGovernedExecutor (V15), gated by a sealed admission certificate bound to THIS step's exact context (execId/tenant/contract/agent + authBound) — the encapsulation is exercised IN the control path, not just in isolation. A bare/unauthenticated ADMIT (authBound:false) ⇒ EXECUTION_DENIED, raw never called (fail-closed). Adversarial (harness 84/84) with raw spies + exact counts: governed authenticated step executes once (EXEC stamp governed:true); governed 3-step seq raw==3; replayed proof / contract-change / invalid-proof mid-seq ⇒ halt with raw==1; resume-after-fix executes; no raw executor/handle exposed on the result; non-governed path unregressed. **HONEST LIMIT:** the admission certificate asserts harness authorization-to-execute (not a TS type/convention); the actual result is still sealed post-exec; HALT ≠ transaction (no rollback). Prod authN/isolation = EXTERNAL |
| Default governed execution for authenticated steps | PROVEN (TEST) | V18: governed execution is now AUTOMATIC for ANY authenticated step (authedTenant resolved ⇒ authBound) — no explicit `governedExecution` flag needed; an authenticated step can no longer reach the raw executor directly by config omission. No silent fallback to the direct path after a governed refusal/error. Migration audit: the harness has NO production/ODG-capability consumer (only its own test + runSequence); authenticated V9–V17 tests are observably equivalent under governed-by-default. Prod authN/isolation = EXTERNAL |
| Legacy unauthenticated execution REMOVED | PROVEN (TEST) | V19: the legacy unauthenticated execution path is deleted — EVERY execution goes through the governed boundary; a step that is not authenticated + contract/tenant-bound (authBound:false) is REFUSED (EXECUTION_DENIED) before the raw executor is ever reached. No default/config-omission reactivates it; no `legacyUnauthenticated` marker remains. Any third-party-agent execution REQUIRES authenticated, bound admission. Migration: the pre-V9 (V5–V8) historical tests + V11 tenant tests + V14–V16/V18 unauthenticated fixtures were migrated to authenticated deps (fresh per-contract/per-step challenge) or to assert the refusal — no false success. Adversarial (harness 91/91): no-auth+no-flag ⇒ EXECUTION_DENIED raw 0; legacy marker gone; authenticated ⇒ governed + independently verified. **HONEST LIMIT:** the gate still evaluates an unauthenticated proposal (pure policy, produces NO execution); ODG internal capability executors are a different seam, untouched (out of scope). Prod authN/isolation = EXTERNAL |
| **Production multi-tenant** (data store/resource/deploy isolation) | BLOCKED/EXTERNAL | dedicated lot; not claimed |
| Logging integrity / incident mgmt / resource-abuse resistance | PARTIAL | budget circuit-break (V8); formal incident+log-integrity = future |

## D — Operations
| Capability | Status | Evidence |
|---|---|---|
| Reproducible install/config; safe update/rollback; supervision | PROVEN | odg-release immutable pipeline + systemd; VPS deploy + reboot drill VALIDATED (checkpoints h/j) |
| Backup/restore | PROVEN (local) / EXTERNAL (off-host) | git bundle vault; off-host = external |
| Perf / availability / cost-limits | PARTIAL | HYPER-SPEED gate (−48%); budget-ledger; load/HA = untested |
| Ops docs / diagnostics | PARTIAL | runbooks + readiness docs; full runbook set = ongoing |

## E — Compliance & commercial delivery
| Item | Status |
|---|---|
| Internal technical controls mapped to OWASP Agentic 2026 (ASI01-10) | PROVEN (mapping + tests) |
| NIST AI RMF / CSF 2.0 | PARTIAL (framework-referenced, not fully mapped) |
| Documentary readiness (dossiers V5/V8) | PARTIAL |
| Independent audit / official certification / legal conformity | EXTERNAL (never claimed) |
| Delivery capability (EU private, C1/C4/V4) | PARTIAL — C1 feasibility-proven / demand CTO-gated; C4 strategic (partner+capital); premium tiers partner-gated |

## F — Learning & improvement
| Item | Status | Evidence |
|---|---|---|
| Provenance capture / persistence | PROVEN | evidence-provenance; compass checkpoints a–t |
| Effective REUSE (not just stored) | PROVEN | license-policy reproduces flux finding; evidence-provenance reused in harness; targeted-research method reused V2→V4 |
| Method-error detection / non-repetition | PROVEN (in-session) | buggy-parser / deny-first-ordering caught by sanity runs before shipping |

## Minimal remaining HUMAN / EXTERNAL actions (evidence + reason)
1. **Real external-agent integration** — needs a real agent + CTO authorization (all local prep: identity/gate/harness done). BLOCKED.
2. **Production key management (KMS/HSM), TTL with a real clock, key backup/recovery** — EXTERNAL infra; current TTL uses an injected clock (test).
3. **Production multi-tenant isolation** (data store/resource/deploy) — dedicated lot + target-env proof; only a logical proto exists.
4. **Independent audit / certification / legal** (SOC2/ISO/EU-AI-Act notified body, DPA/insurance) — EXTERNAL bodies.
5. **Commercial demand test / outreach / partner** (C1/C4/V4) — CTO authorization; €0 forbids it.
6. **Load/HA/off-host backup** — target-environment testing.

## E — Regulatory assurance & continuous excellence (2026-10-26)
| Capability | Status | Evidence |
|---|---|---|
| Canonical excellence policy (`excellence-policy.ts`) | PROVEN (TEST) | reviewForExcellence seeks/selects domain references, runs gap analysis, evaluates PRE-FIXED thresholds, renders a fail-closed verdict (MEETS/IMPROVE/INSUFFICIENT_EVIDENCE); REFUSES unbenchmarked superlatives ("world #1"/"best"/"optimal"); never conflates legal-obligation vs voluntary-standard vs recommendation vs practice vs assumption; flags stale references; seals reviews (provenance). Suite 18/18. Consulted AUTOMATICALLY by regulatory-assurance + demonstrated on a 2nd domain (agent-governance). **HONEST LIMIT:** consulted by capabilities today; full wiring into the live mission scheduler = future/host-gated. |
| REGULATORY_ASSURANCE (`regulatory-assurance.ts`) | PROVEN (TEST, hermetic) | GDPR/ISO27001/ISO42001 modules; configurable company profile ⇒ sector/size/country/data/AI/scope-specific dossier; applicability+justification; hallucination control (obligation w/o registry source REFUSED); evidence honesty (client-declared ≠ verified; independent verifier; missing ⇒ GAP; falsified rejected); multi-tenant separation (foreign-tenant evidence rejected; sealed dossier attributable only to its tenant); requirement→control→evidence→owner→verification traceability; reference version-change detection; reproducible; **NO certification claim** (assertNotCertified refuses it). Suite 25/25 (thresholds fixed pre-test). Full gate 65/65. **EXTERNAL/BLOCKED:** real client evidence, legal sign-off, independent auditor, accredited certification body, live source re-verification (offline-pending-reverify), production multi-tenant isolation. See `REGULATORY_ASSURANCE_V1.md`. |

| Excellence rule in the REAL scheduler (Axis A) | PROVEN (TEST) | `schedulerStep` now consults `reviewExcellence` (injected via `buildExcellenceReviewer`): FAIL-CLOSED only on a prohibited unproven-superlative claim (BLOCKED, no dispatch); stale/offline references + INSUFFICIENT_EVIDENCE + reviewer errors are ADVISORY and NON-blocking (a mission is never blocked because reference search is offline); absent reviewer ⇒ no regression; one step ⇒ one dispatch (no loop). Scheduler suite 27→36 and now GATED in CI (was ungated). **HONEST LIMIT:** canonical-queue wiring + unattended activation remain gated. |
| Dual independent verifier (Axis B) | PROVEN (TEST) | regulatory-assurance accepts an optional `verifier2` (role separation / dual control): SATISFIED_VERIFIED only when BOTH agree; disagreement ⇒ DECLARED_UNVERIFIED (contradiction surfaced, no false success); both-reject ⇒ agree-unsatisfied; single verifier backward-compatible. Suite 25→29. |
| Production-readiness gaps (Axis C) | DOCUMENTED | `PRODUCTION_READINESS_GAPS_V1.md` — 9 gaps (auth/multi-tenant/KMS/audit/backup/recovery/observability/agent/scheduler-activation) with risk + local-testable vs EXTERNAL. No simulated result claimed as production. |

| Excellence coverage matrix (AXE 1) | PROVEN (TEST) + HONEST GAPS | `excellence-coverage.ts` (suite 9) records per-family coverage; shared boundary `excellence-policy.requireExcellence` (reused by scheduler + capabilities, no duplication). COVERED: mission-execution (scheduler+tick), capability-self-review (regulatory-assurance + agent-governance demo). NOT_COVERED (listed, not claimed): resolution, per-executor execution, learning, recovery. See `EXCELLENCE_COVERAGE_MATRIX_V1.md`. No total-coverage claim. |
| DORA pack (AXE 2) | PROVEN (TEST) | DORA_READINESS module, Regulation (EU) 2022/2554; CONDITIONAL applicability — EU financial entities only; a non-financial or non-EU DORA-targeter ⇒ obligations NOT_APPLICABLE + justification (never applied to all). Source re-verification offline-pending-reverify. regulatory-assurance suite 29→32. odg-schedule-tick wires reviewExcellence behind the read-only canary (no dispatch/queue change). |
| Audit log hash-chain (AXE 3, gap #4 local) | PROVEN (TEST) | `audit-log.ts` (suite 9) tamper-EVIDENT append-only hash chain: detects tamper/reorder/insert/delete/forged-hash; fail-closed. **HONEST LIMIT:** tamper-evident ≠ tamper-proof; production WORM/SIEM store + trusted timestamp + off-host replication remain EXTERNAL. |

## Verdict
The agent-governance capability (identity → binding → admission → supply-chain → execution-gating → independent
evidence-bound verification → drift/combinatorial → recovery) is **PROVEN hermetically** with adversarial tests and
is gated in CI (65/65 incl. excellence-policy + regulatory-assurance). It is **NOT** production-authenticated, **NOT** multi-tenant-isolated in production, **NOT**
certified, and **NOT** validated against a real external agent — each explicitly EXTERNAL/BLOCKED above. No perfection
or completeness claimed.
