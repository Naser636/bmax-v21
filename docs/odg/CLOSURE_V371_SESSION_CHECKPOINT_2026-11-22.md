# CLOSURE V371 — session checkpoint and transmission to Boussole V12.4 (2026-11-22)

> Canonical session-closure checkpoint, following the existing `docs/odg/CLOSURE_*` convention; it is not a parallel system.
> Its pointer lives in the compass (`ODG_PROJECT_STATE.md`, LATEST entry V371).
> **Hard registers are deliberately UNCHANGED:** `docs/odg/closure-register.json` (427 items, byte-identical invariant pinned by tests) and `docs/odg/v124-consolidated-roadmap.json` (24 missions).
> Every fact below was **verified in-session**. Claims that were announced but not verified are marked as such.

## 1. Session
- Claude Code session `6cab89c8-b42c-4fe1-8a23-22912dd25cd7`, 2026-11-21 → 2026-11-22. Claude Code acts as technical provider only; ODG and the owner hold the authority.
- Campaign labels used in this session: V362–V370 (Truth Lock recovery, VPS consolidation, security, release preparation) and V371 (this closure).
- The CTO command titled "V362 — finalisation V361/V361-A/V361-B" only executed its **§1 truth reconstruction**. Its Lots A/B/C were **not started** (see §6).

