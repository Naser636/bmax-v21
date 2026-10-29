# Cost Revalidation + 60-min Duration Proof — F10 — 2026-10-24

**Reference:** F10 (unchanged). **Mission budget €0** — no spend/generation/install. Extends `42` with REAL
per-shot durations, a rejected-attempt (yield) stress test, full cost categories, and a direct check of whether
the €70–140 figure rests on an unproven success assumption. Tags: [FACT]/[EST]/[UNVERIFIED]. FX 1 USD≈€0.92 [EST].

## A. Duration proof (`pipeline/duration-proof-f10.mjs`, 7/7) — three distinct durations
- **(1) generatedOutput = 1628 s = 27.1 min** [FACT from register]: raw clip seconds (64 video @335 s + 196
  stills @729 s + 141 audio @564 s; 19 music cues overlay, 0 standalone).
- **(2) usableScreen = 57.4–94 min** [EST, staged model]: screen time driven by dialogue delivery + action beats
  (cues × sec + action-words × sec, set-piece floors). Mid 75.8 min.
- **(3) estimatedFinal = 60:00 TARGET**: **60 min ∈ [57.4, 94]**, at the **7% position of the band (near the terse
  end)** → reached by terse-to-moderate pacing, **no filler, no artificial slowdown**.
- **Why screen (60) > generated (27.1) without double-count:** generation is **reused/held**, not repeated — a 4 s
  dialogue-coverage still holds for its full spoken line + reaction; establishers hold under score; action clips
  intercut. Each of the 49 scenes is counted **once**. If a cut drifts toward 94 min, trim the softest NON-set-
  piece scenes (19/25/34/8/32) — set-pieces and essential action are never cut to fit.
- **The 60:00 file DOES NOT EXIST.** This is a staging estimate; `exportDurationGate` (a real file at 60:00 ±120 s)
  is the ONLY validator. 60 min is NOT declared achieved.

## B. Cost revalidation with real durations + rejected attempts
`cost-model-f10.mjs` uses the register's real durations (video 5 s×49 + 6 s×15) and models rejected attempts as
**attempts = 1/yield**. Generation subtotals (USD; prices sourced `41`/`42`, observed 2026-10-24):

| Yield case | Video | Stills | Audio | Music | **Gen total** | ≈EUR |
|---|---|---|---|---|---|---|
| Optimistic (v0.4) balanced | $42 | $10 | $8 | $17 | **~$77** | ~€71 |
| **Pessimistic (v0.2, half yield)** | $84 | $14 | $11 | $29 | **~$138** | ~€127 |

Full monetary categories [EST, one production month]:
- **Generation:** $60–138 (yield range above). **Voice:** all 141 lines = 8,587 chars → Google TTS **$0.03** /
  ElevenLabs **$1.56** one pass; with retakes <$6. **Music:** Suno Pro **$10/mo flat** covers all 19 cues.
- **Licenses/rights:** $0 (commercial granted on paid API tiers). **Edit/compositing/mix/colour/subtitles:** $0
  (DaVinci Resolve free, Audacity, Krita — all commercial-OK OSS). **Storage:** $0 (166 GB local free).
  **Export/duration-verify:** $0 (ffmpeg — but needs the gate-`12` privileged install on this host).
- **Subscription/API minimums:** ~$6–30 (ElevenLabs Starter $6 or Google pay-go ~$0; a video sub/credit top-up;
  Suno $10). This floor, not per-shot fees, is what you actually pay.

## C. Does €70–140 rest on an unproven success assumption? — **Checked.**
- **Monetary: NO (yield-robust).** The stress test halves the video yield (0.4→0.2, i.e. 5 attempts/shot) and the
  generation total moves only $77→$138 — still inside the €70–140 band. Because the film is small (27 min
  coverage) at tiny unit prices, **cost is insensitive to yield**; even a poor benchmark keeps monetary spend low.
- **What IS unproven (the real risk) — NOT cost but:**
  1. **Quality.** 7.5/10 is a TARGET to demonstrate on real media; no media exists; no number is claimed.
  2. **The 27→60 min coverage assumption** — that held stills/reused clips read as quality screen time, not thin
     coverage. Must be seen, not asserted.
  3. **Human time — the true dominant cost, non-monetary:** editing 60 min, directing/QC 141 VO takes, compositing
     196 stills, supervising 64 video retakes, continuity QC = tens-to-low-hundreds of hours. **Never €0 in time.**
  4. FX 1 USD≈€0.92; one production month (multi-month → subs recur ×N); Veo excluded (availability uncertain).

**Separation demanded by the mandate:**
- **Lowest defensible MONETARY cost: ≈ €70–140** [EST, not a quote] — robust to yield, within the ≤€250 benchmark
  envelope, far under €2000.
- **Full cost including human time: €70–140 monetary + tens-to-low-hundreds of unbilled human hours** — the hours
  dominate. Any claim of "≈€100 to make the film" that hides this is dishonest.

## D. Free-resource conditions (must hold for the $0 items)
DaVinci free exports 4K no-watermark (Studio $295 not needed); OSS GPL/LGPL duties attach to redistributing
*software*, not produced content; commercial use needs PAID API tiers (not free tiers); Coqui XTTS weights are
non-commercial (avoid); ffmpeg must be installed (gate-`12`). Local generative AI is NOT an option here (no GPU).

## E. Smallest confirming test
The gate-`12` ≤€250 benchmark on the 5 representative shots converts yields + €/usable-second + the 7.5/10 verdict
from [EST] to MEASURED — the only thing that can promote any of the above from estimate to fact.
