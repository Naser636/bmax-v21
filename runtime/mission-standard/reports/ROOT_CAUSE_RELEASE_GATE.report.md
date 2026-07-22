# ROOT_CAUSE_RELEASE_GATE — Diagnostic Report

**Provider Contract Version:** 1.0.0 · **Mode:** ENGINEERING · **Status:** DIAGNOSED

## Verdict

`NO_RELEASE` is produced by a **single red release gate: `gitClean`**. Every other
gate is green (`build:true`, `typescript:true`, `missionPipeline:true`,
`documentationProofPresent` when an artifact exists). `gitClean` is `false` because
the **tracked** bookkeeping file `runtime/mission-standard/history/history.md` is
modified in the working tree.

## OBJ-001 — Root cause

**Responsible component:** the `gitClean` evidence gate.
- Decision authority / blocking rule: `ReleaseManager.allGreen()` —
  `src/core/release-manager.ts:373-381` — requires `gates.gitClean === true`.
- Evidence producer: `runtime/bin/odg-verify.js` runs `git diff --quiet` and sets
  `gitClean=false` on non-zero exit.
- Evidence relay: `AutonomyRuntimeAdapter.gatherEvidence` (`src/runtime/autonomy-runtime-adapter.ts:337`)
  reads `runtime/generated/runtime-verify.json` and copies `gitClean` through unchanged.
- Gate consumer: `RuntimeAutonomy.assembleReleaseInputs` → `ReleaseManager.decide`
  (`src/core/runtime-autonomy.ts:278`, `:232`).

**Causal chain (all steps evidenced):**
1. `git diff --quiet` → exit **1** (tracked change present).
2. `git diff --quiet -- ':(exclude)runtime/mission-standard/history/history.md'` → exit **0**
   ⇒ `history.md` is the **sole** tracked modification tripping the check.
3. `runtime/generated/runtime-verify.json` = `{build:true, typescript:true, gitClean:false}`
   (freshly reproduced at `2026-07-22T12:54:42Z`).
4. `gatherEvidence` → `validation.gitClean:false` → `allGreen()` false → **NO_RELEASE**.

The 32 untracked files (`??`) do **not** affect `git diff --quiet` and are all within
this mission's `authorizedPaths` (`runtime/**`), so they trip neither `gitClean` nor the
provider scope check.

## OBJ-002 — Minimal patch (proposed)

The gate itself is correct; the tree is dirty because the runtime's own per-run ledger
is a **tracked** file. Three options, minimal first:

1. **Operational (no code change) — immediate unblock.** Files: `history.md`.
   `git checkout -- runtime/mission-standard/history/history.md` (or commit it) →
   `git diff --quiet` exits 0 → `gitClean:true`.
2. **Structural (recommended) — remove the deadlock.** Files: `.gitignore`.
   Untrack the regenerated ledger, mirroring the already-ignored `runtime/generated/`:
   `git rm --cached runtime/mission-standard/history/history.md` and add it to `.gitignore`.
3. **Surgical.** Files: `runtime/bin/odg-verify.js`. Exclude churned bookkeeping from the
   check: `git diff --quiet -- ':(exclude)runtime/mission-standard/history/history.md'`.

Per the done_when the patch is **proposed, not applied**: altering the release gate is a
Release-Manager-owned policy decision, and `history.md` is pre-existing bookkeeping this
provider did not author, so it is not discarded here.

## OBJ-003 — Execution readiness

- **Provider Engineering ready:** `requiresEngineering:true` + `mode:ENGINEERING` →
  `missionRequiresProvider()` (`src/providers/provider-port.ts:261`) returns true →
  `AutonomyRuntimeAdapter.runPipeline` routes to `createClaudeProvider`.
- **Validation Engine ready:** `runtime/bin/odg-verify.js` ran end-to-end and wrote
  `runtime-verify.json`; the Validation Engine can verify the result — only `gitClean`
  is red, and it flips green the moment the tree is clean.
