# Production Pipeline, Benchmark Spec, Premium Config & Roadmap — ODG_FILM_FACTORY_V1 (CTO quality-first addendum)

Integrates the CTO "Hollywood-quality maximum" addendum into the active mission (not a restart). Premium tools
are RESEARCHED/PLANNED only — **nothing purchased/activated** (addendum §1/§8).

## A. Best-per-function premium toolchain (quality-first selection; sourced 2026-10-24, verify at source)
Specialist-best beats all-in-one for a professional result; ODG orchestrates the chain.
| Function | Selected (quality-first) | Why | Rights |
|---|---|---|---|
| Screenwriting/story | LLM drafting + **independent model/human critique loop** (this mission) | iterative drafts + non-self critique | n/a |
| Character/world consistency refs | **Midjourney V8.2 Edit / Omni Reference** (+ Flux 2 Pro API for vari047ants) | best character-consistency refs 2026 | MJ commercial (Pro $60 if >$1M) |
| Cinematic video + camera control | **Runway Gen-4** (control/ownership) + **Google Veo 3.1** (realism) + **Kling** (cost/s, terms-gated) | no single model wins all; blend | Runway/Veo ownership on paid; Kling right-to-use ⚠ |
| Long-shot consistency | MJ refs piped as init/reference into video models | keep faces/wardrobe stable | — |
| Performance / lip-sync / dubbing | **ElevenLabs** (voice + dubbing, licensed Music v2) | commercial-cleared, multilingual | commercial from Starter |
| Score / sound design | **Suno Premier** (score) + ElevenLabs SFX | commercial on paid | Suno commercial; avoid Udio (no export) |
| Edit / color / mix / subtitles | **DaVinci Resolve (Studio)** + ffmpeg | pro-grade, controllable; scriptable | owned software |
| AV QC / defect detection | ODG-authored checks + human review gate | continuity/defect gates | n/a |
| Asset/shot tracking + provenance | **ODG native** (evidence-provenance, ledger) | reuse proven spine | n/a |

**Rights rule (addendum §9):** prefer ownership-clear (Runway/Veo/MJ/ElevenLabs/Suno); flag Kling (right-to-use)
+ Udio (export disabled) as commercial blockers; AI-disclosure labelling required at publish.

## B. End-to-end pipeline (ODG-orchestrated, with acceptance gates)
`screenplay → breakdown → character+visual bible → storyboard/shot-list → asset (ref) generation → shot
production → performance+dialogue → sound+music → edit → VFX → color → mix → subtitles/localization → QC →
master`. ODG tracks every asset/shot + prompts + metadata + provenance; **shot-level + scene-level acceptance
gates reject defective material before it contaminates downstream work**; parallelize asset-gen + independent
shots where safe. ODG-native today = the orchestration/tracking/provenance/QC-logic + text stages; every
generative stage = EXTERNAL_SERVICE_REQUIRED.

## C. Smallest representative cinematic benchmark (spec) — EXECUTION BLOCKED here
Benchmark = **the 14-shot, ~60s opening sequence** (`02`), because it stresses every hard problem at once:
- same character (Astrid) across ≥4 shots/angles — facial identity, costume, proportions, the forearm star-chart
  tattoo (continuity anchor);
- the hero VFX (wave→sand morph), twin-sun grade, the time-tide signature;
- dialogue intelligibility + voice consistency + lip-sync (Astrid/Olaf/Meryt) + one action beat + a sound pass;
- a cut, color, subtitle, export.
**Measure:** gen time, review time, failed attempts, credits, usable-shot ratio, continuity failures, revision
cost. **Acceptance criteria (set BEFORE running):** face-identity match across shots (human-judged ≥4/5), no
costume/proportion drift, lip-sync within tolerance, no hard continuity break, clean 1080p+ export.
**STATUS: BLOCKED_WITH_EVIDENCE** — cannot execute here: no GPU, no video/image/audio tool, no API keys, ffmpeg
absent, and addendum forbids purchasing/activating accounts without approval. Executing it needs the §D config +
explicit authorization.

## D. Premium production configuration + cost (transparent; NOT purchased)
| Item | Plan (monthly unless noted) | Role |
|---|---|---|
| Runway Pro | $35 | primary video + control |
| Google Veo 3.1 | $24 | realism shots (45-min/mo cap — plan around it) |
| Midjourney Pro | $60 | character-consistent refs |
| ElevenLabs Pro | $99 | voice/dubbing/SFX, commercial |
| Suno Premier | $30 | original score |
| DaVinci Resolve Studio | ~$295 one-off (verify) | edit/color/mix/subs |
| Kling (optional, terms-gated) | $37–92 | extra video volume ⚠ rights |
**Subscriptions floor ≈ $250–350/mo** + **DaVinci ~$295 one-off** + **credits/API usage** (the real variable).
**Cost/finished minute (sourced benchmark): $315–750 all-in**, dominated by retakes (~25% usable yield, 3–8 gens/
shot) + human editorial time — NOT the subscription price.

## E. Full-film cost/time — PROVISIONAL (benchmark NOT yet measured; §6/§10 forbid a "reliable" estimate without it)
For a **45–60 min** film at the sourced **$315–750/finished-minute** benchmark: **≈ $14k–$45k all-in** (≈€13k–€42k),
2026 industry range for polished small-team AI work — **UNVALIDATED for THIS project** until the §C benchmark is
run on the real toolchain. Shot count ≈ 50 min ÷ ~6s/shot ≈ **~500 shots**; at 3–8 gens/usable shot that is
~1,500–4,000 generations; timeline weeks–months of human editorial even with parallel gen. **Do not treat as a
quote** — it is a benchmark-derived range pending a measured sample.

## F. Dependency-ordered roadmap to an end-to-end ODG film factory
1. **(approval)** authorize the §D premium stack (or config A minimal) + a benchmark credit budget → unblocks C.
2. Build the §C benchmark (opening 60s) → measure yield/continuity/time/cost.
3. Evaluate vs the pre-set acceptance criteria (B/C) + independent human review → PROTOTYPE_VALIDATED or _FAILED.
4. If validated: recompute the full-film schedule/cost from measured data (replaces §E).
5. Implement ODG orchestration: asset/shot ledger, prompt/metadata retention, shot+scene acceptance gates,
   provenance, failure-retry — reusing `evidence-provenance`/`validation-engine`/`self-diagnostic`.
6. Professional screenplay gate (full draft + independent critique loop — `04`) in parallel with 2–4.
7. Release package (`06`/distribution) once a master exists.

## STATUS (this component): PROTOTYPE_REQUIRED / benchmark BLOCKED_WITH_EVIDENCE
Next safe action: author the full screenplay (ODG-native, no cost) + await CTO approval of a premium stack +
benchmark budget to execute §C. No purchase/activation without approval.
