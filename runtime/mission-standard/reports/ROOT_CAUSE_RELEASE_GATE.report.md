# ROOT_CAUSE_RELEASE_GATE — Diagnostic Report

**Provider Contract Version:** 1.0.0 · **Mode:** ENGINEERING · **Status:** DIAGNOSED
**Re-diagnosed against current tree** (branch `runtime/mission-context-builder`, HEAD `798b3ac`).
Re-verified 2026-07-23 at HEAD `798b3ac`: the intervening commit `798b3ac`
("whitelist mission-standard evidence artifacts") touches only `runtime/mission-standard/bin/mse`
and does **not** alter the deadlock — `git diff --quiet` still exits 1 over the same 23 tracked
files, and excluding the four bookkeeping dirs still exits 0. All source line references below
were re-checked against this HEAD and remain exact.

## Verdict

The release decision is gated by a **single evidence gate: `gitClean`**. Every other
gate is green (`build:true`, `typescript:true`, `missionPipeline:true`,
`documentationProofPresent` when an artifact exists). Two coupled defects surround it:

1. **Structural (the real root cause):** the runtime writes **tracked** per-run
   bookkeeping under `runtime/mission-standard/`. `git diff --quiet` therefore always
   exits non-zero, which legitimately pins `gitClean` red and yields `NO_RELEASE`.
2. **Masking defect (currently active):** `runtime/bin/odg-verify.js` carries a
   `// TEMP PATCH: ignore global git cleanliness` that hardcodes `verify.gitClean=true`,
   so the emitted evidence (`runtime/generated/runtime-verify.json` → `gitClean:true`)
   no longer reflects the tree. The gate is presently a **false positive**: it would
   certify `RELEASE` even on a genuinely dirty tree.

## OBJ-001 — Root cause

**Responsible component:** the `gitClean` evidence gate (producer + rule), not the
Release Manager's decision logic, which is correct.

- **Blocking rule / decision authority:** `ReleaseManager.allGreen()` requires
  `gates.gitClean === true` — `src/core/release-manager.ts:373-381`; the gate is
  evaluated as `inputs.validation.gitClean === true` at `src/core/release-manager.ts:364`.
- **Evidence producer:** `runtime/bin/odg-verify.js` — pre-patch it ran `git diff --quiet`
  and set `gitClean=false` on non-zero exit (`odg-verify.js.pre_patch`); the current file
  replaces that with a hardcoded `verify.gitClean=true` (the TEMP PATCH, lines 24-25).
- **Evidence relay:** `AutonomyRuntimeAdapter.gatherEvidence`
  (`src/runtime/autonomy-runtime-adapter.ts`, reads `runtime/generated/runtime-verify.json`
  at line 53) and copies `gitClean` through unchanged.
- **Gate consumer:** `RuntimeAutonomy.assembleReleaseInputs` → `ReleaseManager.decide`
  (`src/core/runtime-autonomy.ts`).

**Underlying cause — a self-dirtying deadlock, evidenced against the current tree:**
1. `git diff --quiet` → exit **1**; `git diff --name-only` lists **23 tracked files**:
   10 under `runtime/mission-standard/certificates/`, 10 under
   `runtime/mission-standard/passports/`, 2 under `runtime/mission-standard/reports/`,
   1 under `runtime/mission-standard/generated/`.
2. The certificate/passport diffs are pure per-run churn — only the `Commit :` and
   `Date :` header lines change (e.g. `MISSION_CONTEXT_BUILDER.certificate.md`:
   `Commit e22c10e→a835750`, `Date 2026-07-22…→2026-07-23…`). These 20 files are
   rewritten on **every** mission run. The `reports/` + `generated/` entries are the
   same class of regenerated artifact (the pipeline rewrites them with validation state,
   e.g. adding `Validated : true` / `"validated":true`).
3. **Proof the churn is the sole cause:** excluding those four directories,
   `git diff --quiet -- . ':(exclude)…certificates' ':(exclude)…passports'
   ':(exclude)…reports' ':(exclude)…generated'` exits **0** — the rest of the tree is
   clean.
