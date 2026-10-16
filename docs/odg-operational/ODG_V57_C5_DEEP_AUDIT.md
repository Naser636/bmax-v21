# ODG V57 — C5 Deep Qualitative Audit (authority / policy / evidence freshness)

> **Read-only forensic audit.** No runtime file, permission, or business datum modified. Every finding
> ties to a source or a reproducible command. Statuses use PASS / FAIL / BLOCKED / SKIPPED / NOT-EXECUTED /
> NOT-RE-VERIFIED. A declared control is reported EFFECTIVE only when a passing test actually exercises it.

- **Truth Lock @ audit start & end:** HEAD==origin==`a1bf3a4` (V56 docs tip; code `fa51c1f`), branch `main`,
  divergence 0/0, worktree clean, index empty, 5 stashes. HEAD commit date `2026-10-16T12:14Z` (freshness ref).
- **Coverage:** the **9 executors** audited DEEPLY (identity/contract/binding/authority/policy/evidence/execution);
  the authorization surface (`action-gate`, `capability-authorization`, `bash-command-governor`) exercised by
  passing tests; the **15 probes** + **177 runtime capabilities / 15 missing** audited at a BOUNDED level
  (enumeration re-verified V55/V56 + effective framework tests) with deep per-item grade explicitly DEFERRED.

## Authority / policy — architectural findings

- **No central authorization chokepoint at dispatch.** `resolve()`/`runAudit()` (capability-executors.js) match an
  executor by `matches(patch)` and call `run()` — there is NO dispatch-level authorization invariant. Authorization
  is enforced **per-capability** by distinct mechanisms. All CURRENT executors enforce appropriately, but a FUTURE
  executor could omit its gate with nothing structural to catch it. **Anomaly A1 — severity MEDIUM (latent).**
  Minimal fix (code + design ⇒ **distinct CTO authorization**, NOT done here): a dispatch-level assertion/registry
  requiring every consequential executor to declare+prove its gate. Documented, not implemented.
- **`scope ≠ authority` is CODE-ENFORCED (good).** `confineSyntheticTarget` (Synthetic Deliverable / Spec Author)
  rejects a target outside `authorized_paths` AND applies a PROTECTED-GOVERNANCE guard: a scope subsuming
  `runtime/governance/**` does NOT authorize a governance write — elevation is read ONLY from `plan.allowProtectedGovernance`,
  never inferred from scope (capability-executors.js:311-341). EFFECTIVE (exercised by capability-executors.test.js).
- **Authorization controls are EFFECTIVE, not merely declarative** — each verified by a passing hermetic test run
  THIS audit: `action-gate` ALL PASS; `capability-authorization` 35 assertions; `bash-command-governor` 52
  assertions (parse→action-gate→allowlist→sandbox); `capability-executors` 53; `capability-probes` 47.
- No competing authority found vs the nine primitives; no bypass path surfaced in the audited executors.

## Executor matrix (9 — deeply audited)

| Executor (capability) | Binding | Authority / policy (effective control) | Evidence artifact | Freshness | Status |
|---|---|---|---|---|---|
| ODG Synthetic Deliverable | resolve/runAudit; `confineSyntheticTarget` | scope≠authority + protected-governance guard (code-enforced) | `runtime/generated/odg-synthetic-deliverable.json` | **ABSENT** | WIRED · TESTED · GATED · evidence ABSENT |
| ODG Spec Author | resolve/runAudit; `confineSyntheticTarget` (read-only scope) | same guard; spec authored from plan data | `runtime/generated/odg-spec-author.json` | **ABSENT** | WIRED · TESTED · GATED · evidence ABSENT |
| Governed Git Branch Integration | dep `git-branch-integration` (equivalence bench) | governed git branch ops | `…/git-branch-integration.json` | **2026-10-07 (STALE ~9d)** | WIRED · TESTED · evidence STALE |
| Governed Bash/Linux Command | dep `bash-command-governor` | **action-gate + policy + allowlist + isolated sandbox** (52-assert test) | `…/bash-command.json` | 2026-10-10 (~6d) | WIRED · TESTED · GATED |
| Clean Workspace | resolve/runAudit (read-only scan+report) | read-only; no consequential authority | `…/clean-workspace-report.json` | 2026-10-15 (recent) | WIRED · TESTED |
| Governed Observability Verification | resolve/runAudit (read-only) | read-only verification | `…/observability-verification.json` | 2026-10-15 (recent) | WIRED · TESTED |
| External Research Acquisition | resolve/runAudit | **named human LIVE research grant** (safe-probe; never auto) | `…/external-research-acquisition.json` | **ABSENT** | WIRED · TESTED · HUMAN-GATED · evidence ABSENT |
| Connectivity Audit | resolve/runAudit | bounded read-only network probe (timeouts) | `…/connectivity-audit.json` | 2026-10-15 (recent) | WIRED · TESTED |
| Provider Activation | dep `provider-activation.ts` | **MANUAL_ONLY** provider seam (no auto-invoke) | `…/provider-activation.json` | 2026-10-14 (~2d) | WIRED · TESTED · MANUAL_ONLY |

