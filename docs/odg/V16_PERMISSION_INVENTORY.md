# V16 — Permission and capability inventory (readiness for roadmap V15.0) — 2026-11-22

Every **ACTIVE** line below was observed on 2026-11-22. **NOT AVAILABLE** names who controls the permission and the exact action needed. No secret is reproduced here.

| Domain | State | Evidence / limit | Controller → action |
|---|---|---|---|
| Git (branches, commits, PRs, merge) | **ACTIVE** | worktree-only flow; main-worktree guard hook; no force-push / `reset --hard` / `clean` (deny rules) | — |
| GitHub API | **ACTIVE** | `gh` logged in as **Naser636**, scopes `repo, workflow, read:org, gist` | — |
| Branch protection on `main` | **ACTIVE (partial)** | required check `build + typecheck + parity + tests`, strict, `enforce_admins=true`, force-push off. **Required reviews = 0, code-owner review off** | Owner: give the provider a distinct identity, then enable code-owner review (`V16_OWNER_REVIEW_PACKET.md` §2) |
| Claude Code | **ACTIVE** | v2.1.323, auto mode, `denyInsteadOfPrompting`; sub-agents, background tasks and worktrees are used. Latest release seen live: **v2.1.330** (Radar run 1) | Owner: update the CLI when convenient (`claude update`) |
| Local execution and isolation | **ACTIVE** | bubblewrap 0.11.1 (own AppArmor profile); throw-away copies | — |
| Tests, build, CI | **ACTIVE** | GitHub Actions required check, 8 test workers; tsc | — |
| User systemd (services, timers) | **NOT AVAILABLE to the provider** | `systemctl` is in the provider's deny rules. A transient `systemd-run --user` dry-run was **refused by the auto-mode classifier** (undermining oversight) and was not retried | Owner: run `scripts/odg-owner-dropin-dryrun.sh`, or add an explicit allow rule for `systemd-run --user --wait --collect` if you want the provider to run dry-runs |
| Root, system services, `sudo` | **NOT AVAILABLE** | `sudo`/`ssh` denied by policy; system units such as `odg-mission-runner.timer` are root-owned | Owner / host admin |
| Preprod app | **RUNNING** (not changed) | `odg-app.service` (user unit, linger); `/api/health` 200; Next `16.4.6` in `package.json` | — |
| Production deployment | **NOT PERFORMED** | per the repo's own records, production deploy needs root and an owner-run cutover; no staging→prod pipeline is owned by the provider | Owner: name the target, its credentials holder and the rollback plan; the provider then prepares the run book |
| Network and Radar | **ACTIVE, bounded** | egress only through `bounded-http-client` with `ODG_RADAR_LIVE=1`; V16 grant (3 exact hosts + paths, 10 calls/run, expires 2026-12-21). Live run 1: 9 × 200, 1 redirect blocked; pinned in `COLLECTION_REGISTRY.json` | Owner: new hosts = a new versioned grant |
| Local models | **ACTIVE** | Ollama on loopback: `qwen2.5-coder:7b`, `qwen2.5-coder:3b`, `qwen2.5:0.5b` | — |
| External model providers | **NOT INVENTORIED** | not used by this campaign; no key was inspected | Owner: list the providers ODG may call, with spend limits |
| Storage, evidence, memory | **ACTIVE** | git-tracked evidence (`docs/odg/evidence/`); Truth Lock 928/928; provider memory directory | — |
| Observability | **ACTIVE (local)** | L0 trace (launcher-stamped), `mission-attempt-log`, SLI scripts; no external monitoring | — |
| Resources | **ACTIVE** | 8 CPU, 22 GiB RAM, 162 GiB free disk; observed safe concurrency is about 4–6 agents plus CI | — |
| Owner signatures and anchors | **PREPARED, NOT ACTIVE** | `TRUST_ANCHORS.json` and `OWNER_ALLOWED_SIGNERS` are empty; the anchor CI check detects but does not enforce | Owner: `V16_OWNER_REVIEW_PACKET.md` §1–§2 |

## Remaining V15 items

| Item | State |
|---|---|
| Gate | 10/12 on candidate `3a88de01`. Missing: an owner-signed review bound to that candidate. Packet ready |
| Confined drop-in | corrected (namespaces / netlink reset, `zz-` name). **Dry-run not performed** (provider refused by policy) |
| Radar live research | **DONE** (run 1) |
| SLO | working reference 98 % / 99 % / 95 %; **not enforced** |
| L1 | disabled; checklist in L1 dossier §4e |

## Not unlocked on purpose
The provider did not widen its own permissions. Changing `~/.claude/settings*.json` to grant itself `systemd`, `sudo` or deploy rights would be self-escalation. That change is the owner's act.
