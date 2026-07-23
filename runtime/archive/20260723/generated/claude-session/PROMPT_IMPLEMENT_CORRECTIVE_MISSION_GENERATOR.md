# ODG Runtime — Targeted Engineering Mission

## Context

The investigation is complete.

Do NOT perform another repository audit.

The architecture problem has already been isolated.

Current behavior:

1.
RootCauseEngine builds a correctiveMission.

Evidence:
src/runtime/root-cause-engine.ts

2.
It writes:
runtime/generated/corrective-mission.json

3.
Mission Loader refuses any mission unless a real contract exists in:

runtime/missions/<MISSION>.json

Evidence:
runtime/core/mission-loader.js

Therefore the Runtime reaches:

Root Cause
→ correctiveMission
→ runtime/generated/corrective-mission.json
→ DEAD END

Mission Loader expects:

runtime/missions/<MISSION>.json

There is no bridge.

------------------------------------------------

## Your mission

Determine where the architecture should connect these two components.

Do NOT redesign the Runtime.

Do NOT change the Mission philosophy.

Do NOT bypass Mission Loader.

Implement only the minimal industrial patch.

------------------------------------------------

## Expected deliverables

1.
Root Cause

2.
Architecture explanation

3.
Minimal patch

4.
Modified files

5.
Tests executed

6.
Remaining risks

------------------------------------------------

## Constraints

Patch minimal.

No refactoring.

No new architecture.

No fake mission.

No temporary workaround.

No commit.

------------------------------------------------

## IMPORTANT

Everything you produce must also be continuously written into:

runtime/generated/claude-session/

Create/update at least:

analysis.md
patch-plan.md
modified-files.txt
progress.log

Flush every meaningful step so that if execution stops because credits expire, no work is lost.

