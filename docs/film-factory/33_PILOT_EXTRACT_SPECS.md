# Pilot Extract Specs (Mission 1) — F8 reference — 2026-10-24

Three representative extracts, scenes verified in **F8** (`31`). PREP ONLY — prompts/plans; **no media generated**
(no file inspected → no pilot declared produced). Per-extract shot/ref/cost data pulled from `pipeline/
shot-list-f8.json` (trace = each shot's `sceneHead`; the `SCnn` id is positional, not the script number).
Combined generation estimate ≈ **€145** (Opening €49.25 + Siege €89.35 + Olaf €6.25) — inside the ≤€250 benchmark
envelope (`32`). Nothing authorized to spend.

## EXTRACT A — THE OPENING (F8 sc 1–4: storm → seam → two-sun shore) — 37 shots
- **Dramatic intent:** the premise in 60s — "green≠true" world-collision; Astrid's first *forced* unaided choice
  (steers blind into the seam). Hook.
- **Target duration:** ~2.5–3.5 min (set-piece). **Découpage:** 8 PREMIUM_VIDEO (storm climb, water→sand morph,
  keel-plough, twin-sun reveal) + 15 STILL_ANIMATABLE (deck coverage, crew reactions) + 12 AUDIO_LINE + 2 MUSIC.
- **References:** locations NORTH SEA, SŌLFARI DECK, IMPOSSIBLE SHORE; characters ASTRID, OLAF, HELGI, TOVE — all
  **TO_CREATE** (reference sheets not yet generated).
- **Movement:** high (storm swell, the morph, the plough). **Dialogue:** Astrid/Olaf/Helgi/Tove short lines.
  **Ambiance:** storm→sudden desert silence. **SFX:** sea→sand hiss, rigging drip on hot sand, the seam roar.
  **Music:** cold-open sting + the water-to-sand turn. **Continuity:** Astrid's star-chart tattoo; the ship; two
  suns established.

## EXTRACT B — THE SIEGE (F8 sc 28, 29, 30, 30A) — 43 shots (the strongest ACTION test)
- **Dramatic intent:** climax turn — Astrid breaks Seth-Nakht's authority by reading the tides; Meryt disarms
  him (ally-forced turn); a real cost (Börk). Tests character continuity across many shots + VFX + a crowd.
- **Target duration:** ~3–4.5 min. **Découpage:** 17 PREMIUM_VIDEO (the wedge charge broken by the tide-read, Sgt
  Khay's near-drowning, the bluff, the Meryt disarm, Seth-Nakht's litter-shove, Börk's loss) + 11 STILL + 11
  AUDIO + 4 MUSIC.
- **References:** SEAM-ROOT (location); ASTRID, MERYT, SETH-NAKHT, NEFER-KA, OLAF, HELGI, TOVE, VIGGE — **TO_CREATE**.
- **Movement:** high + tactical (charge, floods erupting on cue, a physical disarm). **Dialogue:** Astrid's tide
  callouts + Seth-Nakht + Nefer-Ka. **Ambiance:** convergence glare, flicker sand↔sea. **SFX:** the TONE, water
  eruptions, armour-drag, blade-clatter. **Music:** rising siege cue → collapse on the litter-shove.
  **Continuity (critical — new F8 action):** terrain geography (pillar/dune/flooding hollows) consistent; Khay
  near-drowned → first to drop his spear; **Meryt's forearm wound carried to sc32/sc38**; Seth-Nakht disarmed
  before his turn; positions legible shot-to-shot.

## EXTRACT C — OLAF'S DEATH (F8 sc 33) — 9 shots (emotional, dialogue-driven, cheapest)
- **Dramatic intent:** the costly choice spoken aloud ("I'm closing the seam. I'm staying. I chose it."); Olaf
  dies. Tests performance, voice, intimacy — NOT spectacle.
- **Target duration:** ~2–2.5 min. **Découpage:** 0 PREMIUM_VIDEO · 5 STILL_ANIMATABLE (two-shot, CUs on hands/
  faces) · 3 AUDIO_LINE · 1 MUSIC. Deliberately still-cinematography — proves the cheap, high-quality path.
- **References:** SEAM-ROOT; ASTRID, OLAF, TOVE — **TO_CREATE**. **Movement:** minimal (a held two-shot, a hand
  stilling). **Ambiance:** convergence hush. **SFX:** distant seam, low. **Music:** single restrained cue.
  **Continuity:** Olaf's arm-ring; Helgi's horse handed to Tove; Astrid dry-eyed until after.

## Acceptance criteria (all extracts) + ELIMINATORY defects
ACCEPT a shot only if: character identity ≥4/5 vs its reference · motion coherent (video) · terrain/geography
legible · no visible artifacts · rhythm on-intent · audio intelligible + voice-consistent + lip-syncable · rights
established (ownership-clear tool). **ELIMINATORY (auto-reject):** unstable identity across shots · incoherent/
impossible motion · unreadable geography · visible artifacts · unusable audio · unestablished rights. (Enforced by
the pipeline acceptance-gate + rights check.)

## Two-tool comparison protocol (fair; executable only after `12`)
- **Same intent, refs, criteria** on comparable shots: run ≥2 video tools (e.g., **Runway Gen-4.5** vs **Kling
  3.0** vs **Veo 3.1-lite**) on the SAME 2–3 hero shots of Extract B (and 1 of A). Stills on the same image tool.
- **Metrics (per tool, per shot):** attempts-to-usable (yield) · character-consistency score (1–5) · artifact
  rate · motion stability · **cost per usable SECOND** = (attempts × unit_cost)/usable_seconds · correction time
  · edit compatibility (resolution/fps/codec).
- **Max attempts:** 8 per shot (entry-tier ceiling); stop a shot at 8 and log ELIMINATORY if still failing.
- **Hard cap + stop:** total pilot spend **≤ €250** via `BudgetLedger(250)` (pre-spend refusal); stop immediately
  on cap or on an un-fixable eliminatory defect. **Prices verified at source at purchase time** (`32`): Veo 3.1
  $0.40/s std/$0.05 lite; Kling 3.0 ~$0.10/s; Runway Gen-4.5 12 cr/s.
- **Decision:** adopt, per shot-type, the tool with the best quality-per-euro that clears acceptance; extend only
  validated methods to the 49 scenes (Phase 5).

## Status
Specs complete + testable. **No visual pilot produced** (blocked on `12`). The offline parts (prompts, criteria,
metrics, budget logic, gates) are unit-tested; only paid generation is blocked.
