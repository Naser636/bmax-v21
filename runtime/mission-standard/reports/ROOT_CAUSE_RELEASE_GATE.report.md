# ROOT_CAUSE_RELEASE_GATE — Diagnostic Report

**Provider Contract Version:** 1.0.0 · **Mode:** ENGINEERING · **Status:** DIAGNOSED
**Re-diagnosed against the current tree** — branch `runtime/mission-context-builder`,
HEAD `a861685` ("ODG: release AUTONOMOUS_EXECUTION_WITH_FALLBACK evidence").

> **Tree has drifted since the prior diagnosis (HEAD `798b3ac`, 23 tracked-modified files).**
> At this HEAD `git diff --quiet` exits **0** — the tracked tree is *transiently* clean because
> the most recent mission's bookkeeping churn was **committed** (see `a861685`). The structural
> defect is **not resolved**, only dormant: the four per-run bookkeeping directories are still
> **tracked** (184 `certificates/`, 184 `passports/`, 185 `reports/`, 183 `generated/` files)
> and still **not gitignored** (only `runtime/mission-standard/history/` is — `.gitignore:51`).
> The next mission run that regenerates certificates/passports re-dirties them and `git diff
> --quiet` exits 1 again, legitimately pinning `gitClean` red. The masking TEMP PATCH is also
> still active. All source line references below were re-checked against this HEAD and are exact.

## Verdict

The release decision is gated by a **single evidence gate: `gitClean`**. Every other gate is
green (`build:true`, `typescript:true`, `missionPipeline:true`, and `documentationProofPresent`
whenever the mission-scoped artifact exists). Two coupled defects surround `gitClean`:

1. **Structural (the real root cause):** the runtime writes **tracked** per-run bookkeeping under
   `runtime/mission-standard/` (`certificates/`, `passports/`, `reports/`, `generated/`). These
   are rewritten on every mission run, so `git diff --quiet` exits non-zero whenever a run has not
   yet been committed — legitimately pinning `gitClean` red and yielding `NO_RELEASE`. The tree is
   clean *right now* only because the last run's churn was committed; the mechanism is intact.
2. **Masking defect (currently active):** `runtime/bin/odg-verify.js` carries a
   `// TEMP PATCH: ignore global git cleanliness` that hardcodes `verify.gitClean=true`
   (lines 24-25). The emitted evidence (`runtime/generated/runtime-verify.json → gitClean:true`,
   `generatedAt 2026-07-26T00:26:07Z`, for the stale mission `RESOLVE_DOCUMENTATION_PROOF_PRESENT_GATE`)
   no longer reflects the tree. The gate is a **false positive**: it would certify `RELEASE` even
   on a genuinely dirty tree.

## OBJ-001 — Root cause

**Responsible component:** the `gitClean` evidence *producer + rule* (not the Release Manager's
decision logic, which is correct and does no I/O).

- **Blocking rule / decision authority:** `ReleaseManager.allGreen()` requires
  `gates.gitClean === true` — `src/core/release-manager.ts:373-381`; the gate is derived as
  `inputs.validation.gitClean === true` at `src/core/release-manager.ts:364`.
- **Evidence producer:** `runtime/bin/odg-verify.js`. Pre-patch it ran `git diff --quiet` and set
  `gitClean=false` on non-zero exit; the current file replaces that with a hardcoded
  `verify.gitClean=true` (the TEMP PATCH, lines 24-25).
- **Evidence relay:** `AutonomyRuntimeAdapter.gatherEvidence` reads
  `runtime/generated/runtime-verify.json` (constant `VERIFY`, `src/runtime/autonomy-runtime-adapter.ts:55`;
  read at `:500-511`) and copies `gitClean` through unchanged.
- **Gate consumer:** `RuntimeAutonomy.assembleReleaseInputs` (`src/core/runtime-autonomy.ts:278`,
  `gitClean: v.gitClean` at `:292`) → `ReleaseManager.decide` (`:232`).

**Underlying cause — a self-dirtying deadlock (state at HEAD `a861685`):**
1. `git diff --quiet` → exit **0** *now*; `git status --porcelain` shows only one untracked entry:
   `runtime/config/` (`provider-policy.json`, `runtime-mode.json`, both **not** gitignored).
2. This clean state is **transient**. The four bookkeeping directories are still tracked
   (`git ls-files` counts: certificates 184, passports 184, reports 185, generated 183) and still
   not gitignored. Certificate/passport writes are pure per-run churn (only the `Commit :` / `Date :`
   header lines change); `reports/` + `generated/` are the same class of regenerated artifact
   (rewritten with validation state). Any mission run that touches them flips `git diff --quiet`
   back to exit 1 and `gitClean` back to a legitimate red.
