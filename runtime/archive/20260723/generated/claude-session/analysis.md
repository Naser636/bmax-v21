# Release-Gate STOP — Root-Cause Analysis

_Session: runtime/mission-context-builder · No repo re-audit; root cause was pre-isolated._

## Symptom

The autonomous loop halts at the release gate with:

```
STOP: Repository changed unexpectedly
Changes outside mission artifact directories:
?? runtime/missions/IMPLEMENT_RUNTIME_HEALTH_COMMAND.evidence.md
```

## The pipeline that produces it

1. **RootCauseEngine** (`src/runtime/root-cause-engine.ts`) emits a `correctiveMission`.
2. **Mission Loader** accepts a mission only as `runtime/missions/<MISSION>.json`
   (`src/runtime/autonomy-runtime-adapter.ts:170,345` — `${MISSIONS_DIR}/${mission}.json`).
   `runtime/missions/` is therefore the **mission INPUT directory**.
3. The **Provider** executes the mission and, per its contract ("Produce evidence, never claims" —
   `src/providers/provider-port.ts:279`), emits a per-mission evidence document at
   `runtime/missions/IMPLEMENT_RUNTIME_HEALTH_COMMAND.evidence.md`.
   This is the established convention — 7 sibling `*.evidence.md` files are already committed in
   `runtime/missions/` (e.g. `IMPLEMENT_ENGINEERING_PROVIDER.evidence.md`).
4. That freshly-written evidence file is **untracked**, so `git status --porcelain` reports it `??`.
5. The **release gate** is `runtime/mission-standard/bin/mse`, step **[5/5] GOVERNANCE** (line 135):

   ```bash
   UNEXPECTED_CHANGES=$(git status --porcelain -- "${ARTIFACT_EXCLUDES[@]}")
   if [ -n "$UNEXPECTED_CHANGES" ]; then
     echo "STOP: Repository changed unexpectedly"
   ```

   `ARTIFACT_EXCLUDES` (lines 14–20) whitelists only the engine's own [4/5] GENERATE outputs:
   `runtime/mission-standard/{generated,passports,reports,certificates,history}`.

## Root cause

The governance gate's Runtime-owned-output whitelist (`ARTIFACT_EXCLUDES`) was never taught about
the **Provider evidence artifact**. The evidence file is a legitimate, expected Runtime output, but
because it lands in `runtime/missions/` — a directory *outside* the whitelist — the gate classifies
it as "real source/business work" and stops.

It is **not** a Mission-Loader problem, not a Provider misbehaviour, and not stray source: it is a
gap between two components that were correct in isolation — the Provider writes evidence where the
convention already puts it; the gate simply never registered that path as an artifact.

The `odg-verify.js` `gitClean=true` TEMP PATCH (line 24-25) is unrelated to this STOP: it feeds the
Validation Engine, not the mse governance check. It only masks the *separate* clean-tree symptom
(see memory `root-cause-release-gate`), it does not gate the autonomous loop here.

## Decision among the four candidate fixes

| # | Candidate | Verdict |
|---|-----------|---------|
| 1 | Generate evidence elsewhere | Rejected — breaks the existing convention (7 committed siblings), and the AI Provider's write location cannot be deterministically forced; larger, riskier change. |
| 2 | `.gitignore` the evidence files | Rejected — evidence must stay **auditable/committable** (it already is, historically). gitignore also does nothing for already-tracked files and hides genuine artifacts from history. |
| 3 | **Register evidence as a mission artifact** | **Chosen** — smallest change, matches the gate's own design intent ("paths the Runtime writes itself"), keeps evidence auditable, and is scoped so mission INPUT contracts stay governed. |
| 4 | Other integration point | Not needed — the gate already has a single-source-of-truth artifact whitelist; the fix is one entry in it. |

## Why the scope is safe

The exclude is `:(exclude)runtime/missions/*.evidence.md` — scoped to the evidence files only, **not**
the whole `runtime/missions/` directory. Verified empirically:

- untracked `<MISSION>.evidence.md` → excluded (gate passes);
- stray `runtime/missions/<MISSION>.json` (Mission-Loader input contract) → **still reported**;
- stray `src/**` edit → **still reported**.

The Mission Loader is untouched and not bypassed; the Runtime is not redesigned.
