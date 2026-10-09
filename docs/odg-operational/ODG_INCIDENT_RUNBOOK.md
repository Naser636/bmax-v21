# ODG — INCIDENT & OBSERVABILITY RUNBOOK (RWL-B5)

> Operational runbook. Every signal below is tied to a **real, observed command** (exit code proven this
> session). It adds NO new primitive/metric/infra and asserts NO numeric threshold that cannot be justified —
> host-level metrics (latency, error-rate, disk) are marked **À DÉFINIR** with their owner/dependency. Subordinate
> to the Master/FICHE_07/`ODG_MASTER_ROADMAP.md`; reuses existing commands only. No secret/real-data/external action.
> Baseline: HEAD `48c0b0b`, `odg verify` RC=0, `odg diagnose` RC=0, `odg health` RC=0.

## 1. Signals (PROVEN) — command → meaning → exit semantics
| Signal | Command | Proven output | GREEN | RED / attention |
|---|---|---|---|---|
| Build/type/tree gate | `./runtime/bin/odg verify` | `build/typescript/gitClean` + `generatedContracts {total,valid,invalid}` | **RC=0** (all true, contracts valid) | **RC=1** if build=false OR typescript=false OR gitClean=false |
| Divergence / incident | `./runtime/bin/odg diagnose` | `Mission / Divergences / Incident / Summary` | **RC=0** `NO_DIVERGENCE` | **RC=1** incident OPEN/FROZEN (see §4 mission-context-stale residue) |
| Health dashboard | `./runtime/bin/odg health` | HEALTH (Runtime/Foundation/Pipeline/Brain), PROGRESS (caps ready/missing, completion %, missions), BLOCKERS | RC=0; all four READY | any ≠ READY, or new BLOCKERS vs baseline |
| Commercial launch readiness | `./runtime/bin/odg client launch` | `overall` + per-capability `state` | `overall ∈ {READY, TEST_MODE}` | `BLOCKED` (mandatory control fails) |
| Store availability | `./runtime/bin/odg client launch` → `persistence.state` / intake 503 | READY / NOT_CONFIGURED | READY | NOT_CONFIGURED or BLOCKED ⇒ intake returns 503 (fail-closed) |

**Recovery seams (PROVEN present):** `runtime/core/build-recovery-engine.js` (bounded red-build/tsc recovery),
`runtime/core/client-store-backup.js` (RWL-B4 backup/verify/integrity-restore).

## 2. Severity & escalation
- **SEV-1 (critical)** — intake persistence BLOCKED/unavailable on a live host, OR store integrity failure
  (`client-store-backup.verify` INTEGRITY_MISMATCH), OR a real payment-reconciliation inconsistency. → Contain
  immediately (§3), **human escalation required**.
- **SEV-2 (major)** — `odg verify` RED (build/tsc) or a genuine `odg diagnose` incident reflecting an active
  mission (NOT the known residue §4); `odg client launch` BLOCKED. → Diagnose + recover (§3), no external action.
- **SEV-3 (minor)** — NOT_CONFIGURED states for not-yet-provisioned providers (email/payments/deploy); known
  residue; documentation gaps. → Track; not launch-blocking per se.

## 3. Procedures (diagnose → contain → recover → verify)
1. **Diagnose**: run `odg verify`, `odg diagnose`, `odg health`, `odg client launch`; capture outputs + exit codes.
2. **Contain**: if a store/config control is BLOCKED, intake already fails closed (503) — do NOT bypass it; stop
   dependent decisions (paper/commercial) which are gated (`decisionsAllowed`, DEF-013). No forced operation.
3. **Recover**:
   - Red build/tsc (SEV-2): fix in-scope then re-`odg verify`; the build-recovery engine is bounded/rollback-guarded.
   - Store corruption (SEV-1): restore from a verified backup — `client-store-backup.restore({manifest, target})`
     (integrity-verified, refuses non-empty target unless `force`); never restore an unverified manifest.
   - Dirty/unexpected tree: inspect `git status`; do NOT commit stray files; revert in-scope only.
4. **Verify**: re-run the §1 signals; accept recovery only when the relevant command returns GREEN again, with
   evidence captured. A green build alone is NOT proof of production behaviour.

## 4. Known residue / non-incidents (do not mis-triage)
- `odg diagnose` RC=1 with `mission-context-stale` would be the **DEF-005 historical residue** (stale gitignored
  generated artifacts), intentional/locked detector — resolve by artifact hygiene (DEF-005), NOT by changing the
  control. At baseline it is RC=0 (residue cleared). `odg health` BLOCKERS = roadmap NEEDS_CONTRACT missions
  (informational), not runtime incidents.

## 5. Rollback & resume
- **Local rollback**: `git revert <sha>` or reset in-scope (local only). **No push, no deploy** without human
  authorization. A pushed change rolls back by a new revert commit (human-gated).
- **Data rollback**: restore the intake store from a verified backup (§3). 
- **Resume criteria** (explicit): resume dependent operations only when `odg verify` RC=0 AND the specific
  failed signal is GREEN AND evidence is captured; otherwise stay BLOCKED.

## 6. Evidence to keep / do NOT expose
Keep: command outputs + exit codes, `runtime/generated/runtime-verify.json`, `self-diagnostic-report.json`,
backup manifest hash, the acting commit SHA. Do NOT expose/persist: secrets/credentials (none are in the store
or logs by design — keep it so), full client personal data beyond what the whitelisted record holds, payment
secrets (never stored).

## 7. Thresholds — À DÉFINIR (host/owner dependent, not assertable locally)
- API latency / error-rate / request-rate alerting — **À DÉFINIR** (owner: operator; dependency: deployed host, RWL-C1/E1).
- Disk/quota for the persistent store — **À DÉFINIR** (owner: operator; dependency: RWL-C5 host volume).
- Uptime / availability SLO — **À DÉFINIR** (owner: CTO/operator).
These require a real deployment (RWL-E1) to measure; no numeric threshold is invented here.

## 8. Actions requiring human authorization
Push/deploy, enabling real email send (`EMAIL_SEND_ENABLED=1` + grant), enabling live payments
(`PAYMENT_LIVE_ENABLED=1`), any real external contact/charge, and any threshold/SLO decision (§7). Per §E/§I of
the launch roadmap and the §I gates of `ODG_MASTER_ROADMAP.md`.
