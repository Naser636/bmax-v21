# Format Selection + Re-engineered Pipeline under €4,000 — ODG_FILM_FACTORY_V1

> **CORRECTION (CTO override V3):** the **mandated deliverable is a 60-MINUTE FILM**, not a short. The ~10–12 min
> "short" below is **an INTERNAL BENCHMARK/validation milestone only — NOT the deliverable** and must never be
> presented as the final film. The analysis below is retained as the *quality-style-under-cap* study; the
> authoritative 60-minute production plan is `14_PRODUCTION_PLAN_60MIN.md`. See `14` for the honest feasibility
> finding (60 min + €4k is reachable only as a stylized aesthetic; full photoreal 60 min = €17k–41k, over cap).

Hard ceiling **€4,000 all-in**. Goal: maximum cinematic quality that clears the gate under the cap. The prior
€14k–45k full-feature proposal is RETIRED as the recommendation. Figures PROVISIONAL until the benchmark (`12`).

## A. Format comparison under €4,000
| Option | Scenes/Shots | Premium video gens (≈3–8/usable) | Editorial load | Est. total cost @ quality gate | Verdict |
|---|---|---|---|---|---|
| **A. Polished 8–15 min short** | ~8–12 / **~90–140 shots** | ~40 hero-motion shots → ~160–320 gens | weeks (1 editor) | **€1,400–2,600** | **SELECTED** — only option that clears a professional gate with margin under €4k |
| B. 20–30 min | ~20 / ~250–350 shots | ~120 → 400–900 gens | high | €3,500–7,000+ | at/over cap; quality risk |
| C. 45–60 min | ~40+ / ~500+ shots | ~250+ → 1,500–4,000 gens | months | €14k–45k (benchmark-range) | **INFEASIBLE at the quality gate under €4k** |

**Evidence for rejecting C under €4k:** at the sourced $315–750/finished-minute benchmark, 45–60 min alone is
$14k–45k — 4–11× the ceiling; cutting quality to fit would fail the professional gate the CTO set. Honest: the
requested feature cannot meet the quality criteria within €4,000.

## B. Benchmark milestone (NOT the deliverable): the ~60s opening / ~10–12 min story
The screenplay `07` and the 60s opening are **internal validation artifacts** used to de-risk the 60-minute film
(`14`), not the final deliverable. They concentrate testing into a few representative shots before any scale
production. The mandated deliverable remains the **60-minute film**.

## C. Re-engineered cost-efficient premium pipeline (quality where it shows, cheap where it doesn't)
1. **Script/scene optimization BEFORE any generation** (ODG-native, €0): lock the shot list; cut any shot that
   doesn't earn premium motion.
2. **Character/world reference sheets** (Midjourney V8.2 Edit): lock faces/wardrobe/props/palette ONCE; reuse as
   references everywhere → continuity + fewer retakes.
3. **Still-first previsualization** (AI stills, cheap): compose + time the whole short as an animatic from stills
   before spending a single video credit.
4. **Low-cost drafts → premium only on approved shots:** generate cheap/low-res drafts for composition/timing;
   spend premium video credits ONLY on shots where motion materially improves the film (hero VFX: water→seam,
   the surge, the seal). **~60–70% of shots stay as still-image cinematography** (controlled push-ins/parallax/
   compositing) — professional-looking at a fraction of video-credit cost.
5. **Shot-level acceptance gates** (ODG-native, extend `validation-engine`): a shot must pass continuity + quality
   before any dependent shot generates → no contamination, no wasted credits downstream.
6. **Asset reuse + prompt versioning + cost tracking + failure classification** (ODG-native, extend ledger +
   `self-diagnostic`): bounded targeted retries on only the failed shot, never a scene restart.
7. **Batch + safe parallel** generation of independent shots.
8. **Open-source post** (DaVinci Resolve free + ffmpeg): edit, color, mix, subtitles, master at €0 software cost.
9. **Selective premium audio:** ElevenLabs voices + Suno score within subscription credits; SFX from library/gen.

**Trade-off principle:** premium video is reserved for the ~3–5 shots where motion is the point; everything else
uses still-image cinematography + sound + edit to reach quality cheaply. Each technique's quality/cost is to be
measured in the benchmark, not assumed.

## D. Native vs external (honest)
ODG-native (reuse proven spine): shot/asset ledger, prompt versioning, acceptance gates, defect classification,
budget/credit accounting, provenance/rights register, the previs orchestration, the edit/export automation
scripting. **External (generation):** all image/video/voice/music. **Human:** creative acceptance + final QC.
