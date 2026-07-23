# Minimal Patch Plan

## Change 1 — register the evidence artifact in the governance whitelist

**File:** `runtime/mission-standard/bin/mse`

Add one entry to the single-source-of-truth `ARTIFACT_EXCLUDES` array (used by both the [1/5]
pre-flight and the [5/5] governance check), plus a comment explaining the scope:

```diff
 ARTIFACT_EXCLUDES=(
   ':(exclude)runtime/mission-standard/generated'
   ':(exclude)runtime/mission-standard/passports'
   ':(exclude)runtime/mission-standard/reports'
   ':(exclude)runtime/mission-standard/certificates'
   ':(exclude)runtime/mission-standard/history'
+  ':(exclude)runtime/missions/*.evidence.md'
 )
```

- Scoped to `*.evidence.md` — mission INPUT contracts (`runtime/missions/*.json`) stay governed.
- Applies to both the pre-flight (`git diff`, tracked) and governance (`git status --porcelain`,
  incl. untracked) uses — desirable: successive missions chain without a prior evidence file
  blocking, and the freshly-written evidence file no longer trips the STOP.
- Pathspec verified: `git status --porcelain -- ':(exclude)runtime/missions/*.evidence.md'` filters
  the evidence file but leaves stray `.json`/source files reported.

## Change 2 — regression test

**File:** `src/tests/mse-governance-gate.test.ts` (new)

Parses `ARTIFACT_EXCLUDES` out of the real `mse` script and replays the exact `[5/5]` governance
pathspec against a throwaway git repo. Asserts:

1. an untracked `<MISSION>.evidence.md` is ignored (no false STOP);
2. a stray source edit is still reported;
3. an untracked evidence file stays excluded even alongside other changes;
4. a stray mission-contract `.json` is still reported.

Run: `npx tsx src/tests/mse-governance-gate.test.ts` → `MSE governance gate OK` (exit 0).

## Explicitly NOT done (scope discipline)

- Mission Loader untouched / not bypassed.
- Provider write behaviour unchanged.
- `odg-verify.js` `gitClean` TEMP PATCH left as-is (separate, pre-existing issue).
- No `.gitignore` change (evidence stays auditable/committable).
- Optional, deferred: also surfacing the evidence file as a `ReleaseArtifactRef` in
  `autonomy-runtime-adapter.ts:collectArtifacts` so the Release Manager counts it in the evidence
  set. Not required to clear the STOP; would widen the diff. Recorded as a follow-up only.

## No commit performed.
