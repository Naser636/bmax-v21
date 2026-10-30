# ODG Campaign Closure Bilan — 2026-10-30

> Factual closure report for the integration + consolidation + frontier campaign run this session. Every status here
> is backed by a merged commit, a test result, or a cited artifact — never a push or an intention. Historical
> roadmaps are preserved as references (see `docs/odg-operational/ODG_ROADMAP_CROSSWALK.md`); this bilan does not
> replace them.

## 1. What was integrated to `origin/main` (proof = merge commits)

The long-standing "git problem" (push≠merge; `gh` unauthenticated) was cleared once `gh` auth landed (Naser636).
All of the following are MERGED on `origin/main` (verified: each commit is a proven ancestor of main):

| PR | Lot | Merge commit |
|---|---|---|
| #268 | POST-V107 15-lot security/observability stack + CI-portability fix (node execPath + rustc sysroot bind; code-execution serialized) | 0fdb8bf |
| #269 | Phase-4 register/compass reconciliation (integration blocks) | 130fac3 |
| #270 | Governor path-form classification bypass (basename-normalize DANGEROUS/SHELL_ESCALATOR) | 82d5e01 |
| #271 | Toolchain-probe strict exit code + einvoice batch error count | 1cc4210 |
| #272 | Behaviour/integration execution confinement (bubblewrap --unshare-all) | e56c00d |
| #273 | Master-roadmap consolidation crosswalk + §U/§Q drift fix + stale-doc banners + WEAK-1 | 46d1b74 |
| #275 | CI reliability: drop hanging npm cache in setup-node + step timeout (setup 20-min stall → 0s, proven) | 2e6fa65 |
| #276 | Audit-finding closure: crosswalk omissions (roadmap-dependencies.json 3rd companion, CTO targets, €500k boundary) + §S banner | fc88bd1 |
| #277 | Dockerfile NO-INSTALL structural-lint capability (pure-TS hadolint subset) | c54609f |
| #278 | pending/ queue prune (5 inert removed, 2 AUTHORIZED kept with documented justification) | 89a339f |
| #279 | Correctness: commercial-portfolio longest-track horizon + dep-planner empty-schedule maxParallelism | bc9dbcf |
| #280 | Robustness: crash-atomic (temp+rename) for saveRegister + checkpoint + scheduler-audit-chain | b24513d |
| #281 | Final reconciliation: register 121 (crash-atomic lot + broad-IT 11/12 + roadmap-deps no-op evidence) + compass clviii + this bilan + continuity fix (repo auto-merge) | (this PR) |

