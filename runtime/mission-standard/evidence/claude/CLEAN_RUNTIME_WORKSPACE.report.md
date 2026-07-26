# CLEAN_RUNTIME_WORKSPACE — Report

Mission : CLEAN_RUNTIME_WORKSPACE
Mode : ENGINEERING
Status : DONE
Scanned : 2026-07-26
Branch : runtime/mission-context-builder
Head : 12391861f6caa4f9a787bd78c8554a828046dae7

## Summary

Deterministic scan of transient runtime workspace artifacts under `runtime/`.
Every candidate was verified `git check-ignore`-ignored **and** untracked before
it could be removed. No tracked or required artifact was deleted (`git diff
--name-status` reports zero tracked deletions). The workspace is now clean:
a post-cleanup rescan reports **0** safe-to-remove candidates and **0** blocked.

| Bucket | Count |
| --- | --- |
| Safe-to-remove (removed this run) | 2 |
| Required — preserved | 4 |
| Blocked (tracked/required, refused) | 0 |
| Safe-to-remove remaining after cleanup | 0 |

`runtime/generated/` disk footprint: **1.2M** after cleanup.

## Objective coverage

- **CLEAN_WORKSPACE_1** — `runtime/scripts/clean-runtime-workspace.js` produces a
  deterministic, rule-driven scan (fixed extension rules + a sorted top-level walk
  of `runtime/generated/`; no timestamps or randomness influence classification).
  Output: `CLEAN_RUNTIME_WORKSPACE-scan.json`.
- **CLEAN_WORKSPACE_2** — each candidate is asserted `git check-ignore`-ignored
  **and** not tracked before removal; any tracked or non-ignored path is demoted to
  `blocked` and refused. This run: blocked = 0, so every candidate was covered by
  the governance `/runtime/generated/` .gitignore policy. Required roots
  (`runtime/security`, `runtime/releases/SECURE_*`,
  `runtime/mission-standard/history`, `runtime/reports/archive`) were confirmed
  git-ignored and preserved.
- **CLEAN_WORKSPACE_3** — cleanup applied; the evidence JSON (clean-state rescan)
  and this report were generated. No tracked or required artifact was deleted.

## Removed (SAFE_TO_REMOVE) — stale scratch, git-ignored, regenerated on demand

- `runtime/generated/provider-skipped.txt` (provider dry-run diagnostic dump)
- `runtime/generated/runtime-failures.txt` (transient failure list)

Both are top-level scratch under the `/runtime/generated/` governance policy
(regenerated in-run and bootstrapped on cold start by
`runtime/bin/odg-bootstrap.js`).

## Preserved (REQUIRED — never removed)

- `runtime/security/` — disaster-recovery kernel backups (MUST persist on disk)
- `runtime/releases/SECURE_20260724_021018/` — release snapshot capture
- `runtime/mission-standard/history/` — append-only history ledger
- `runtime/reports/archive/` — timestamped report archive snapshots

Live runtime state (`mission-report.json`, `decision.json`, `runtime-state.json`,
`mission-ledger.json`, `project-context.json`, and the `execution/`, `fleet/`,
`llm/`, `provider-cache/`, `provider-trace/`, `reports/` subtrees) was left
untouched — the scanner walks only the top level of `runtime/generated/` and never
recurses into subtrees or touches `*.json` state.

## Safety guarantees

- Tracked roots that superficially look like backups/archives
  (`runtime/backup/`, `runtime/archive/`, tracked `runtime/releases/`) are NOT
  git-ignored and are therefore never classified as removable.
- Dry-run by default; `--apply` is required to remove. Idempotent — a second
  `--apply` reports safe = 0, removed = 0.

## Reproduce

```
node runtime/scripts/clean-runtime-workspace.js            # dry-run scan
node runtime/scripts/clean-runtime-workspace.js --apply    # remove safe set
```
