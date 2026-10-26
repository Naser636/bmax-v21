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
| Default governed execution for authenticated steps | PROVEN (TEST) | V18: governed execution is now AUTOMATIC for ANY authenticated step (authedTenant resolved ⇒ authBound) — no explicit `governedExecution` flag needed; an authenticated step can no longer reach the raw executor directly by config omission. The UNAUTHENTICATED legacy path is explicitly isolated + stamped `legacyUnauthenticated:true` (authBound:false), cannot masquerade as authenticated, and cannot open the governed boundary. No silent fallback to the direct path after a governed refusal/error. Migration audit: the harness has NO production/ODG-capability consumer (only its own test + runSequence); authenticated V9–V17 tests are observably equivalent under governed-by-default (88/88). Adversarial (harness 88/88): authenticated step/sequence governed with no flag; legacy path isolated; unauthenticated+flag ⇒ EXECUTION_DENIED (no masquerade); governed executor throw ⇒ ERROR_RECOVERED, raw once, no direct retry. **HONEST LIMIT:** unauthenticated legacy execution is retained by design (hermetic/back-compat), clearly marked; ODG internal capability executors untouched (out of scope). Prod authN/isolation = EXTERNAL |
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

## Verdict
The agent-governance capability (identity → binding → admission → supply-chain → execution-gating → independent
evidence-bound verification → drift/combinatorial → recovery) is **PROVEN hermetically** with adversarial tests and
is gated in CI (63/63). It is **NOT** production-authenticated, **NOT** multi-tenant-isolated in production, **NOT**
certified, and **NOT** validated against a real external agent — each explicitly EXTERNAL/BLOCKED above. No perfection
or completeness claimed.