## 2. Reference
- **HEAD `b8b1aaf5` on `main`, identical to `origin/main`.** It is the merge commit of PR #850; its tree is identical to `ad8c8965`.
- Announced checkpoints, now verified: `344cd9fe` (#842) and `465fc788` (#843) are ancestors of HEAD, 15 and 14 commits behind. Neither is the current HEAD.
- This checkpoint is committed on branch `docs/v371-session-closure`. It reaches `main` only through a PR, because `main` is protected (required CI check, `enforce_admins`).

## 3. PRs / commits in scope
- PRs #812–#850 are all merged on `main`; 0 PRs are open.
- V361 arc commits: #840–#842 (per-axis intelligence evaluation), #843–#844 (V361-A census), #845–#849 (V361-D: circular-dep fix, eval-module audit, decision-surface judgment, lifted-auth audit, Ed25519 identity-bound promotion).
- PR #850 (V365 consolidation), merged as merge commit `b8b1aaf5` after the required CI check passed (4m56s). It contains 7 commits:

  | Commit | Change |
  |---|---|
  | `d702bd5e` | `.gitignore` adds `__pycache__/` |
  | `42c6608f` | compass entry V362 |
  | `3407257b` | `next start`/`next dev` bind to `-H 127.0.0.1` |
  | `19af6216` | non-breaking `npm audit fix` (0 vulnerabilities) |
  | `4321b86d` | resident-driver systemd hardening drop-in |
  | `0882dfd1` | provenance: C6 probe source + V317–V320 drivers, byte-identical |
  | `ad8c8965` | narrow eslint ignore for `docs/odg/autonomy/*.js` |

## 4. Completed and proven (DONE)
| Item | Evidence |
|---|---|
| Truth Lock restored without data loss | 3 generated artefacts removed; 4 historical docs dirs excluded locally via `.git/info/exclude`; 928-file SHA-256 manifest; `verify-historical.sh` returns 928/928 (negative test exits 1) |
| Orphan `next-server` servers on `*:3993/*:3994` stopped (started 2026-11-19 by `npx next start` without `-H`) | identity verified before SIGTERM; the ports have been closed since |
| Root cause fixed in code | `3407257b`; independent inspection ACCEPT |
| Dependencies | `19af6216`; `npm audit` (production and full) = 0, re-run against current advisories on 2026-11-22 |
| Resident-driver hardening | drop-in installed (`~/.config/systemd/user/odg-resident-driver.service.d/v364-hardening.conf`); real L0 tick `Result=success`, `writes=0`, `executedMission=false` |
| C6 probe provenance | `docs/odg/C6_PROBE.sh` sha256 equals the `probeSha256` pinned in `docs/odg/c6-certification-evidence.json` |
| Release prepared for production | `rel-20261122T023859Z-b8b1aaf5cfc4-_2nco-sIl4gROZPPI24xl` (next 16.4.6, react 19.2.4); staging verify returned health 200 with the correct buildId (isolated data) |
| Rollback drill (isolated release root, loopback test ports) | activate → buildId `_2nco…`, then rollback → `5jBqWO…` (= prod), health 200 at each step; drill servers stopped |
| Active-release backup | `~/odg-preservation/V369/rel-…95661e1….tgz`, sha256 recorded, restore-diff identical |
| Single development source | 1 repository working tree; local branches `main` + `governance/f11-operating-contract` |

## 5. Partial / not verified
- **Full test suite:** 832/835 on the tree of `b8b1aaf5` (run against `ad8c8965` in a worktree). Failures:
  - `odg-cto-dashboard` and `odg-health` fail **only in the full run**. This is pre-existing: they fail identically on baseline `25946a30` and pass standalone. Root cause NOT_MEASURED; it is suite interaction, not this session.
  - `odg-backup-restore` fails in any worktree because `scripts/odg-backup-vault.sh` defaults `REPO` to the canonical clone. It passes on `main`. This test fragility is still open.
- The full suite was **not** re-run on the merge commit itself (identical tree). CI on PR #850 passed.
- The nftables syntax of `odg-ssh-allowlist.sh` is **UNVERIFIED**: `nft -c` needs root, and `unshare`/`bwrap` netns are blocked by AppArmor.

## 6. Blocked (exact reasons)
| Item | Blocked by | Exact unblock |
|---|---|---|
| Production update 95661e1 → b8b1aaf5 (Next 16.2.9 → 16.4.6) | root needed to `systemctl restart odg-preprod` (system unit); `sudo -v` was denied to the provider | owner runs `sudo bash ~/odg-preservation/V370/odg-owner-finalize.sh deploy` (preflight + swap + restart + auto-rollback) |
| Host inbound firewall (SSH only from owner IP) | root; rescue console not verifiable from the VPS; syntax unverified | owner verifies the OVH rescue console, then runs `… odg-owner-finalize.sh firewall` and `confirm` from a NEW ssh session (auto-rollback otherwise) |
| Host egress filtering | root; requires a log-only observation phase first | `~/odg-preservation/V368/firewall/EGRESS_ALLOWLIST_PROPOSAL.md` |
| `ubuntu` in group `docker` (root-equivalent) | root | `… odg-owner-finalize.sh docker-group`. Only used by container `edg-core` (nginx, 127.0.0.1:8080); no ODG code uses the docker CLI |
| Radar real collection / Lot A | the only grant (`docs/odg/V141_RESEARCH_GRANT.json`) **expired 2026-11-19T00:00Z**, so `GRANT_EXPIRED` is DENIED; the **Addendum V361-B text is not in the repo or this session**; the **V371 grant is PROPOSED** (not accepted, and its text is not in the repo) | the owner accepts a grant in the canonical research-governor shape (`authorized`, domains, `expiresMs`, budget, constraints) and supplies V361-B for recording |
| Lots B (activation beyond L0, DEFERRED→READY, proposal→mission, repair-apply) and C | depend on V361-B authorizations that are not available | V361-B text |
| Independent backup of unique data | USB medium not mounted | mount the medium; compare against `MANIFEST.tsv` / `*.sha256sum` |
| Register BLOCKED items (pre-existing, unchanged) | owner/external | `broad-it-independent-eval-set`, `campaign-runner-systemd-activation`, `dashboard-tls-exposure`, `p01-demand-validation`, `p01-billing-sandbox`, `p0e-audit-log-keyed-integrity` |

## 7. Canonical classification (session items)
| Item | Status | Basis |
|---|---|---|
| Loopback bind (`3407257b`) | IMPLEMENTED_AND_VERIFIED | inspection ACCEPT; 0 non-loopback ODG listeners |
| Deps fix (`19af6216`) | IMPLEMENTED_AND_VERIFIED | `npm audit` 0 |
| Resident-driver hardening | CONNECTED_AND_USED | installed drop-in active on the real timer |
| C6 probe / V317–V320 drivers | IMPLEMENTED_AND_VERIFIED (provenance) | sha match / byte-identical. Drivers: exactness LIKELY, not PROVEN |
| Release b8b1aaf5 | IMPLEMENTED_NOT_VERIFIED in production | staging + drill only; not deployed |
| Production on 95661e1 / next 16.2.9 | CONNECTED_AND_USED (vulnerable version) | health 200, loopback |
| Inbound firewall | PROPOSED + BLOCKED | script prepared, never applied |
| Egress allowlist | PROPOSED + BLOCKED | proposal document only |
| Docker group remediation | PROPOSED + BLOCKED | command prepared |
| Radar real collection (`odg-radar-collection-adapter`) | BLOCKED | V141 grant expired |
| V360 chains | CONNECTED_NOT_USED for real data (SYNTHETIC/DRY only) | `odg-v360-chains-run`: `radarCollectionDry.enabled=false` |
| 15/15 dimension coverage | DOCUMENTED / structurally COVERED, NOT_MEASURED operationally | COVERED = a representative module exists |
| Component census | IMPLEMENTED_AND_VERIFIED (inventory) | 779 total / 552 CONNECTED / 227 NO_CONSUMER (202 decision surface) |
| V361-B authorizations | DOCUMENTED (externally, by the owner) / not integrated / not operational | text not available |
| V371 Radar grant | PROPOSED | not accepted |

## 8. Correspondence with V12.4 (`docs/odg/v124-consolidated-roadmap.json`, sections A–S)
| V12.4 mission | Section | Previous status | Real status observed | Remaining work |
|---|---|---|---|---|
| `CM-V234-RESIDENT-DRIVER` | E | IN_PROGRESS | IN_PROGRESS: L0 only, hardened, Truth Lock enforced; L1–L3 inactive | L1+ only with explicit authorization (V361-B) |
| `CM-RADAR-GATE-CHAIN` | I | READY | READY; it is the resident driver's `nextEligible`. Chains run SYNTHETIC/DRY only | **next mission (§15)** |
| `CM-V237-REPO-VPS-MAP` | C | READY | READY (this session's VPS inventory is evidence input, not the snapshot) | read-only repo↔VPS snapshot. NB: the V362 CTO command says "VPS untouchable", so execution is deferred until clarified |
| `CM-MULTIMODAL-VIDEO` | P | BLOCKED | BLOCKED (unchanged) | — |
| Security / deploy items of this session | — | — | NOT_MAPPED: no canonical V12.4 mission id was located | owner may map; this is recorded, not invented |
V12.4 has **not** been modified.

## 9. Radar, memory, learning
- No real research, knowledge acquisition or Radar improvement was performed or is claimed in this session.
- Radar collection is deny-by-default, with the grant expired. The canonical isolation egress allowlist (`runtime/core/odg-isolation-egress-allowlist.ts`) remains `api.anthropic.com` + DNS.
- Authorization layers:
  - V141: documented and integrated (`research-governor`, `odg-radar-collection-adapter`), **not operational (expired)**.
  - V361-B: documented externally only.
  - V371 grant: PROPOSED.

## 10. Tests and results (real runs)
- `tsc` 0; `build:runtime` 0; `next build` 0 (candidate and baseline worktrees).
- Targeted suites on `main` `b8b1aaf5`: truth-lock-branch-refusal, odg-health, odg-cto-dashboard, odg-backup-restore, odg-autonomy-ladder-scorecard all 0. `odg-release.test.sh`: ALL PASS (isolated root).
- `npm audit` 0. `git fsck` OK. PR #850 CI passed.

## 11. Permissions and contracts
- Applied: Truth Lock enforcement; resident L0; Ed25519 identity-bound DEFERRED→selectable promotion (#849); GitHub `main` protection (required CI check, `enforce_admins`).
- Not available to the provider: root/sudo (denied). The docker-group route was deliberately **not** used.
- Remaining OWNER_GATED: deploy, firewall, egress filtering, docker group, Radar grant, L1+, métiers (P1–P15, M1–M5 frozen, including M2 BTP).

## 12. Data, archives, branches preserved
- 5 stashes, plus `refs/archive/stash-*`, plus `~/odg-preservation/V363/stashes-archive.bundle` (verified).
- `governance/f11-operating-contract` (local + origin + `branches-archive.bundle`).
- Film Factory, 928 files (paid outputs ~645 MB), checked by `verify-historical.sh`.
- `bmax-v21-corrompu`: unique commits Sprint-07/08 + 2 blobs; archive `~/odg-preservation/V363/bmax-v21-corrompu-git-and-tracked.tgz` (sha verified).
- Releases kept: `current` 95661e1, `previous` 22900dd, and the prepared b8b1aaf5.
- Kept caches (unique, redundancy not proven): `~/.cache/odg-clean-clone`, `~/.cache/odg-tmp` (3437 test repos), `~/.cache/gate-{fix,trackI,verify}`, `~/.cache/track-j-gate`.
- Removed only proven duplicates: 3 worktrees; 74 merged branches (list in `~/odg-preservation/V363/local-branches-before-cleanup.txt`, `~/odg-preservation/V368/branches-before.txt`); 9 old releases (metadata archived); `odg-validation-slot/app` (identical to `ef0aed0a`); `~/odg` (empty); 12 sandbox duplicates; corrompu `node_modules`/`.next`; `bmax-v21/.next`; `~/.cache/gate-final`.

## 13. Decisions
- **Taken:**
  - `main` is the single canonical source.
  - Merge via PR (#850).
  - No circumvention of root refusal.
  - Hard registers left byte-identical.
- **Pending owner decisions:**
  1. Run deploy.
  2. Firewall (after verifying the rescue console).
  3. Docker group.
  4. Accept or adjust the V371 grant and supply the V361-B text.
  5. Clarify the "VPS untouchable" scope versus the dev environment being the VPS.
  6. Fate of the test caches.
  7. Mount USB for verification.
  8. Merge this checkpoint PR.

## 14. Risks and limits
- Production serves **next@16.2.9 with critical advisories** (mitigated only by loopback-only listening).
- No host firewall; SSH is open to the Internet (unauthenticated probes observed).
- Unique data has no independent backup.
- Label collision: V362–V370 were used for this session's campaigns, while the owner's CTO command also uses "V362".

## 15. Next mission (exact)
**`CM-RADAR-GATE-CHAIN` (V12.4 §I, READY).** "Compose existing radar+acquisition+gate into one traced chain" (`odg-global-opportunity-radar` → `odg-knowledge-acquisition` → `odg-sandbox-integration-gate` → `odg-improvement-chain`).
- Step 1, possible without egress: wire and trace the chain on already-recorded, provenance-tagged Radar records, with a WORK_ITEM_CONTRACT and an independent inspection.
- Step 2, real collection: only after an accepted, unexpired grant.
- In parallel, owner-only: run `odg-owner-finalize.sh deploy`.

## 16. Files and evidence needed to resume
- `ODG_PROJECT_STATE.md` (LATEST V371), this file, `docs/odg/CTO_CONTINUITY_PROTOCOL.md`, `ODG_AUTONOMOUS_WORK_PROTOCOL.json`.
- `docs/odg/v124-consolidated-roadmap.json`, `docs/odg/closure-register.json` (`npx tsx runtime/bin/odg-resume.ts docs/odg/closure-register.json`).
- `~/odg-preservation/` (outside the repo, VPS-local):
  - `PRESERVATION_PROTOCOL.md`
  - `verify-historical.sh`
  - `2026-11-21/MANIFEST.tsv`
  - `V362-CTO/REFERENCE_STATE_2026-11-22.md`
  - `V363/*` bundles
  - `V368/firewall/*`
  - `V369/DEPLOY_PROCEDURE.md` + backup tgz
  - `V370/odg-owner-finalize.sh` (`check` passes unprivileged)
- Tools: `odg-v360-chains-run`, `odg-component-census-run`, `odg-v360-dimension-coverage-run`.
