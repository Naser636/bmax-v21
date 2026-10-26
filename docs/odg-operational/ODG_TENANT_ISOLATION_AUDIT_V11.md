# V11 — Tenant Isolation: forensic audit + bounded fix + proof (2026-10-26, €0, hermetic)

CTO V11. Read-only audit → reproduced gap → bounded local fix → independent tests. LOGICAL isolation only;
production isolation (DB/storage/IAM/keys/deploy) is EXTERNAL/BLOCKED — explicitly NOT claimed (§3).

## Gate A — forensic map of tenant boundaries (status + evidence)
| Boundary | State (pre-fix) | Evidence |
|---|---|---|
| Identity / sessions / nonces | **IMPLEMENTED (logical)** | agent-identity registry namespaced by tenantId; verifyAuth binds session.tenantId↔challenge.tenantId; cross-tenant nonce rejected (V9) |
| Gate contract/authorization/verdict | **ABSENT** | third-party-agent-gate has **0 tenant references** — tenant-agnostic by design |
| Harness execId + evidence bundle | **ABSENT (pre-fix)** | execId = sha256(proposalSha+calls+agentId) — no tenant; bundle bound agentId, not tenant |
| Evidence/history re-attribution | **ABSENT (pre-fix)** | verifyEvidenceBundle had no tenant check |
| Keys/resources/recovery | logical (identity) / N/A at this layer | in-memory registry; no shared filesystem/key store crossed here |

## Reproduced gap (proof, not assertion)
Same agentId "shared" + identical proposal/state under two notional tenants ⇒ **identical execId**, and an
A-bundle passed `verifyEvidenceBundle({expectedTenantId:"SOMEONE_ELSE"})` (ok:true) — cross-tenant evidence was
NOT rejectable. (scratchpad repro, pre-fix.)

## Gate B — bounded fix (local, demonstrated; diff = harness.ts + its test)
The **authenticated** tenant (from verifyAuth identity — proposal-supplied tenant is NEVER trusted) is threaded into:
(1) `execId = sha256(proposalSha:calls:agentId:tenantId)` ⇒ tenant-distinct; (2) the sealed evidence bundle carries
`tenantId`; (3) `verifyEvidenceBundle(opts.expectedTenantId)` rejects a bundle whose tenant is absent or different
(fail-closed). When no auth is used, a caller-asserted `deps.tenantId` is used but clearly labelled non-authoritative.

## Independent verification (test evidence)
`agent-governance-harness.test.ts` +7 (V11), gate 63/63, tsc 0, build 0:
- two tenants, same agent/proposal ⇒ DISTINCT execId;
- A-bundle attributes to A but is REJECTED for B (A's evidence cannot authorize/attribute to B);
- missing tenant binding vs an expected tenant ⇒ fail-closed;
- bundle carries the tenant it was sealed under;
- AUTH-bound tenant is authoritative (propagates from the authenticated identity) and rejects a foreign expected tenant.
Pre-existing suites unchanged (backward-compat: no tenant ⇒ bundle tenant null, unchecked unless expectedTenantId given).

## Status (honest)
- **PROVEN (logical, hermetic):** identity/session/nonce namespacing (V9) + evidence/execId tenant-binding + cross-tenant
  evidence rejection + fail-closed on missing/altered tenant (V11), with 2-tenant negative tests.
- **PARTIAL:** the gate itself remains tenant-agnostic (tenant enforced at the identity + harness-evidence layers, not
  inside gate admission) — acceptable for the logical model; a gate-level tenant field is a possible future refinement.
- **ABSENT/EXTERNAL/BLOCKED (NOT claimed):** production tenant isolation — real data store / filesystem / resource /
  IAM / per-tenant key store / deployment separation. A tenantId field + namespacing is **logical** isolation; it does
  NOT by itself constitute production isolation (§3). This requires the target environment + infra + CTO authorization.

## Next action (single)
Either (a) gate-level tenant field so admission itself is tenant-scoped (hermetic, €0), or (b) a dedicated production
multi-tenant lot (data-store/IAM/keys) which is EXTERNAL/BLOCKED pending infra + authorization. Resume:
`tsx runtime/core/agent-governance-harness.test.ts && tsx runtime/core/agent-identity.test.ts`.
