# ODG — Production dependencies spec (V1, 2026-10-27)

For each EXTERNAL launch dependency in `LAUNCH_READINESS_MATRIX_V2`: spec, options, security criteria, indicative cost,
and a validation procedure — **so the CTO decision/spend is the only remaining work.** **Nothing here is activated,
purchased, exposed, or deployed** (that needs separate explicit authorisation). Maps to ISO 27001 Annex A rows.

## 1. Off-host encrypted backup + restore drill (A.8.13)
- **Spec:** periodic encrypted backup of client/evidence stores to an off-host location; documented restore.
- **Options:** (a) encrypted object storage (EU region) + client-side encryption; (b) managed backup service (EU).
- **Security criteria:** AES-256 at rest, client-side keys, EU data residency, immutability/retention, restore ≤ target RTO.
- **Cost (indicative, UNVERIFIED):** object storage low €/month at ODG scale; verify with provider pricing before commit.
- **Validation:** backup→restore drill on a synthetic store; verify integrity hash matches; record RTO/RPO. (Local
  backup logic already proven: `client-store-backup`.)

## 2. Production monitoring / alerting / on-call (A.8.16, Clause 9)
- **Spec:** runtime health + security-event monitoring + alerting on the deployed service.
- **Options:** (a) self-hosted (Prometheus/Grafana/Loki) on the VPS; (b) managed observability (EU).
- **Security criteria:** audit-log forwarding, tamper-evidence (reuse `audit-log` hash-chain), alert on auth failures,
  retention policy, access control to dashboards.
- **Cost:** self-hosted = compute only; managed = €/month (verify).
- **Validation:** inject a synthetic security event → confirm alert fired + logged; review coverage vs A.8.15/16.

## 3. Cryptographic key management / KMS (A.8.24)
- **Spec:** custody + rotation of production secrets/keys (not test-only).
- **Options:** (a) cloud KMS (EU); (b) self-hosted Vault; (c) HSM-backed for highest assurance.
- **Security criteria:** no plaintext keys at rest, rotation policy, access audit, separation from app runtime.
- **Cost:** KMS low €/month; HSM higher (verify).
- **Validation:** rotate a test key, confirm old disabled, access logged; confirm no secret in repo/image.

## 4. Production multi-tenant isolation
- **Spec:** isolate client data/compute in production (logical isolation proven hermetically via `agent-governance-harness`).
- **Options:** (a) per-tenant datastore/schema isolation; (b) per-tenant compute; (c) row-level + strong authz.
- **Security criteria:** no cross-tenant read/write, tenant-bound authz (reuse gate-level tenant binding), isolation tests.
- **Validation:** cross-tenant access attempt must be DENIED in the production config (not only in tests).

## 5. Deployment / public exposure
- **Spec:** currently VPS deploy + reboot drill validated **loopback-only**; public exposure NOT authorised.
- **Options:** (a) reverse proxy + TLS + WAF + rate-limit; (b) keep loopback + VPN until launch.
- **Security criteria:** TLS, least-exposed surface, authn at edge, DDoS/rate-limit, logging, incident runbook.
- **Validation:** external pen-check of the exposed surface before any public opening; explicit CTO authorisation.

## 6. Selling-entity legal/fiscal setup (not technical, but launch-blocking)
Structure choice (micro/EI/SASU — `FR_BUSINESS_STRUCTURE_DECISION_V1`), immatriculation (Guichet unique INPI), RC Pro,
CGV/contract legal review. **CTO + legal decision + possible spend.**

## Decision summary (what the CTO must decide/spend)
| Dep | Local/free part done | Decision needed | Spend |
|---|---|---|---|
| Backup off-host | local logic proven | provider + region | low €/mo |
| Monitoring | audit-log chain reusable | self vs managed | compute/€ |
| KMS | hermetic test keys | KMS vs Vault vs HSM | €/mo-higher |
| Multi-tenant | logical isolation proven | prod topology | infra |
| Public exposure | loopback validated | authorise + harden | infra |
| Selling entity | dossier ready | structure + RC Pro + legal | fees |
