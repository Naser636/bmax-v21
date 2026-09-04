# Phase 0 — Checkpoint Observations (PREPARATION ONLY)

Factual references only. No PROVEN claims. No repair performed. READ-ONLY pass.

## Git snapshot (observed)
- Branch: `runtime/mission-context-builder`
- HEAD: `8e4ec35a03313064b5857b2d2bd04a8cd5ba60c3`
- Working tree: CLEAN
- Recent HEAD subject: `fix(runtime): forbid mission completion until required capability proofs are produced`

## Release / checkpoint markers found
- Root: `RUNTIME_COMPLETION_CHECKPOINT.md` (in-progress reprise doc, French).
- `foundation/release.sh`, `docs/RELEASE_MANAGER_DESIGN_v1.md`.
- `runtime/releases/`: `20260724_003504`, `FINALIZE_RUNTIME_FOUNDATION_V1_20260724_003906`,
  `FINALIZE_RUNTIME_FOUNDATION_V1_20260724_004541`, `SECURE_20260724_021018`.
- Tags (release-ish): `runtime-certified-20260729-1610`, `runtime-v1.1-stable`,
  `runtime-v1-baseline`, `ODG_PROVIDER_V1_STABLE`, `architecture-freeze-v1`,
  `foundation-v1`, `foundation-v2`, `odg-runtime-v1.0`, `v1.0.0`.

## Version-marker evidence (component-level, not full trees)
- V3: certificates/reports `MISSION_INTERPRETER_V3(_B1..B5)`, `KNOWLEDGE_V3`,
  `IMPLEMENTATION_ENGINE_V3`, `PATCH_V3`, `DECISION_V3`; backup
  `runtime/backup/20260715_103938/runtime-executor.ts.before.v3`.
- V4: `KNOWLEDGE_V4` certificate/report; backup
  `runtime/backup/20260715_104529/runtime-executor.ts.before.v4`.
- Interpretation: V3/V4 appear as per-component iteration labels, NOT as distinct
  full generation trees. V4 = HISTORICAL until repository evidence proves otherwise.

## Ambiguities to resolve later
- No single authoritative RELEASED marker (checkpoint doc vs releases/ vs tags).
- Relationship of current HEAD to any release marker: UNKNOWN.
- Whether `src/runtime/*` (TS) and `runtime/core/*` (JS) represent parallel
  generations or one live + historical: per checkpoint doc, live path is
  `runtime/bin` → `runtime/core`; `src/runtime` reached only via tsx. To confirm in 0A.

## Do-not-touch (preserved, DR/history surfaces)
`runtime/backup`, `runtime/archive`, `runtime/local-recovery`, `runtime/releases`,
`runtime/baselines`, `runtime/generated`, `baseline/`. Report only; do not modify/delete.
