# 49-Scene Shot-List — La Porte du Soleil (PREP; prompts/plans, NOT media) — 2026-10-24

Artifact: `pipeline/shot-list.json` (generator `pipeline/build-shotlist.mjs`, checks `pipeline/shotlist-check.mjs`
— both reproducible, offline, zero-cost). Derived from F7 (`25`); **F7 unchanged** (no concrete defect). These are
PLANS: proposed prompts + shot specs, **no media generated**.

## Coverage
- **49 scenes → 416 shots.** Every scene SC01–SC49 covered; unique shot ids (SCnn-SHkk); each shot traces to its
  source scene. Checks: **18/18 PASS** (+ pipeline 26/26, cross-artifact consistency 11/11).
- Per-shot fields (all present on every shot): id · scene · act · dramaticFunction · shotType · movement ·
  subjectAction · setting · era · palette · continuityRefs · targetSec · mediaCategory · proposedPrompt ·
  acceptanceCriteria · rejectionReason · costEurEstimated · costUnit · costStatus · refusalRule · status.

## Media categories (stills are NOT finished video)
| Category | Shots | Alloc (EST) |
|---|--:|--:|
| PREMIUM_VIDEO (motion is the point) | 62 | €248 |
| STILL_ANIMATABLE (AI still + controlled motion) | 195 | €68.25 |
| AUDIO_LINE (one per the 140 dialogue lines) | 140 | €70 |
| MUSIC_CUE (per-scene scoring need; ~7–9 actual tracks, `27`) | 19 | €57 |
| **Total generation-credit allocation** | **416** | **€443.25** |

## References — explicit dependencies, none invented
**28 references TO_CREATE** (12 characters + 16 locations). No shot links to an existing visual reference (none
exist yet); every ref is tagged `TO_CREATE` + "reference sheet not yet generated". Reference-sheet creation is the
first production step once `12` is authorized.

## Budget reconciliation (allocation ≠ commitment ≠ spend)
- Shot-list **allocatedEstimate €443.25** = the GENERATION-CREDIT component (gens for video/stills/audio-lines/
  music). It is a **component** of the fuller production budget (`09`/`14`, ~€1,144 incl. subscriptions €360 +
  voice-minutes + reserve). Both are **ESTIMATES**; committed €0, spent €0, remaining €4,000.
- Every shot carries a **pre-spend refusal rule** (BudgetLedger refuses any generation crossing €4,000 *before*
  it runs). Nothing is committed or spent.

## Honest status
Shot-list = exploitable PRE-PRODUCTION plan for all 49 scenes, traceable and gate-ready. **No media produced; all
shots PLANNED.** Film is declared done only after real generation → edit → sound → export → verified 60:00 within
€4,000 (`exportDurationGate` enforces; currently fail-closed, no file). Production of any shot needs the `12`
authorization (≤€350 benchmark + ffmpeg); until then all shot-list work stays prep.
