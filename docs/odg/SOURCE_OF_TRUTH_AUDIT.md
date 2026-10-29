# ODG — Source-of-Truth Recovery: Gate A audit + repair matrix

> **P0 campaign.** Read-only Gate A audit @ `main` HEAD `10af72f` (2026-10-29), plus the first Gate B source repair.
> VPS was NOT touched. Documentation only — this file claims **no deployment state**; the closure register remains the
> SSOT for item status. Every finding is evidence-cited (path:line / commit / test).

## Truth Lock (verified)
- repo root `/home/ubuntu/bmax-v21`; branch `main`; HEAD `10af72f` == `origin/main`; divergence **0/0**; worktree clean (only pre-existing untracked foreign dirs).
- **The VPS-diagnostic commit `10af72f` IS exactly current main HEAD** (observation #1 verified). 5 stashes + 7 worktrees preserved; nothing deleted/reset.

## Diagnostic observations — verified verdicts

| # | CTO observation | Verdict | Evidence |
|---|---|---|---|
| 1 | VPS repo at `10af72f` | **TRUE** — = current main HEAD | `git rev-parse HEAD` |
| 2 | `odg-schedule-tick` builds a synthetic queue from `ODG_CANARY_ALLOWLIST`, not the canonical-queue consumer | **TRUE — intentional, documented** | `odg-schedule-tick.ts:19-23` (explicitly "SYNTHETIC … ISOLATED canary interface BY DESIGN, NOT the canonical pending-queue"); `mission-scheduler.ts:9-19` canonical-vs-canary contract |
| 3 | the canary tick doesn't call a provider | **TRUE — intentional** | `odg-schedule-tick.ts:17` "never calls a provider"; no provider constructed |
| 4 | `odg-campaign-run` refuses without an authorized executor | **TRUE — correct fail-closed** | `odg-campaign-run.ts:59,67-70` → `NO_EXECUTOR_AUTHORIZED`; a genuine `verification` executor exists (`:12`); proven live by `odg-campaign-run.test.ts` (register byte-identical) |
| 5 | Truth-Lock refusals from non-main branches | **TRUE — correct fail-closed (opt-in enforce)** | `truth-lock-gate.ts:59-63`; binding only under `ODG_TRUTH_LOCK_ENFORCE=1`; always records a verdict |
| 6 | VPS systemd units don't match "prepared-not-installed" docs | **PLAUSIBLE — source-internal contradiction confirmed; VPS side unverifiable here** | Finding F1 below |
| 7 | branch/session changes not integrated/deployed | **TRUE — superseded/abandoned** | Finding F3 below |

**Headline:** the autonomous-execution chain is, in source, built to the governance contract the diagnostic worried about and is fail-closed and tested — three distinct non-conflated paths (canary / canonical-engineering / delegation); no state conflation (IDLE/BLOCKED/WAITING_EXTERNAL/NO_EXECUTOR_AUTHORIZED never remapped to COMPLETED); the paid-provider gate (`provider-live-call-gate.ts`, default REFUSED, zero spawn) is wired into both adapters + `fleet-bridge` with no bypass found. The real P0 content is **honesty/provenance of control-plane artifacts** and **one code-level canary fail-open** — enumerated below.

## Confirmed root-cause findings (prioritized)

- **F0 — Canary read-only guarantee was allowlist-trust, not code-enforced (P1, REPAIRED this cycle).** `odg-schedule-tick.ts` `authorize` checked only `allow.has(mission)`; an allowlisted-but-mutating mission would be dispatched to the real `odg-run`. `canary-decision-pack.assessCanaryCandidate` existed but was unwired; no test covered the allowlisted-mutating case. **Fixed** — see Gate B below.
- **F1 — Stale deploy/governance control-plane artifacts contradict the operational log (P1, owner/governance-gated).** `deploy/odg-preprod.service.candidate` and `deploy/odg-mission-runner.service` self-describe "NOT installed / DESIGN ARTIFACT" while `ODG_PROJECT_STATE.md:1854,1856` records them installed+active; the `deploy/` headers were never reconciled post-install. `ODG_AUTONOMOUS_WORK_PROTOCOL.json` `current_campaign_scope` (`:189-213`, `status:ACTIVE`) still authorizes the RC1–RC5 write-set whose `runtime/core/*.js` paths were removed in the ZERO-JS migration. **The governance JSON is a protected path → its reconciliation is a CTO-approval action, not applied here.**
- **F2 — Provenance systems are disconnected; deployment currency is not provable from the repo (P2, flag).** `runtime/dist/dist-closure-manifest.json` carries provenance-shaped fields (`sourceCommit:6d95f45` — 4 behind HEAD, `sourceClean:false`) but is a local build cache, never consulted by the release pipeline; the real release provenance is `scripts/odg-release.sh` → `RELEASE.json` (clean worktree). Newest repo deploy evidence `docs/odg/deploy/VPS_STATUS.md:49` points to `e84a0cf` (**141 commits stale**), so "VPS at 10af72f" is **not corroborated by any repo deploy record** (VPS out of scope).
- **F3 — Unmerged work is superseded/abandoned (P3, inventory only).** `worktree-stabilization+controlled-odg` (8 commits, 2026-10-05/06) and `dashboard-isolated`@520b6d8 (1 commit, 2026-10-14) edit `runtime/core/*.js` / `runtime/bin/*.js` files **removed in the ZERO-JS migration**; main has TS ports (the dashboard one is improved on main). Not mergeable as-is; whether `governed-web-fetch.js`'s logic was re-implemented (main grew `bounded-http-client.ts` instead) is **unverified**.
- **F4 — Minor/documented (P3).** `mission-scheduler` budget gate is effectively dead in the live caller (`maxBudget:Infinity` default; `budgetSpent` never populated) — low risk since the canary is read-only; `ODG_TRUTH_LOCK_ENFORCE` defaults record-only (documented intentional); independent-verification is waived for the `verification` executor (narrow, documented); there is **no executable governance-path-write-guard module** (protected-path enforcement is policy-only via `CLAUDE.md` import) — asymmetric vs the code-enforced ODG5 reality-gate.

## Gate B — source repair delivered this cycle
**F0 fix (`runtime/bin/odg-schedule-tick.ts`):** `authorize` now additionally runs `canary-decision-pack.assessCanaryCandidate` over the mission's OWN definition (`loadMissionSpec`, snake+camel tolerant); an allowlisted mission that is mutating (`requires_engineering`/`authorized_paths`) or declares network/spend/destructive, OR whose definition is missing, is **REFUSED → BLOCKED → never dispatched** (fail-closed). No new primitive (reuses the existing, previously-unwired classifier). Tests `odg-schedule-tick.test.ts` 7→12 incl. the previously-missing allowlisted-mutating and spec-unavailable negatives; e2e real-artifact suite still passes; tsc 0, build OK, full test:report 201/201.

## Final matrix (per P0 §6)

| Item | Source corrected | Tests proven | Integrated (main) | Deploy artifact prepared | Deployment actually verified | VPS-reserved action |
|---|---|---|---|---|---|---|
| F0 canary read-only code-guard | ✅ | ✅ 12 unit + e2e | ⟶ PR this cycle | n/a (runtime code) | n/a | none |
| F1 stale deploy headers | ✖ (not flipped — can't verify VPS) | — | — | artifacts exist, headers stale | ❌ not verifiable from repo | reconcile headers only after VPS state is independently confirmed |
| F1 governance-scope stale | ✖ (PROTECTED path) | — | — | — | — | **CTO**: amend `ODG_AUTONOMOUS_WORK_PROTOCOL.json current_campaign_scope` (DEFERRED/SUPERSEDED) via governance |
| F2 provenance disconnect | ✖ | — | — | release pipeline real; manifest is cache | ❌ | optional: a single release-manifest linking commit→build→deploy |
| F3 unmerged branches | ✖ (superseded) | — | ❌ (not mergeable as-is) | — | — | **CTO**: confirm discard, or request TS re-implementation + behavior diff |

## Learning cycle (this cycle)
Observed (audit) the allowlist-only fail-open + the unwired classifier → captured with provenance (two read-only audit agents + my own spot-verification of `odg-schedule-tick.ts`/`canary-decision-pack.ts`) → persisted (this doc + register) → **reused** the finding to wire the existing classifier as a fail-closed gate → **effect measured** (negative tests: allowlisted-mutating ⇒ BLOCKED/zero-dispatch; e2e real-artifact PASS). Recorded AND effective.

## Single next action
Independent-audit + merge the F0 canary read-only guard (this cycle), then the P0 chokepoint is the **CTO governance decisions** for F1 (deploy-header + protocol-scope reconciliation) and F3 (discard vs re-implement the superseded branches) — these are owner-gated and must not be self-applied. No product-roadmap work resumes until the CTO clears the P0 chokepoint or documents it as an accepted external blocker.