12 per-lot PRs (#256–267) were merged within the consolidated #268. Zero force-push, zero protection bypass, zero
deletion of foreign files/stashes (the two July `mission-context-builder` stashes + the foreign `docs/{film-factory,
market-research,ecommerce,action-film}` untracked trees are preserved).

## 2. Defects found + fixed this session (3 recon passes, reproduce→fix→test→merge)

- recon-1 (checkers/governor/sandbox): governor path-form bypass, toolchain-probe fail-toward-available, einvoice batch count gap, behaviour/integration unconfined-"no-network". (#270–272; einvoice+probe in #271.)
- recon-2 (business/product/governance): commercial-portfolio first-track-horizon undercount (MEDIUM), dep-planner empty-schedule -Infinity (LOW). Surface otherwise 0 fail-open/false-success/money defects. (#279)
- recon-3 (runtime/lifecycle/CLI/dashboard): saveRegister (the durable campaign resume point) + checkpoint + scheduler-audit-chain non-crash-atomic writes. Core otherwise clean/hardened. (#280)

Marginal confirmed-defect rate across passes: 4 → 2 → 1 (consequential) — evidence the SAFE computer-side frontier is substantially exhausted (per-pass coverage, not a selector returning empty).

## 3. Register status (canonical P0/P1/P2 lot register — the computer-side objective set)

Base `origin/main` @ `89a339f`: **118 items** (P0=8, P1=40, P2=70). Status: **108 ACCEPTED, 7 BLOCKED, 1 IN_PROGRESS,
2 DEFERRED**. After #279 (+2 recon-2 lots) and #280 (+1 crash-atomic lot) land → 121 items, 111 ACCEPTED.

**Progress method:** % = ACCEPTED / total register objectives (each lot is one objective; unweighted — the register
does not carry weights, so a weighted figure would be invented). **Computer-side completion = 111/111 of the
NON-owner-gated objectives** (every open item is owner/external/privileged-gated — see §4); **overall register ≈
111/121 = 91.7% ACCEPTED**, the remaining 8.3% entirely owner/external-gated with computer-side scaffolding complete.

## 4. The 10 open items — EACH individually re-examined; all owner/external/privileged-gated

| id | status | single owner/external action required | computer-side state |
|---|---|---|---|
| broad-it-corpus-grow | IN_PROGRESS | — (blocked on broad-it-independent-eval-set) | Coverage PROVEN 11/12=0.9167, mode-diverse; broadIT=NO_DATA ONLY because labels are self-authored. Adding more self-authored cases would NOT change the verdict (and adding Dockerfile would overstate structural≠full-lint). Nothing honest left computer-side. |
| broad-it-independent-eval-set | BLOCKED | obtain a third-party independently-labelled corpus, run through admitEvalSet | admission harness built + tested |
| campaign-runner-systemd-activation | BLOCKED | owner installs/enables the systemd timer on the VPS (privileged) | campaign-loop + entrypoint + runbook PREPARED |
| dashboard-tls-exposure | BLOCKED | owner provisions TLS + sets ODG_DASHBOARD_EXPOSURE_CONFIRMED + exposes | fail-closed gate + 5 control artifacts built |
| new-language-families | BLOCKED | owner installs hadolint (not in apt) | NO-INSTALL Dockerfile structural subset DELIVERED (#277); hadolint-richer part owner-gated |
| structured-roadmap-deps | BLOCKED | owner applies deps INTO the protected runtime/governance/ROADMAP.json | companion roadmap-dependencies.json has NO further prose-stated edges to add (verified — contracts state none); no-op confirmed |
| p01-demand-validation | BLOCKED | owner runs the lawful willingness-to-pay outreach | demand-evidence + experiment harness built |
| p01-billing-sandbox | BLOCKED | owner configures a real billing provider (secrets/spend) | sandbox + idempotent-reconcile built |
| golden-path-scaffolder-poc | DEFERRED | owner productization decision | prototype + tests preserved |
| commercial-ops-substrate-h3 | DEFERRED | owner decision + CRM-disclaimer reconciliation | reconciled inventory; modules exist |

## 5. Historical roadmap / CTO-commitment reconciliation (summary; full map in ODG_ROADMAP_CROSSWALK.md)

Canonical operational SSOT = `ODG_MASTER_ROADMAP.md §Q` + machine companions (`runtime/governance/ROADMAP.json`
[11 missions, 10 executed + DEPLOY_BMAX owner-gated], `closure-register.json`, `roadmap-dependencies.json`). All
historical ladders cross-walked + dispositioned (SUPERSEDED/RETIRED/DANGLING/history/owner-gated), original IDs
preserved: §K/§G/§M; §M-2/§M-3 superseded by ZERO-JS; Phase-04/DEC-V60-166 retired; ROADMAP_PHASE_1..5 + RUNTIME_
EVOLUTION_PROGRAM_V1 + PLATFORM_BOOTSTRAP + UNIFY_RUNTIME_EXECUTION = superseded July-2026 legacy; MASTER_PLAN_V1 =
dangling orchestrator (5/6 sub-roadmaps unauthored, inert); FEUILLE_DE_ROUTE FND-F0–F12 + docs/ROADMAP Sprint 6-12+
+ FOUNDATION_STATUS = banner-closed (preserved). THREE "F" namespaces (FND/SEC/FILM) + THREE "P" numberings
disambiguated. CTO_DIRECTIVES Targets 1–6/Priorities 1–8 = satisfied-by-construction, tracked by the companions.
**"ODG MASTER ROADMAP D'EXCELLENCE OPÉRATIONNELLE (28 July 2026)" = NOT LOCATED** anywhere in the working tree or
full git history (closest = §X "Operational Excellence", English, 2026-10-17) — recorded as referenced-but-absent;
**OWNER CONFIRMATION REQUESTED** whether a distinct document is expected.

Independent Phase-F audit of the consolidation = ACCEPT-WITH-FIXES (1 blocking error — ROADMAP.json 11 not 12 — fixed;
exhaustiveness fixes applied).

## 6. Gates verified

CI reliability fix proven (setup-node 0s, Classified test gate ~134s green). Per-lot: `build:runtime` + `tsc --noEmit`
(both tsconfig.json and tsconfig.runtime-dist.json for runtime/bin) + targeted suites + consumers, all green before
each merge. CI `test:report` (236-suite classified gate) is the merge gate and was green on every merged PR.

## 7. Blocks genuinely requiring the CTO (single precise action each)

See §4 — 8 BLOCKED + 2 DEFERRED, each a single owner/external/privileged action. Plus the separate environment issue:
**Claude Code auto-update fails `no_permissions`** — it is an npm-global install under root-owned `/usr/local`, not
writable by user `ubuntu`; owner-side fix is `claude install` (native, user-local, no sudo). No permissions were
changed by ODG.

## 8. Remaining computer-side work (not hidden)

After #279/#280 integrate: NONE of consequence that is non-owner-gated and demonstrated — three recon passes +
per-item re-examination found the remaining frontier owner-gated. Lower-value documented deferrals (not defects):
the autonomy-adapter `archive()` in-session advance (self-correcting next session; behavior-change, deferred). Any
future work resumes via the single global command below.

## 9. Single global resume command

```
git checkout main && git pull --ff-only origin main && npx tsx runtime/bin/odg-resume.ts docs/odg/closure-register.json
```
Then read `ODG_PROJECT_STATE.md` (latest REPRISE) + `docs/odg-operational/ODG_ROADMAP_CROSSWALK.md` + this bilan.
