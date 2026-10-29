# Cost Minimization V2 / Quality Preservation — F10 — 2026-10-24

**Orchestrator:** ODG. **Reference:** F10 (unchanged). **Mission budget: €0** — nothing bought, generated, or
installed. Prior budget figures (€1k/€2k/splits) are **non-binding hypotheses, not spend authorizations**. Goal:
the **lowest realistic total cost** for a finished 60-min film **without degrading quality** and **without
shrinking duration or quality to fit a number**. Tags: **[FACT]** / **[OFFICIAL]** sourced tariff · **[DERIVED]**
arithmetic from official inputs · **[EST]** estimate · **[UNVERIFIED]**. **No euro here is a quote or measured
spend.** FX: **1 USD ≈ €0.92 [EST]**, re-check at purchase.

## Phase 1 — Truth & production state [FACT]
HEAD 28c15a5 ≡ origin/main; F7/F8/F9/F10 + 5 stashes + dashboard preserved. **Zero media files exist** — nothing
produced; nothing declared produced. Register (`shot-list-f10.json`): **420 shots = 64 video (335 s real
durations: 5 s×49 + 6 s×15, NOT a generic 6 s) + 196 stills (729 s) + 141 FR audio lines (564 s) + 19 music cues**
→ **27.1 min of generated coverage** for a 60-min film (remainder = holds/reuse/scored stills — standing flag to
validate at benchmark). Allocation €452.10, all ESTIMATED; €0 committed/spent.

**Hardware reality [FACT]:** the host is a **headless cloud VM, NO GPU** (Cirrus virtual VGA, 8 vCPU, 22 GB RAM),
**ffmpeg not installed**. Local *generative* AI (Stable Diffusion/ComfyUI/local video) is **not viable here** —
it needs CUDA. Local *post-production* (edit/mix/export on CPU) is feasible but ffmpeg needs the gate-`12` install.

## Phase 2 — Sourced tariffs (observed 2026-10-24; full table in `pipeline/pricing-register-f10.json`)
Cheapest **OFFICIAL-verified** per category (commercial-use tiers):
- **Video:** Runway Gen-4 Turbo **$0.05/s** [OFFICIAL]; Luma Ray 3.2 720p $0.06/s [OFFICIAL]; hero-grade Runway
  Gen-4.5 $0.12/s [OFFICIAL]. Hailuo Fast $0.032/s [UNVERIFIED]. **Veo: do NOT bake in** — preview models shut
  down 2026-10-22, live API status uncertain.
- **Image:** Flux schnell **$0.003/img** [OFFICIAL, Replicate]; Flux dev $0.025/img [OFFICIAL] for identity-hard
  stills. Midjourney pricing [UNVERIFIED] (official page 403).
- **FR voice:** Google TTS Standard **$0.004/1k chars** (free ≤4M/mo) [OFFICIAL] — cheapest; OpenAI tts-1 $0.015
  [OFFICIAL]; ElevenLabs Creator $0.182/1k [OFFICIAL] — best emotional quality, paid-tier commercial only.
- **Music:** Suno Pro $10/mo, commercial needs a download (20/mo cap → **~$0.50/track** effective) [OFFICIAL];
  Udio Standard $10/mo [OFFICIAL].
- **OSS post (all $0, commercial-OK):** DaVinci Resolve free (4K export, no watermark; **Studio $295 NOT needed**),
  Kdenlive, Audacity, FFmpeg, Krita, Piper (local CPU TTS). GPL/LGPL duties attach to redistributing *software*,
  not to produced content. Coqui XTTS weights = non-commercial (avoid for release).
- **Cloud GPU (only if local gen):** RunPod RTX 4090 $0.89/hr Secure ($0.34 Community) [OFFICIAL]; Lambda A10
  $1.29/hr [OFFICIAL]; Vast.ai ~$0.35–0.70 [UNVERIFIED].

## Phase 3 — Per-shot cost model (`pipeline/cost-model-f10.mjs`, parametric; real durations; €/usable-sec = (1/yield)×price×dur)
Generation subtotals across sourced price sets (USD; yields are PLACEHOLDERS until measured):

| Price set | Video | Stills | Audio | Music | **Gen total** | ≈EUR [EST] |
|---|---|---|---|---|---|---|
| **Ultra-low** (Flux schnell, Google TTS, Runway Turbo, Suno) | $42 | $2 | ~$0 | $16 | **~$60** | ~€55 |
| **Balanced** (Flux dev, ElevenLabs-grade, Runway Turbo) | $42 | $10 | $8 | $17 | **~$77** | ~€71 |
| **Premium** (Runway Gen-4.5 hero, Flux dev, ElevenLabs) | $115 | $10 | $11 | $18 | **~$155** | ~€143 |

**Headline [FACT of the model]: generation is NOT the cost driver.** Even premium ≈ $155, because the film is only
27 min of generated coverage and entry video is $0.05/s. A cheap tool with poor yield can still cost more *per
usable second* than a dearer one — so **yield (unmeasured) matters more than sticker price**; the benchmark must
measure it.

