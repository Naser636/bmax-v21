# Production Prep — La Porte du Soleil (zero-cost, pre-authorization) — campaign §3/§4

**ODG_FILM_FACTORY_V1 · 2026-10-24.** All independent, zero-cost prep that needs NO spend/install/external service.
Derived from F7 (`25`), the matrix (`23`), and timing (`26`). Reuses `09` (budget), `11` (capability), `01`/`04`
(tools). Nothing here produces media or triggers a paid action.

## 1. Shot inventory (from F7)
- 49 scenes · **140 dialogue/VO lines** · 98 action beats · **~384 estimated shots**.
- **~8 major set-piece SEQUENCES** (motion is the point): storm crossing, seam plunge, market tide, canyon/echo,
  Helgi's death, convergence siege, seal interior, the wordless bleed-montage — comprising **14 video-classified
  scenes** in the shot-ledger (a sequence spans multiple scenes). (8 sequences ≠ 14 scenes — same set-pieces,
  different granularity; reconciled 2026-10-24.)
- **Remainder (35 scenes) = still-cinematography + limited motion** (14 video + 35 still = 49) (AI stills + controlled push-in/parallax/
  compositing) — the cost-efficient majority (per `08` stylized pipeline).
- Per-scene shot lists to be generated into the `pipeline/` shot-ledger at production time (fields ready:
  id/scene/version/prompt/refs/cost/status/provenance).

## 2. Character & continuity register (locked before any generation)
**12 voices/characters:** Astrid, Olaf, Tove, Helgi, Meryt, Ipy, Seth-Nakht, Nefer-Ka, Vigge, Börk, Widow, Elder.
**Reference-sheet lock list (continuity anchors):** Astrid (ash-blond braid, forearm star-chart tattoo), Olaf
(grey beard, iron arm-ring), Helgi (wooden horse), Meryt (bronze scale-corslet, khopesh), Nefer-Ka (shaved head,
solar pectoral), Ipy (clay jug), Seth-Nakht (commander's insignia). **Locations:** storm sea; two-sun shore; the
seam (alignment phenomenon, NO temple); garrison; river-town market; canyon of frozen waves; seam-root; the
cairn; the great river. **Props:** wooden horse, Olaf's arm-ring, Ipy's mother's jug, the guardian's wall of
names, reed-boat shrine. **Continuity invariant (checkable):** desync level only ever INCREASES until the seal
(the `pipeline` continuity-check enforces monotonicity + roster + setup→payoff).

## 3. Audio needs
- **Dialogue/VO:** 140 lines across 12 voices (ElevenLabs-class TTS or rights-cleared performers). Egyptian lines
  are subtitled (already marked in-script).
- **Music:** ~7–9 cues — main theme; Norse low-drone motif; Egyptian double-reed motif; their convergence at the
  seal; the time-tide reversed-echo signature; two funerals; end title (Suno/ElevenLabs-Music, commercial-cleared).
- **Sound design:** the wordless montage (18B) + set-pieces are SFX-heavy (water↔sand, the TONE, the seam roar).
- **Subtitles:** FR + EN minimum; dub plan (multilingual) only after early retention justifies it.

## 4. Production schedule (phases; durations firm only after the §12 benchmark)
PRE (done/zero-cost): screenplay F7 + matrix + timing + this prep. → **GATE: `12` benchmark** (≤€350 + ffmpeg) →
measure yield/continuity/cost on the opening. → ASSET LOCK (reference sheets). → SHOT PRODUCTION (set-pieces +
stills, gated per-shot). → ASSEMBLY (DaVinci/ffmpeg) → sound/music/mix → color → subtitles → MASTER → QC (duration
+ continuity + rights) → CTO acceptance. Est. 4–8 weeks post-benchmark (PROVISIONAL, benchmark-calibrated).

## 5. Rights / provenance checklist (per asset, enforced by `pipeline` rightsReleaseCheck)
Each asset: tool + licence (ownership-clear preferred: Runway/Veo/MJ/ElevenLabs/Suno-paid; Kling right-to-use &
Udio no-export EXCLUDED), prompt + seed + version, sha256 provenance, AI-disclosure flag. Original story/world —
no third-party IP; historical elements dramatized (in-script disclaimer). Release blocked until all assets clear.

## 6. Budget mapping (≤ €4,000; detail in `09`/`14`, unchanged)
Stylized 60-min est ≈ €1,144 (PLAUSIBLE-UNVERIFIED) + reserve to €4,000; dominant variable = premium-video
retakes on the ~8 set-pieces (benchmark calibrates). Spent €0 / committed €0 / remaining €4,000. The `pipeline`
BudgetLedger refuses any spend crossing €4,000.

## 7. Final-film validation criteria (acceptance gate — CTO)
A real exported file ~60:00 (±2:00, per `26` edit plan) · picture + dialogue + music + mix + subtitles present ·
continuity/desync invariant holds · no critical defects (per-shot/scene gates) · rights + provenance documented ·
total cost ≤ €4,000 · reproducible master + evidence dossier. **None of these can be met without produced media**
→ all gated on the `12` approval.

## 8. Tools audit — executable-path status (campaign §4)
| Capability | Status |
|---|---|
| Screenplay/structure/timing/continuity-logic | **PRESENT_PROVEN** (ODG-native; this prep + `pipeline` 21/21) |
| Shot/asset ledger, acceptance gates, budget ledger, rights check | **PRESENT_PROVEN** (ODG-native, tested) |
| Image/character-ref · video · voice/music · edit/color/export | **EXTERNAL_DEPENDENCY** (paid tools + ffmpeg install) — BLOCKED on `12` |
| €1,144 stylized feasibility | **ESTIMATE (PLAUSIBLE-UNVERIFIED)** — benchmark-gated |

## Blocking authorization (exact, unchanged)
**`12` approval: ≤ €350** one-month benchmark stack (Runway Pro + Midjourney + ElevenLabs + Suno) **+ authorize a
local ffmpeg install.** Max exposure €350. Until granted, all of §1–§7 continue zero-cost; §3-production (real
media) cannot begin. ODG does not treat the €4,000 cap as spend authorization.
