# Offline Verification + Reproducible Benchmark Protocol — 2026-10-24 (no spend/install)

## A. Cross-artifact consistency (campaign §1–§3) — PASS 11/11
Verifier: `pipeline/consistency-check.mjs` (reproducible). Confirms:
- Scene counts agree: **F7 49 = ledger 49 = timing 49.**
- **Every scene traceable** to a 1:1 ledger entry (SC01…SC49).
- Set-piece coherence: ledger video (14) ⊆ timing floored (16) [floors = documented superset]; prep's "8 major
  sequences = 14 video scenes" reconciled.
- **Estimates never labeled measured:** €1,144 tagged PLAUSIBLE/ESTIMATE; runtime stated as estimate/range, not
  a validated cut.
- Budget: ledger cap €4,000, spent €0.
- Continuity: all 12 speaking characters present in the prep locked-register.
- Rights: no asset falsely marked licence-cleared (all PLANNED).
- **No false production:** no artifact claims a produced/exported 60:00 film; edit-plan states 60:00 is
  edit-measured, not yet true.

## B. Strengthened offline test harness (campaign §3) — pipeline PASS 26/26
Added `exportDurationGate` (fail-closed): a film is "done" ONLY with a real file at 60:00±2:00. It correctly
**refuses on our current reality (no file)** — structurally preventing any false "film produced" claim. Full
guard set now covered + tested:
- missing shot / empty scene → `editPlanCheck` flags it;
- cost over €4,000 → `BudgetLedger` refuses the crossing spend;
- missing continuity reference → `continuityCheck` flags un-introduced/no-ref characters;
- unverified rights → `rightsReleaseCheck` blocks non-ownership-clear / AI-undisclosed assets;
- export not exactly 60:00 or no real file → `exportDurationGate` fail-closed.

## C. What can be prepared/tested WITHOUT paid service or privileged install (campaign §5)
PREPARABLE/TESTED NOW (done): screenplay, matrix, scene-timing, edit plan, shot inventory, continuity register,
audio needs list, schedule, rights checklist, budget model, seeded ledger, all gates + consistency (offline).
REQUIRES `12` (paid/install): image/video/voice/music generation, ffmpeg/DaVinci edit-export — i.e. any step that
produces a real frame or second of media. No part of real media production is executable offline.

## D. Reproducible benchmark protocol (campaign §4) — PREPARED, NOT RUN (needs `12`)
**Goal:** measure real usable-yield, continuity, cost/min and quality on ONE representative sequence before any
full-production spend. **Target sequence:** the ~60s opening (storm→seam→two-sun shore), scenes 1–4 + 18B-style
staging — it exercises character continuity across shots, the hero VFX, a line of dialogue+voice+lip-sync, a cut,
color, subtitle, export.
**Success criteria (set BEFORE running):** face-identity ≥4/5 across ≥4 shots; no costume/proportion drift;
lip-sync within tolerance; no hard continuity break; clean 1080p+ export with burned subtitle; a measurement log.
**Quality/cost/yield comparison:** record per shot — tool, attempts-to-usable (yield), credits, seconds of
usable footage, continuity failures; compute **cost per usable finished second** and extrapolate to 60 min;
compare ≥2 video tools on the SAME shot (e.g., Runway vs Veo) for quality-per-euro.
**HARD CEILING + IMMEDIATE STOP:** total benchmark spend **≤ €350**, enforced by `BudgetLedger(350)` — any
generation that would cross €350 is REFUSED before it runs (not after). If a criterion fails, stop, classify the
defect, and report — do not keep spending.
**Reproducibility:** fixed prompts + seeds + reference sheets recorded in the shot-ledger; the run is replayable
from the ledger.
**Dry-run (offline) check available now:** the benchmark's budget logic + acceptance gates + export gate are all
unit-tested (26/26); only the paid generation is blocked.

## E. Blocking authorization (exact, unchanged)
**`12`: approve ≤ €350** one-month benchmark stack (Runway Pro + Midjourney + ElevenLabs + Suno) **+ authorize a
local ffmpeg install.** Max exposure €350; immediate stop on criterion-fail or €350. The €4,000 cap is NOT spend
authorization.
