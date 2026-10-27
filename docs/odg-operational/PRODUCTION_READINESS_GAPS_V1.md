# Production-readiness gap register (Axis C, V1 — 2026-10-27)

Honest inventory of the distance between **hermetic test evidence** (what this repo PROVES) and **production
reality**. Rule: a SIMULATED/hermetic test is NEVER presented as production evidence. €0, no network, no deploy.

Legend — **Local-testable**: can be proven here safely. **EXTERNAL**: needs infrastructure/auditor/host/credentials
(a separate, gated CTO decision). Risk 1–5 (5 = highest).

| # | Gap | Risk | Hermetic evidence today | Needed for production | Local-testable now | EXTERNAL / blocked |
|---|---|---|---|---|---|---|
| 1 | **Authentication** of third-party agents | 5 | Ed25519 challenge/response, session+contract/tenant binding, anti-replay, TTL (injected clock), rotation — `agent-identity` 22 | real KMS/HSM-held keys, real clock, token issuance/revocation at scale, mTLS/OIDC ingress | key-handling logic, deny-by-default, no-key-material-in-evidence (done) | **KMS/HSM**, real IdP, production key lifecycle |
| 2 | **Multi-tenant isolation** | 5 | logical: namespaced identity registry, tenant-bound evidence, foreign-tenant evidence rejected, tenant-scoped dossiers | data-store/row/row-level separation, per-tenant encryption, network/compute isolation, noisy-neighbour controls | logical separation + cross-tenant rejection (done) | **dedicated datastore/infra**, pen-test, SOC2-style control test |
| 3 | **Key management** | 5 | keys generated in-process for tests only | HSM/KMS custody, rotation policy, access logging, dual control | none (by design — no secrets here) | **KMS/HSM + custody procedures** |
| 4 | **Auditability** | 4 | provenance-sealed evidence (contentSha256), sha-stamped transition traces, scheduler attempt journaling, tamper detection | append-only tamper-evident store, retention, time source, SIEM export | provenance tamper-detection + transition-order checks (done) | **WORM/SIEM store**, trusted timestamping |
| 5 | **Backups** | 4 | local backup-vault contract tests; off-host BLOCKED (recorded) | off-host encrypted backups, restore drills, RPO/RTO | backup-manifest logic | **off-host storage** (host-gated) |
| 6 | **Recovery** | 4 | checkpoint/resume engine, idempotency guard, ERROR_RECOVERED (no false success), rollback drill (worktree+cp -al) | production failover, DR runbook, restore-from-backup proof | recovery/resume/idempotence logic (done) | **real DR infra + drill** |
| 7 | **Observability** | 3 | odg-state/cockpit/health read-only views, autonomy-rate signal, scheduler IDLE-reason detail | metrics/traces/logs pipeline, alerting, SLOs in a real monitor | read-only state/health views (done) | **monitoring stack**, on-call |
| 8 | **Agent integration** | 5 | end-to-end harness: authenticated → bound → admitted → governed execution → independent verification; **no real external agent** | a real external agent connection under the same contract, network egress controls | full governance path hermetically (done) | **real agent connection** (host/credential-gated) |
| 9 | **Scheduler activation** | 5 | pure DI driver; canary read-only; **unattended autonomous execution NOT enabled**; excellence rule consulted (Axis A) | canonical-queue wiring, unattended perimeter approval, kill-switch drills | schedulerStep logic + excellence gate (done) | **CTO perimeter approval + host activation** |

## Safe local actions taken this cycle
- **Axis A**: the real `schedulerStep` now consults the excellence rule (fail-closed on prohibited unproven
  superlatives; stale/offline advisory; no regression/loop) — proven; the scheduler suite is now **gated** in CI
  (was ungated → regression guard added).
- **Axis B**: a **second independent verifier** (dual control, role separation) added to `regulatory-assurance`:
  SATISFIED_VERIFIED requires BOTH to agree; disagreement/contradiction ⇒ DECLARED_UNVERIFIED (no false success).
- **Axis C**: this register (no production claim; each EXTERNAL item explicitly gated).

- **Axis C (gap #4 extended)**: `audit-log` is now wired, opt-in, into the REAL scheduler decision path
  (`mission-scheduler.schedulerStep`, `ctx.auditChain`) producing a tamper-evident hash chain of every scheduler
  decision (verify detects tamper/reorder/insert/delete). Also wired at the capability-execution, learning-capture and
  recovery decision points. **HONEST LIMIT:** tamper-EVIDENT, not tamper-PROOF; a production WORM/SIEM store, trusted
  timestamping and off-host replication remain EXTERNAL.

## What remains EXTERNAL (not done here, by authorization)
KMS/HSM, production datastore + multi-tenant isolation, WORM/SIEM audit store, off-host backups + DR drills, real
monitoring/alerting, a real external-agent connection, and scheduler activation on the canonical queue. None is
claimed as present. No simulated result in this repo is production evidence.
