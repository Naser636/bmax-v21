# V8 Lot C — Real-Agent Integration: minimal security architecture (readiness, NOT built)

CTO V8 §4. No real agent connected, no network. Documents the minimal architecture a FUTURE real-agent integration
needs, mapping each requirement to: EXISTS (proven in ODG) · PARTIAL · MISSING · EXTERNAL (dependency/authorization).
Honesty rule (§4): a present token is NOT cryptographic authentication — that is explicitly MISSING.

| Requirement | Status | Evidence / what exists | Gap / what's needed |
|---|---|---|---|
| **Cryptographic agent authN** | **MISSING** (gate checks token PRESENCE only) | supply-chain-attest already does ed25519 sign/verify (reusable primitive) | real mTLS or signed-request auth binding the agent's key to its identity; key management = EXTERNAL |
| **Identity↔session↔contract↔authz binding** | **PARTIAL** | gate binds agentId↔contract; harness binds execId↔evidence (V8 Lot A) | a session object linking a verified agent key → session → contract → per-action authz; not yet built |
| **Credential expiry + revocation** | **PARTIAL** | contract/session `revoked` ⇒ DENY (V7); time budget (maxDurationMs) | real credential TTL + a revocation list keyed on the agent key; needs an identity store |
| **Replay prevention** | **PARTIAL** | deterministic per-step `execId` + evidence bound to it (V8) ⇒ a bundle can't be reused for another exec | request-level nonce/timestamp on the authenticated channel (needs real authN + clock) |
| **Session / future-tenant isolation** | **MISSING** (single-tenant today) | per-step state threading; isolated TMPDIR for exec (test runner) | multi-tenant data/store isolation + per-tenant keys/contracts = a build |
| **Secret protection** | **PARTIAL/EXISTS** | bash-command-governor bwrap isolation; secrets sourced per-call, never echoed; gate ingests no secrets | formal secret-broker for agent-scoped secrets; HSM/KMS = EXTERNAL |
| **Independent result verification** | **EXISTS (proven)** | harness: executor result UNTRUSTED; success only on independent verify + evidence binding (V7/V8) | extend verifier to consume real evidence-provenance artifacts from a real executor |
| **Stop / recovery** | **EXISTS (proven)** | DENY⇒no exec; ESCALATE⇒human; error/timeout⇒ERROR_RECOVERED (no false success); budget circuit-break | real interruption/kill-switch on a live channel |
| **Execution authority** | **EXISTS (proven)** | harness holds NO execution authority; ODG's EXECUTOR/action-gate/bwrap remain sole enforcers | — |

## Verdict
The GOVERNANCE + EVIDENCE + VERIFICATION + RECOVERY layer is PROVEN (hermetic, simulated). The IDENTITY/TRUST
boundary for a REAL external agent is PARTIAL→MISSING: a present token ≠ cryptographic authentication; real authN,
multi-tenant isolation, credential TTL/revocation infra, and a secret broker are NOT built and several are EXTERNAL
(key management, HSM/KMS, certification). **No claim of real-agent compatibility or complete security.** Next build
toward real integration = a verified-key→session→contract binding reusing supply-chain-attest's ed25519 verify —
but that needs an identity store + CTO authorization for any real connection/exposure.