## Phase 4 — Architecture comparison (monetary only; human time excluded and counted separately)

| Arch | Description | Gen [EST] | + 1-month subs/credits [EST] | + OSS post | Monetary total [EST] | Quality risk | Verdict |
|---|---|---|---|---|---|---|---|
| **A** | API video-first (push most shots to video) | ~$155–250 | ~$40 | $0 | **~$195–290 (€180–270)** | higher identity drift across many video shots | not cheapest, not safest |
| **B** | Hybrid per current register (64 video + 196 stills) | ~$77 | ~$40 | $0 | **~$117 (€108)** | moderate | solid baseline |
| **C** | Local-free generation | **infeasible here (no GPU)** → cloud GPU $10–70 + heavy setup | n/a | $0 | **~$10–70 GPU but + large human labor** | **high** (open models lag on identity/motion) | **rejected at this scale/hardware** |
| **D** | **Frugal hybrid**: cheapest VERIFIED APIs + all-OSS post + targeted quality upgrades | ~$60–90 | ~$16–40 | $0 | **~$75–130 (€70–120)** | low–moderate (upgrades protect peaks) | **RECOMMENDED** |

**C note:** local generation would trade per-shot API fees for GPU-hours **plus** large unbilled human setup/
iteration **plus** a real quality drop (open video models trail Runway/Kling on identity + motion). It only wins
with an already-owned free GPU at scale — not true here. Its *post-production* half (OSS on CPU) is adopted by ALL
architectures. **All architectures use $0 OSS post; rights $0 on commercial paid tiers; storage $0 (166 GB free).**

## Phase 5 — Quality control (7.5/10 is a TARGET TO DEMONSTRATE, not achieved)
No visual/vocal quality is validated — **no media exists**. The thresholds (identity ≥4/5, €/usable-sec ≤ the
measured bar, human ≥7.5/10, continuity, rights, legibility) stand from `39`. A failing shot → targeted fix or
cheaper method, **never an automatic budget increase**. The film must EXIST, be edited, and have its real duration
MEASURED before the export gate (fail-closed: no "done" without a real 60:00 ± tol file).

## Phase 7 — Recommendation + lowest defensible cost

**Recommended architecture: D — frugal hybrid.** Structure = the register's B (selective video where motion is the
point; animated stills elsewhere), priced on the cheapest VERIFIED stack (Flux schnell/dev stills, Runway Gen-4
Turbo video, Google-TTS or ElevenLabs voice, Suno music), with **targeted upgrades only where the 7.5/10 bar
demands**: ElevenLabs for the emotionally decisive lines (e.g. Olaf's death), Flux dev for hero-character stills,
Runway Gen-4.5 for the 3 HIGH siege shots. All post-production on free OSS (DaVinci Resolve free + Audacity +
ffmpeg). Local generation (C) and video-first (A) rejected as above.

**Lowest DEFENSIBLE monetary cost: ≈ $75–150 (≈ €70–140) [EST]** for a one-production-month run of a finished
60-min film — **well under €250** (so the gate-`12` ≤€250 benchmark envelope plausibly covers the ENTIRE
generation need) and far under the €2000 cap. **This is not a quote.**

**Assumptions & uncertainty margins:** yields are placeholders (if real video yield is 0.2 not 0.4, video roughly
doubles — still cheap monetarily); FX 1 USD≈€0.92; one production month (multi-month → subscriptions recur ×N);
Veo excluded; prices move weekly.

**Excluded costs (must not be read as €0):**
- **Unbilled HUMAN TIME — the true dominant cost:** editing 60 min, directing/QC 141 voice lines, compositing 196
  stills, retake supervision, continuity QC = **tens to low-hundreds of hours**. Never €0 in time.
- Any multi-month subscription recurrence; a paid editor/VO artist if not self-done; DaVinci Studio ($295) only if
  a free-tier limit is hit (not anticipated); contingency for worse-than-modelled yields.

**Possible savings:** Google TTS Standard (free ≤4M chars) ≈ $0 voice; Flux schnell stills ($0.003); one Suno Pro
month covers all 19 cues for $10 flat; batch generations within one credit month to avoid resets.

**Quality risks / unverified:** all visual + vocal quality; the 27→60 min coverage assumption (held stills reading
as quality); identity across moving multi-character shots; FR emotional delivery.

**Smallest real test to confirm the recommendation:** the gate-`12` **≤€250 benchmark** on the 5 representative
shots (`39` §3 / `prompt-register`): 1 HIGH video (SC40), 1 water+crowd (SC22), 1 FR-voice intimate (SC43), the
establisher still-vs-video (SC01), the continuity wound-pair (SC39↔SC48). It converts every [EST] above to a
MEASURED yield + cost-per-usable-second + human 7.5/10 verdict, and validates D before any scale-up.

## Governance
€0 spent/committed; no purchase/generation/subscription/install. A cap is NOT a spend authorization; any future
spend needs explicit governance approval. F7/F8/F9/F10 + artifacts + dashboard + stashes preserved. No commit/push.
