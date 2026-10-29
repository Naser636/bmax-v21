# Evidence-Based Capability Map — ODG_FILM_FACTORY_V1 (addendum §2 taxonomy)

Grades: AVAILABLE_AND_PROVEN · AVAILABLE_BUT_UNPROVEN · PARTIALLY_IMPLEMENTED · MISSING ·
BLOCKED_BY_ACCESS_OR_AUTHORIZATION · EXTERNAL_SERVICE_REQUIRED. Evidence = reproducible probe/test.

## Inspection of ODG's OWN stack (not assumed from zero)
- Executors (11): Clean Workspace, Connectivity Audit, Decision Precedent, External Research, Governed Bash,
  Governed Git, Governed Observability, Implement Via Local Provider, ODG Spec Author, ODG Synthetic Deliverable,
  Provider Activation — **none media**. No media probe; no media entry in the operational capability register;
  **no film/media module** in `runtime/core`. (Evidence: greps, 2026-10-24.)
- **Reusable spine (PROVEN):** `evidence-provenance` (sha256+sourceCommit), `validation-engine`,
  `self-diagnostic` → asset/shot provenance + acceptance-gate logic can be built on these, not from scratch.
- Environment: ffmpeg/imagemagick/PIL/moviepy/canvas absent; **sharp present**; **no GPU**; no media API keys.

## Capability map
| Capability | Grade | Evidence | Reuse? |
|---|---|---|---|
| Story/structure/dialogue/bible/shot-list (text) | **AVAILABLE_AND_PROVEN** | Cinema probe 24/24 + film-design 15/15 structural checks (reproducible) | ODG Spec Author + Local Provider |
| Asset/shot tracking + provenance + acceptance gates | **PARTIALLY_IMPLEMENTED** | evidence-provenance/validation-engine proven for text; not yet wired to media assets | yes — extend existing |
| AV quality-control logic | **PARTIALLY_IMPLEMENTED** | deterministic text QC proven; media-CV QC absent | partial |
| Still-image processing (existing images) | **PARTIALLY_IMPLEMENTED** | `sharp` present (resize/composite) — cannot generate | limited |
| Image/character-ref generation | **EXTERNAL_SERVICE_REQUIRED** | no tool/GPU; Midjourney/Flux needed | no |
| Cinematic video generation | **EXTERNAL_SERVICE_REQUIRED** | no tool/GPU/API; Runway/Veo/Kling needed | no |
| Voice / lip-sync / dubbing / music / SFX | **EXTERNAL_SERVICE_REQUIRED** | no audio tool; ElevenLabs/Suno needed | no |
| Edit / color / mix / subtitles / master | **BLOCKED_BY_ACCESS_OR_AUTHORIZATION** | ffmpeg absent (install=system change); DaVinci not installed | tool install needed |
| Retention/CTR/revenue measurement | **MISSING** (NOT_APPLICABLE until a published asset) | no published asset | n/a |

## Per-gap analysis (addendum §2: 8 points each) — top gaps
### Gap 1 — Cinematic video generation (EXTERNAL_SERVICE_REQUIRED)
1. Need: controllable high-fidelity shot generation. 2. Existing ODG impl: none. 3. Evidence: no tool/GPU/key.
4. Smallest change: authorize + integrate ONE video API (Runway) behind a bounded ODG connector. 5. Quality gain:
enables the entire visual track. 6. Time effect: unblocks production; adds gen+retake latency. 7. Deps/risks:
cost, rights (Kling ⚠), content limits, API quotas. 8. Test: the §C benchmark acceptance criteria.
### Gap 2 — Character/env consistency across shots (EXTERNAL_SERVICE_REQUIRED)
1. Need: same face/costume across many shots. 2. Existing: none. 3. Evidence: no image tool. 4. Smallest change:
Midjourney V8.2 Edit ref-sheets piped as references into the video model. 5. Quality gain: the #1 believability
driver. 6. Time: adds a ref-locking pre-step. 7. Risks: drift, rights. 8. Test: face-identity ≥4/5 across ≥4 shots.
### Gap 3 — Audio (voice/lip-sync/music) (EXTERNAL_SERVICE_REQUIRED)
1. Need: performed dialogue + score. 2. none. 3. no audio tool. 4. ElevenLabs + Suno behind an ODG connector.
5. Quality gain: turns silent footage into a film. 6. Time: parallelizable with video. 7. Risks: rights (use
ElevenLabs Music v2/Suno-paid; avoid Udio). 8. Test: intelligibility + lip-sync tolerance in the benchmark.
### Gap 4 — Edit/color/mix/subtitles (BLOCKED_BY_ACCESS_OR_AUTHORIZATION)
1. Need: assembly→master. 2. none installed. 3. ffmpeg absent. 4. install ffmpeg/DaVinci (authorized system
change) OR a cloud editor. 5. Quality gain: finishing. 6. Time: moderate. 7. Risks: install perms, learning.
8. Test: clean 1080p+ export with burned subs in the benchmark.
### Gap 5 — Orchestration/provenance/acceptance-gate wiring (PARTIALLY_IMPLEMENTED — the ODG-native build)
1. Need: track every asset/shot/prompt + gate defects. 2. **existing: evidence-provenance/validation-engine/
self-diagnostic (PROVEN for text)**. 3. Evidence: their tests pass. 4. Smallest change: extend them to media
asset records + shot/scene gates. 5. Quality gain: continuity + no-contamination. 6. Time: reduces rework.
7. Risks: scope. 8. Test: a seeded defective shot is rejected at its gate (reproducible).

**Summary:** ODG's reusable strength is the **orchestration/provenance/QC/text spine** (build on it, don't
duplicate). Every **generative + finishing** capability is external/blocked and needs authorization + integration.
