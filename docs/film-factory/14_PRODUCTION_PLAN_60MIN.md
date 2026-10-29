# La Porte du Soleil — 60-MINUTE FILM Production Plan (authoritative) — CTO override V3

**Mandated deliverable: a 60-minute film. Hard cap €4,000.** The short/opening (`07`) and the ~60s benchmark
(`12`) are **internal validation steps, never the deliverable.** No scope/duration/quality downgrade is decided
here — §5 (identify the blocker precisely) is applied. Budget model: `pipeline/plan60-budget.mjs` (recomputes).

## 1. CENTRAL FEASIBILITY FINDING (honest; CTO decision required) — the 60min × €4k × quality trilemma
Evidence (sourced $315–750/finished-minute; `pipeline/plan60-budget.mjs`):
- **Full photoreal 60-min = €17,388–€41,400** → **4.3×–10.3× over the €4,000 cap → INFEASIBLE under the cap.**
- **Stylized/continuity-controlled 60-min ≈ €1,144 (EST) → UNDER the cap** — but UNPROVEN until the benchmark;
  quality is "high *stylized*" (AI still-cinematography + selective motion + strong score/sound + limited/motion-
  comic animation), NOT photoreal live-action.
⇒ You can hold **two** of {60 minutes, €4,000, full-photoreal} at the top level, not all three. **ODG does not
change the mandate.** It surfaces the blocker + options; the CTO decides the quality-style:
- **Option A (recommended to honour BOTH 60 min AND €4k):** 60-min **stylized** film ≈ €1,144 est (reserve to
  €4k). Feasibility PLAUSIBLE, to be confirmed by the benchmark.
- **Option B:** 60-min **photoreal** → requires €17k–41k (a budget-cap change — CTO-only).
- **Option C:** keep €4k + photoreal → the deliverable duration would have to drop (a mandate change — CTO-only).
Recommendation: **A** — the only route that keeps the 60-min deliverable within €4,000; benchmark-gated.

## 2. 60-minute structure (feature-scaled from the proof-of-concept story `07`)
3 acts, ~12 sequences, ~36 scenes (expands the short's spine: arrival → alliance → escalation → contested seal).
- **ACT I (0–15'):** storm→seam arrival; two-sun shore; Meryt/patrol; first time-tide; Olaf failing; the rules;
  Meryt's hidden guilt seeded. (Seq 1–3)
- **ACT II (15–42'):** uneasy alliance; learning to read the seam; escalating desync (3 set-pieces: flooded
  market, the frozen-wave canyon, the echo-double); Helgi's death (witnessed cost); Meryt's confession;
  Nefer-Ka's duty vs Astrid's way home; a reversal (the guard turns on the Norse). (Seq 4–8)
- **ACT III (42–60'):** the seam near collapse; the contested seal (Nefer-Ka can do it; Astrid chooses); Olaf's
  last wish vs the seal; Astrid seals from inside, strands herself; single-sun dawn; the grey cairn on gold sand.
  (Seq 9–12)
Full 60-min **dialogued screenplay** (~55–60 pages) is the next zero-cost ODG-native deliverable (expanding `07`);
IN PROGRESS — the scene-by-scene sequence outline above is the current state; the dialogued draft follows.

## 3. Shot / resource breakdown (stylized Option A)
- ~**400 shots** (avg ~9s; stylized longer holds). **~280 stills** (controlled motion: push-in/parallax/
  compositing) + **~120 selective premium-video** shots (only where motion is the point: seam, floods, action).
- Character/env continuity via locked reference sheets (Astrid/Olaf/Helgi/Meryt/Nefer-Ka/Ipy) reused across all
  shots. Voice: ~60 min dialogue (ElevenLabs). Score: Suno. Post: DaVinci + ffmpeg.
- All shots tracked through the BUILT `pipeline/` (ledger, acceptance gates, defect-retry, budget, rights).

## 4. Budget for the 60-min film (Option A; PROVISIONAL, benchmark-calibrated; ≤ €4,000)
| Line | € (EST) | Basis |
|---|--:|---|
| Stills (280 × 3 gens × €0.04) | €34 | Midjourney effective |
| Premium video (120 × 5 gens × €0.9) | €540 | ~8s clips incl retakes (Kling/Runway blend) |
| Voice (~60 min dialogue) | €180 | ElevenLabs Pro 1–2 mo |
| Music | €30 | Suno |
| Subscriptions (stack × 3 mo) | €360 | Runway+MJ+ElevenLabs+Suno |
| Post (DaVinci free + ffmpeg) | €0 | open-source |
| **Subtotal (EST)** | **≈ €1,144** | under cap |
| **Contingency reserve** | **€2,856** | retakes/continuity overruns (the real risk) |
| **CEILING** | **€4,000** | hard |
The dominant risk is **retake/continuity cost across 400 shots + 60 min of coherent voiced dialogue** — if real
retake rates are 2–3× the model, cost climbs toward the reserve. The benchmark measures this before scale.

## 5. Quality criteria (measurable, set before scale)
Per-shot: character-identity match ≥4/5; no costume/proportion drift; lip-sync within tolerance on dialogue; clean
1080p+ export. Per-scene: continuity invariant (monotonic desync) holds; no narrative contradiction. Film-level:
60:00±1:00 runtime; coherent score; burned subtitles (FR/EN); AI-disclosure; rights-clear assets. Independent
critique on the full screenplay ≥7/10 (done at short level; to re-run on the 60-min draft) + a HUMAN creative read.

## 6. Dependencies, acceptance, evidence, schedule
- **Dependencies:** the `12` approval (≤€350 + ffmpeg) to run the benchmark; then a 60-min production authorization
  (the ≤€4k Option-A budget). Generation = EXTERNAL; edit/export = ffmpeg install (authorized).
- **Acceptance (CTO final gate):** the exported 60-min film + an evidence dossier (per-shot ledger, QC results,
  budget ledger, rights register, provenance).
- **Expected evidence at each stage:** benchmark clip + measurement log → measured full-film cost/time →
  per-sequence rushes passing gates → assembled cut → master.
- **Schedule (PROVISIONAL, post-benchmark):** benchmark ~3–7 days; if validated, 60-min stylized production
  ≈ 4–8 weeks (gen+review+edit+sound+master), parallelized by sequence. Firm schedule only after the benchmark.

## 7. What is real vs not (truth criteria)
No media produced. The screenplay (short) + this plan + the tested orchestration pipeline are real; the 60-min
film does NOT exist. A tested pipeline + a plan ≠ a film. The film requires authorized tools + spend (≤€4k) +
the benchmark gate + production + the CTO's final acceptance.