3. This is the **identical** deadlock already solved for two sibling directories:
   `/runtime/generated/` and `/runtime/mission-standard/history/` are gitignored (`.gitignore:45,51`)
   with a comment stating the exact rationale ("regenerated on EVERY mission run … tracking it
   permanently re-dirties the tree and pins the Release `gitClean` gate red"). The four
   `runtime/mission-standard/` artifact dirs were simply never added to that ignore set.
4. `RootCauseEngine.isBookkeeping` (`src/runtime/root-cause-engine.ts:406-411`) recognizes only
   `runtime/mission-standard/history/` and `history.md` as bookkeeping — it does **not** classify
   `certificates/`, `passports/`, `reports/`, or `generated/`, so the engine's own auto-remediation
   (`buildMinimalPatch`, `:415-436`) misses these offenders when they recur.
5. **New wrinkle at this HEAD:** the untracked `runtime/config/` does not trip the tracked-only
   `git diff --quiet` the verifier uses, but it *would* trip any `git status --porcelain` governance
   check (e.g. the MSE `[5/5]` gate, `runtime/mission-standard/bin/mse`). It should be committed or
   gitignored by its owner so it does not surface as a later false-dirty signal.

## OBJ-002 — Minimal patch (proposed, not applied)

The gate rule is correct; the fix is to stop tracking regenerated bookkeeping and make the evidence
honest again. Minimal, in order:

1. **Structural — remove the deadlock at its source.**
   Files to modify: `.gitignore` (repo root), plus untracking the regenerated artifacts.
   Add, mirroring the existing history/generated entries:
   ```
   /runtime/mission-standard/certificates/
   /runtime/mission-standard/passports/
   /runtime/mission-standard/reports/
   /runtime/mission-standard/generated/
   ```
   then `git rm --cached -r runtime/mission-standard/{certificates,passports,reports,generated}`
   (files stay on disk; non-destructive). After this, `git diff --quiet` stays 0 across runs and the
   churn never reappears in `git status --porcelain`.
2. **Restore evidence integrity.** File to modify: `runtime/bin/odg-verify.js`.
   Revert the TEMP PATCH (lines 24-25) to the real check:
   ```js
   try { cp.execSync("git diff --quiet"); } catch { verify.gitClean = false; }
   ```
   so `gitClean` again reflects the tree. **(1) and (2) must land together:** reverting (2) alone,
   before (1), makes `gitClean` honestly red the instant the next run regenerates the bookkeeping —
   re-introducing `NO_RELEASE`. (The tree being transiently clean at this HEAD does *not* make (2)
   safe in isolation; the very act of running this mission through the provider path regenerates the
   bookkeeping and re-dirties it.)
3. **Widen the diagnostician (defense-in-depth).** File to modify:
   `src/runtime/root-cause-engine.ts`. Extend `isBookkeeping` (and, transitively, `buildMinimalPatch`)
   to also match `runtime/mission-standard/{certificates,passports,reports,generated}/` so future
   recurrences are auto-classified and auto-remediated.
4. **Housekeeping.** Commit or gitignore the new untracked `runtime/config/` so it cannot later
   present as a false-dirty signal to porcelain-based governance gates.

**Why proposed, not applied** (the done_when requires proposal only):
- Step (1) requires editing `.gitignore` (repo root) — **outside this mission's AUTHORIZED_PATHS**
  (`src/core/**`, `src/runtime/**`, `runtime/**`) — plus `git rm --cached`, which stages an index
  change; the Runtime harness prohibits commits/staging.
- Step (2) is authorized (`runtime/**`) but is **unsafe in isolation**: without (1) it regresses the
  tree to a truthful red gate the moment the next run churns the bookkeeping. The two are atomic and
  belong to the Release Manager / Runtime owners as one change.
- The 700+ tracked bookkeeping files are pre-existing artifacts this provider did not author, so
  nothing is discarded here.

## OBJ-003 — Execution readiness

- **Provider Engineering ready:** `mode:ENGINEERING` (+ `requiresEngineering`) →
  `missionRequiresProvider()` returns true → the adapter routes to the Claude Engineering provider,
  and the pipeline reaches Stage 4 (evidence gathering) end-to-end.
- **Validation Engine ready:** `runtime/bin/odg-verify.js` runs `npm run build` + `npx tsc --noEmit`
  and writes `runtime/generated/runtime-verify.json`; the latest artifact records `build:true`,
  `typescript:true` (`generatedAt 2026-07-26T00:26:07Z`). `AutonomyRuntimeAdapter.gatherEvidence`
  (`src/runtime/autonomy-runtime-adapter.ts:500-511`) relays it to the Release Manager.
- **Documentation proof present:** the mission-scoped artifact
  `runtime/mission-standard/generated/ROOT_CAUSE_RELEASE_GATE.json` exists, so
  `documentationProofPresent` resolves true for this mission once the verifier resolves the mission.
- **Remaining owner action for an honest `RELEASE`:** once the proposed patch (steps 1+2) lands,
  `gitClean` is truthfully green and durable across runs, and all five gates are green → the Release
  Manager can decide `RELEASE` on honest evidence. Until then, any `RELEASE` rests on the TEMP-PATCH
  false positive.
