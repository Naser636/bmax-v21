# ODG — DEFECT & ANTI-RECURRENCE REGISTER (permanent)

> Companion to `ODG_MASTER_ROADMAP.md`. Stable IDs; each entry: symptom · cause (confirmed/hypothesis) ·
> location · reproduction · regression test · fix+checkpoint · status · closure evidence · residual limits.
> **Before any mission:** load applicable entries, run their regression tests, confirm the fix is not reopened.
> Never delete entries or their tests. Extend as new defects are confirmed. "Status" uses the roadmap vocabulary.
>
> Evidence rule: a defect is "fixed" only with a named test/observation at the current HEAD; a prior report is
> not proof. This register is curated from repo artifacts (tests/commits) and the verification history
> (`PHASE_0_CARNET.md`); where a claim could not be re-verified in this read-only mission it is marked UNVERIFIED.

## Resolved (regression-guarded) defects

| ID | Symptom | Confirmed cause | Location | Regression test | Fix @ checkpoint | Status | Residual |
|---|---|---|---|---|---|---|---|
| DEF-001 | delivery packager accepted an in-scope evidence path that was a symlink to a file OUTSIDE cwd (scope escape) | scope enforced on the path STRING; `fs` read follows symlinks | `runtime/core/pilot-delivery-packager.js` (`verifyArtifact`) | `pilot-delivery-packager.test.js` 13a-d | realpath confinement `d52ced8` | ACCEPTED (local) | theoretical TOCTOU (open-fd read) — DEF-010 |
| DEF-002 | website form and `/api/intake` not co-served (same-origin POST would 404) | static `site/` vs Next `src/app/`; no bridge | `src/app/site/[...slug]/route.ts` | `site-serving.test.ts` (served==source, same-origin form) | same-origin serving `d77f174` | TESTED_LOCALLY | deployment reachability = DEPLOYMENT_VERIFIED only by a real deploy probe |
| DEF-003 | intake persisted to ephemeral `process.cwd()` store (non-durable/non-shared on serverless) | hardcoded cwd-relative store, no config | `runtime/core/client-intake.js` (`storeBase/storeState`) | `deployment-readiness.test.js` (config/prod-block/restart) | configurable `ODG_CLIENT_STORE` + prod block `d77f174` | TESTED_LOCALLY | multi-instance NOT supported — DEF-011 |
| DEF-004 | sequential intake ids could collide under concurrency | read-max+1 then separate write | `client-intake.js` (`intake` exclusive `wx` create) | `deployment-readiness.test.js` #6 | exclusive-create + bounded retry `d77f174` | TESTED_LOCALLY (mono-instance) | multi-instance → DEF-011 |
| DEF-005 | mission-context-stale CRITICAL kept firing (frozen incident) | stale generated artifacts from 2 historical runs; detector is INTENDED/locked | `runtime/core/self-diagnostic.js` | `self-diagnostic.test.js` #12/#13/#14 | NO fix (residue, not defect; a2afd2a is the lock) | ACCEPTED (not-a-defect) | resolve by context refresh, not code change |

## Open / known-limitation entries (no fix warranted or human/provider-gated)

| ID | Symptom/limit | Cause | Location | Status | Required to close |
|---|---|---|---|---|---|
| DEF-006 | `governance-kernel.authorizeMission` "tautology" (`authorized`=state-transition fact) | honest relabel + locked; not an authority gate for any consequential action | `runtime/core/governance-kernel.js` | ACCEPTED (non-exploitable; proven) | — (hardening optional, needs an authority source = governance decision) |
| DEF-007 | capability-router (resolver) OFF the `src/runtime` migrated route | intentional separation (repair/reuse-tier vs mission-exec resolver) | `runtime/core/capability-router.js` | ACCEPTED (intentional) | — |
| DEF-008 | email live path unproven | no IMAP/SMTP credentials; send disabled by default | `runtime/core/email-gateway.js` | NOT_CONFIGURED | human: provide creds; probe |
| DEF-009 | invoicing legal compliance (FR e-invoicing/Factur-X, SIREN/VAT) not certified | engine computes amounts only; no legal certification | `runtime/core/invoicing.js` | BLOCKED (legal) | human/accountant/lawyer sign-off; fiscal params |
| DEF-010 | theoretical TOCTOU between realpath validation and read | separate `realpathSync`→`statSync/readFileSync` syscalls | `pilot-delivery-packager.js` | OPEN (theoretical, not reproduced) | optional open-fd read hardening |
| DEF-011 | multi-instance intake store concurrency unproven | file-store + mono-instance assumption | `client-intake.js` | OPEN (scoped out) | shared lock/DB if load-balanced (design decision) |
| DEF-012 | deployment reachability of `/site/*` + `/api/intake` not verified | no deploy performed (forbidden) | hosting | NOT_CONFIGURED | VPS deploy + post-deploy curl probe (LAUNCH_READINESS §VPS) |

## Hard lessons (apply to every mission — generalized, not file-specific)
- A function can exist yet be **unreachable** from the real execution path (verify the path, not just the symbol).
- A **route/handler test** does not prove the page is actually **served with that route** in the deployable app.
- A **green build** does not prove **durable storage** on the target host.
- A **simulated/mocked** commercial journey does not prove a **real external provider** works.
- **Sequential ids** do not prove **absence of concurrent collisions**.
- A **readiness** component does not prove the **real configuration** is correct (presence ≠ working).
- **Missing configuration must BLOCK** the operation cleanly — never silently fall back to a temp/ephemeral store.
- An **agent/role declaration** is not **proof**; consensus never replaces evidence.
- **Historical artifacts can be stale** and must not be auto-deleted without verification.

(Search the repo archives — `PHASE_0_CARNET.md`, `docs/audit/`, commit history — for additional documented
defects before closing related work; this register is not exhaustive of all historical incidents.)
