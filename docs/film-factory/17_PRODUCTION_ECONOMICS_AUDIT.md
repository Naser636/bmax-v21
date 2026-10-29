# Production Economics Audit (Mission 2) — 2026-10-24

Audits `pipeline/plan60-budget.mjs` + `09`. Separates verified prices from assumptions, and classifies the
60-min/€4k economics into three evidence categories. **The €1,144 stylized estimate is NOT validated** — it rests
on unmeasured yield/retake assumptions; only a real benchmark can move it to "verified".

## Cost-driver audit: verified price vs assumption
| Driver | Value used | Status | Note |
|---|---|---|---|
| Tool subscription list prices | Runway $35 / MJ $30 / ElevenLabs tier / Suno $10 /mo | **VERIFIED (published)** | a verified PRICE ≠ verified feasibility |
| DaVinci Resolve (free) + ffmpeg | €0 | **VERIFIED** | open-source; ffmpeg install still needs authorization |
| Industry cost/finished-minute | $315–750 | **VERIFIED (external productions)** | others' results, not ours |
| Usable-output yield | ~25% (3–8 gens/usable shot) | **VERIFIED (external benchmark)** | **our** yield UNMEASURED |
| €0.04 / still (3 gens) | assumption | **ASSUMPTION** | depends on MJ plan + retakes |
| €0.9 / premium video shot (5 gens, ~8s) | assumption | **ASSUMPTION** | model/retake dependent; could be 2–3× |
| 70/30 still/video split, ~400 shots, 9s avg | assumption | **ASSUMPTION** | stylized-aesthetic design choice |
| Voice ~€180 / music €30 / subs €360 | assumption | **ASSUMPTION** | tier + months unconfirmed |

## Three evidence categories (as mandated)
### VERIFIED FEASIBLE (evidence-backed now)
- The **tool prices** above (published) and **free post** (DaVinci/ffmpeg). The **orchestration pipeline** that
  enforces the €4,000 cap (tested, 17/17). The industry per-minute benchmark EXISTS (external).
- i.e. the *inputs and controls* are verified; **not** that the 60-min film is producible at €1,144.

### PLAUSIBLE BUT UNVERIFIED (needs a benchmark)
- The **€1,144 stylized 60-min estimate** and the **under-cap verdict** — contingent on unmeasured yield, retake
  rate, per-shot cost, and that a stylized aesthetic clears the quality gate across ~400 shots + 60 min of voiced
  dialogue. **Recorded as PLAUSIBLE, explicitly NOT validated.**
- Measured-yield sensitivity: if real video yield is entry-tier (8 gens/usable vs 5), video cost ~€540→€864;
  still under €4k but the reserve erodes — and that's before continuity-retake overruns, the real risk.

### INFEASIBLE UNDER CURRENT EVIDENCE
- **Full photoreal 60-min** = €17,388–41,400 (4.3×–10.3× over €4,000). Not feasible under the cap. (`14` §1.)
- Any claim that the 60-min film is **producible within €4k at full live-action-equivalent quality**.

## Honest conclusion
The €4,000 cap governs; the controls to respect it are built and tested. **Whether 60 finished minutes can be
produced within €4,000 is PLAUSIBLE (stylized) but UNPROVEN** — it cannot be asserted until the `12` benchmark
measures our real usable-yield, retake rate, and per-minute cost on our chosen toolchain. Budget state today:
**spent €0, committed €0, remaining €4,000.**