## Evidence-freshness findings

- **All executor evidence lives in gitignored `runtime/generated/` ⇒ mtime-only, NOT commit-traceable.** There is
  no provenance binding an evidence artifact to the source commit that produced it. **Anomaly A2 — severity LOW/MED.**
- Distribution vs HEAD (2026-10-16): **3 ABSENT** (Synthetic Deliverable, Spec Author, External Research — all
  write-on-demand / grant-gated, so absence = "not recently run", NOT "broken"), **2 STALE** (Git Branch 10-07,
  Bash 10-10), **4 recent** (Clean Workspace, Observability, Connectivity 10-15; Provider 10-14).
- Minimal fix (NOT done — would write runtime/generated, out of this read-only scope): stamp each evidence
  artifact with `{sourceCommit, sha}` at write time (mirrors the build-dist-closure provenance pattern, §S-10).

## Probes / capabilities (bounded)

- **15 probes:** framework effective (capability-probes.test.js 47 assertions PASS). Deep per-probe grade: **DEFERRED**.
- **177 runtime capabilities / 15 missing:** counts reconciled (V55); the 15 missing are real unbound missions
  (deploy-perimeter `VPS_DEPLOYMENT_READINESS`/`DEPLOY_BMAX_DASHBOARD_PROD_V1` — gated; `BUILD_RUNTIME`; several
  NL-gateway auto-stubs `NL_*`) — none phantom (V56). Deep per-capability authority/evidence grade: **DEFERRED**.
- **Canonical A01–A54 / 166:** **NOT_ENUMERABLE** (FROZEN Master fiches) — NOT certified. Root cause: the canonical
  set is defined only in the frozen Master prose, with no machine-enumerable manifest; certification would require
  a CTO-authored canonical manifest + a declared capability→canonical mapping (neither exists). Status unchanged.

## Certification verdict — **PARTIAL (honest)**

- Executors (9): **AUDITED** — all WIRED, contract-clear, authority-enforced (controls exercised by passing tests),
  execution-green (in `npm test` 398); evidence freshness MIXED (3 absent / 2 stale / 4 recent, mtime-only).
- Probes + capabilities: BOUNDED (effective framework tests; deep per-item DEFERRED).
- Canonical A01–A54/166: NOT_ENUMERABLE (not certified). No control claimed effective without a passing test.

## Anomalies → minimal corrections (none crossing the authorized scope)

| ID | Finding | Severity | Correction class | Decision |
|---|---|---|---|---|
| A1 | No dispatch-level authorization invariant (per-capability enforcement only) | MEDIUM (latent) | code + design | **CTO authorization required** — not implemented |
| A2 | Executor evidence not commit-traceable (mtime-only, gitignored) | LOW/MED | code (write to runtime/generated) | out of read-only scope — proposed |
| A3 | 2 stale + 3 absent executor evidence artifacts | LOW | operational re-run | optional refresh (writes runtime/generated) — not done |
| A4 | Canonical A01–A54/166 non-enumerable | — | CTO canonical manifest | kept NOT_ENUMERABLE; prerequisite documented |
