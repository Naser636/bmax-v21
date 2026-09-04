# Phase 0 — Audit Index (PREPARATION ONLY)

Status vocabulary: PRESENT | UNKNOWN | CONFLICTED. No PROVEN claims. No completion %.

## Repository
- Repository root: `/home/ubuntu/bmax-v21` — PRESENT
- Current branch: `runtime/mission-context-builder`
- Current HEAD: `8e4ec35a03313064b5857b2d2bd04a8cd5ba60c3`
- Working tree state: CLEAN (`git status --porcelain` empty)

## Generation / tree presence
No literal `V1/`, `V2/`, `V3/`, `V4/` directory trees exist. Generations are
expressed as git tags, baseline snapshots, and component-level version markers.

- V1 — PRESENT (as tags/baselines): tags `v1.0.0`, `runtime-v1-baseline`,
  `runtime-v1.1-stable`, `foundation-v1`, `odg-runtime-v1.0`, `ODG_PROVIDER_V1_STABLE`.
- V2 — PRESENT (as tags/baseline): `baseline/foundation-v2`, tags `foundation-v2`,
  `v2-sprint-3..11`.
- V3 — CONFLICTED: no tree/tag; only component certificates/reports
  (`MISSION_INTERPRETER_V3`, `KNOWLEDGE_V3`, `IMPLEMENTATION_ENGINE_V3`, etc.)
  and a backup `runtime-executor.ts.before.v3`. Component-level, not a full tree.
- V4 — CONFLICTED (HISTORICAL until proven otherwise): no tree/tag; only
  `KNOWLEDGE_V4` certificate/report and backup `runtime-executor.ts.before.v4`.
  Recorded as an implementation-history surface requiring later reconciliation.
  NOT assumed current; NOT to be discarded.
- Current runtime — PRESENT: `runtime/` (bin, core, missions, releases, …) plus
  `src/runtime/`. Per RUNTIME_COMPLETION_CHECKPOINT.md the live CLI path is
  `runtime/bin/*` → `runtime/core/*.js`.

## Supporting surfaces (PRESENT)
- `foundation/` (bootstrap/verify/release/repair scripts)
- `factory/` (contracts, generators, manifests, prefabs, templates)
- `.runtime-patches` at `runtime/local-recovery/.runtime-patches`
- `baseline/` (`foundation-v2`, `sprint12`, `sprint12.tar.gz`)
- `src/` (app, contracts, core, engine, providers, runtime, tests)
- `scripts/`, `docs/`

## Likely RELEASED checkpoint
UNKNOWN / CONFLICTED. Newest ≠ released; multiple candidate markers, none
authoritative on inspection:
- `RUNTIME_COMPLETION_CHECKPOINT.md` (root) — describes in-progress work on the
  current branch, not a release stamp.
- Tags: `runtime-certified-20260729-1610`, `runtime-v1.1-stable`,
  `ODG_PROVIDER_V1_STABLE`, `architecture-freeze-v1`.
- `runtime/releases/` snapshots incl. `SECURE_20260724_021018`,
  `FINALIZE_RUNTIME_FOUNDATION_V1_*`.

## Unresolved checkpoint question
Which single marker (tag vs `runtime/releases/*` snapshot vs
RUNTIME_COMPLETION_CHECKPOINT.md) is the authoritative last RELEASED state, and
whether current HEAD is at/ahead of/divergent from it. UNKNOWN.

## Recommended next narrow audit scope (Phase 0A)
1. `RUNTIME_COMPLETION_CHECKPOINT.md` (full) + `runtime/releases/` manifest.
2. Reconcile release tags to commits: `git tag` ↔ `git log` for the candidates above.
3. `runtime/bin/` + `runtime/core/` live-path entrypoints only (identify current runtime authoritatively).
4. Locate V3/V4 component sources (not just certificates) to classify as historical vs live.
