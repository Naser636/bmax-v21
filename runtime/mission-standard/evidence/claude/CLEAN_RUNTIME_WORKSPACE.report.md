# CLEAN_RUNTIME_WORKSPACE — Report

Mission : CLEAN_RUNTIME_WORKSPACE
Mode : ENGINEERING
Status : DONE
Scanned : 2026-07-25
Branch : runtime/mission-context-builder
Head : 8b0b90e7453a4973f62b80e742263049a79e379f

## Summary

Deterministic scan of transient runtime workspace artifacts under `runtime/`.
Every candidate was verified `git check-ignore`-ignored **and** untracked
before it could be removed. No tracked or required artifact was deleted.

| Bucket | Count |
| --- | --- |
| Safe-to-remove (removed) | 9 |
| Required — preserved | 4 |
| Blocked (tracked/required, refused) | 0 |

`runtime/generated/` disk footprint: **7.8M → 896K** after cleanup.

## Objective coverage

- **CLEAN_WORKSPACE_1** — `runtime/scripts/clean-runtime-workspace.js` produces a
  deterministic, rule-driven scan (fixed extension rules + sorted filesystem walk;
  no timestamps/randomness). Output: `CLEAN_RUNTIME_WORKSPACE-scan.json`.
- **CLEAN_WORKSPACE_2** — each candidate is asserted git-ignored and not tracked;
  any tracked/non-ignored path is demoted to PRESERVE and never removed.
  `git diff --name-status` confirms **zero tracked deletions**.
- **CLEAN_WORKSPACE_3** — cleanup applied; evidence JSON + this report generated.

## Removed (SAFE_TO_REMOVE) — stale scratch, git-ignored, regenerated on demand

- `runtime/generated/odg-roadmap-compile.txt` (7.2 MB compile dump)
- `runtime/generated/FINAL_VALIDATION_20260724_201800.md` (one-off dump)
- `runtime/generated/_rc_probe.ts` (scratch probe)
- `runtime/generated/eval-documentation-proof-gate.ts` (scratch eval)
- `runtime/generated/autonomy-run.log`, `autonomy-run2.log`
- `runtime/generated/health.log`, `status.log`, `verify.log`

All are under the `/runtime/generated/` governance policy (regenerated in-run and
bootstrapped on cold start by `runtime/bin/odg-bootstrap.js`).

## Preserved (REQUIRED — never removed)

- `runtime/security/` — disaster-recovery kernel backups (MUST persist on disk)
- `runtime/releases/SECURE_20260724_021018/` — release snapshot capture
- `runtime/mission-standard/history/` — append-only history ledger
- `runtime/reports/archive/` — timestamped report archive snapshots

Live runtime state (`mission-report.json`, `decision.json`, `runtime-state.json`,
`mission-ledger.json`, `project-context.json`, and the `fleet/`, `llm/`,
`provider-cache/`, `provider-trace/`, `reports/` subtrees) was left untouched.

## Reproduce

```
node runtime/scripts/clean-runtime-workspace.js            # dry-run scan
node runtime/scripts/clean-runtime-workspace.js --apply    # remove safe set
```