4. This is the **identical** class of deadlock already solved for two sibling directories:
   `/runtime/generated/` and `/runtime/mission-standard/history/` are both gitignored
   (`.gitignore:45,51`), with a comment stating the exact rationale ("regenerated on
   EVERY mission run … tracking it permanently re-dirties the tree and pins the Release
   `gitClean` gate red"). The four `runtime/mission-standard/` artifact dirs above were
   simply never added to that ignore set.
5. `RootCauseEngine.isBookkeeping` (`src/runtime/root-cause-engine.ts:406-411`) recognizes
   only `runtime/mission-standard/history/` and `history.md` as bookkeeping — it does
   **not** classify `certificates/`, `passports/`, `reports/`, or `generated/`, so the
   engine's own auto-remediation misses today's offenders.

## OBJ-002 — Minimal patch (proposed, not applied)

The gate rule is correct; the fix is to stop tracking regenerated bookkeeping and to make
the evidence honest again. Minimal, in order:

1. **Structural (recommended) — remove the deadlock at its source.**
   Files to modify: `.gitignore`, plus untracking the regenerated artifacts.
   Add, mirroring the existing history/generated entries:
   ```
   /runtime/mission-standard/certificates/
   /runtime/mission-standard/passports/
   /runtime/mission-standard/reports/
   /runtime/mission-standard/generated/
   ```
   then `git rm --cached -r runtime/mission-standard/{certificates,passports,reports,generated}`
   (files stay on disk, non-destructive). After this, `git diff --quiet` exits 0 and the
   untracked churn no longer appears in `git status --porcelain` either.
2. **Restore evidence integrity.** File to modify: `runtime/bin/odg-verify.js`.
   Revert the TEMP PATCH (lines 24-25) to the real check (`odg-verify.js.pre_patch`):
   ```js
   try { cp.execSync("git diff --quiet"); } catch { verify.gitClean = false; }
   ```
   so `gitClean` again reflects the tree — legitimately green once (1) lands, instead of
   force-true. **These two must land together**: reverting (2) alone (without (1)) would
   flip `gitClean` honestly red and re-introduce `NO_RELEASE`.
3. **Widen the diagnostician (defense-in-depth).** File to modify:
   `src/runtime/root-cause-engine.ts`. Extend `isBookkeeping` to also match
   `runtime/mission-standard/{certificates,passports,reports,generated}/` so future
   recurrences are auto-classified and auto-remediated.

**Why proposed, not applied** (satisfies the done_when, which requires proposal only):
- Step (1) requires editing `.gitignore` (repo root) — **outside this mission's
  AUTHORIZED_PATHS** (`src/core/**`, `src/runtime/**`, `runtime/**`) — plus
  `git rm --cached`, which stages an index change; the Runtime harness prohibits commits.
- Step (2) is authorized (`runtime/**`) but is **unsafe in isolation**: without (1) it
  regresses the tree to a truthful red gate. The two are atomic and belong to the Release
  Manager / Runtime owners as one change.
- The 23 modified bookkeeping files are pre-existing artifacts this provider did not
  author, so nothing is discarded here.

## OBJ-003 — Execution readiness

- **Provider Engineering ready:** `mode:ENGINEERING` (+ `requiresEngineering`) →
  `missionRequiresProvider()` (`src/providers/provider-port.ts:261`) returns true → the
  adapter routes to the Claude Engineering provider. The pipeline reaches Stage 4
  (evidence gathering) end-to-end.
- **Validation Engine ready:** `runtime/bin/odg-verify.js` runs `npm run build` +
  `npx tsc --noEmit` and writes `runtime/generated/runtime-verify.json`
  (`build:true, typescript:true`); `AutonomyRuntimeAdapter.gatherEvidence` relays it
  (`src/runtime/autonomy-runtime-adapter.ts:53`). Once the proposed patch lands,
  `gitClean` flips green truthfully and all five gates are green → the Release Manager can
  decide `RELEASE` on honest evidence.
