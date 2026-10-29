# Media / Licence / Human Needs + Effort-Cost Estimate — Pilot

**CINEMA_SCRIPT_SPINE_PROBE_V1 · 2026-10-23 · ZERO spend occurred. Nothing below was executed, acquired, or
paid for. This is a forward list of what a REAL production would require — each item needs its own separate
authorization.**

## A. Elements requiring MEDIA GENERATION/ACQUISITION (none done — out of this probe's scope)
| Item | Needed for | Why not doable in this probe |
|---|---|---|
| Narration audio (voice) | all shots | needs a rights-cleared human voice OR a licensed TTS; both = external tool + authorization + possible cost |
| Original motion-graphics (green-check montage, 5-checks animation, gate/chokepoint bar, split-screen diagram) | S1,S2,S4,S5,S6,S7,S8 | requires a video/motion tool; ODG has **no native media-generation capability** |
| Screen-recordings of the real repo files | S3,S4,S5,S7,S9 | own content (low rights risk) but still requires a capture/edit tool + a human operator |
| Background music / ambient pad | throughout | must be original or license-cleared; none selected or acquired |
| Editing / timeline assembly / mastering / captions | final cut | requires an editing tool (Family C) ODG lacks |
| Thumbnail + end card | publish prep | original design asset; not created |

## B. Elements requiring LICENCES / RIGHTS verification
| Item | Status |
|---|---|
| Any third-party product UI (real CI dashboards, etc.) | **DELIBERATELY AVOIDED** — shot plan specifies original motion-graphics instead, to sidestep screenshot/trademark rights. If ever substituted, licence/rights must be cleared first. |
| Music track | MUST be original or license-cleared (none chosen). |
| Voice (if TTS) | provider ToS + voice-likeness terms must be verified; synthetic-voice disclosure may apply. |
| On-screen code | OWN content (this repository) — no third-party licence needed. |
| AI-generated visuals (if ever used) | platform synthetic-content **disclosure** duties + provider ToS must be verified before any publish (not in scope). |

## C. Elements requiring HUMAN intervention (mandatory, per Master V5 §248)
| Item | Owner |
|---|---|
| Editorial angle approval + final creative acceptance | human creator / CTO |
| The mandatory creative verdict ("usable with ≤ minor corrections" | "needs rework") | human reviewer |
| Factual re-check of the script against the provenance register | human (optional second pass; ODG did an automated pass) |
| Voice performance (if human) | rights-cleared voice talent |
| Any decision to generate media, spend, or publish | human authorization (separate from this probe) |

## D. Effort & cost estimate (TRANSPARENT; zero actual spend)
**Rule:** compute cost here = provider tokens already consumed to author+verify the text (part of this session;
no separate/paid API call was made by ODG). All figures are estimates/ranges, not incurred invoices.

| Phase | Effort | Cost (estimate) |
|---|---|---|
| THIS PROBE (done): research + script + shot-plan + provenance + verify | ~1 orchestrated provider pass + 1 automated verification | **€0 incremental** (in-session compute; no paid call, no media) |
| Human creative review (next) | ~0.25–0.5 h human | human time only |
| IF later authorized — media production of ONE ~5-min pilot | voice + motion-graphics + edit | **NOT ESTIMATED as a commitment**; rough-order *range* only IF pursued: self-produced (own tools/time) ≈ low direct cost + several human hours; outsourced ≈ variable. **No spend without a separate authorization + budget.** |

**Honest limits:** any production-cost figure beyond "€0 incremental for the text probe" is speculative; no
media was priced, quoted, or purchased. Views/subscribers/revenue = **NOT_MEASURABLE** (no channel, no history).

## E. Capability-gap summary (ties to contract §4)
- **ABSENT native (needs external tool + authorization + possibly budget):** voice/TTS, motion-graphics, video
  capture/edit, music, mastering, captions — i.e. ALL of Master V5 Family C.
- **PRESENT native (used here):** text authoring (bounded provider delegation — the gap under test),
  provenance (sha256/sourceCommit), governance/verification, economics framing.
- **HUMAN-mandatory:** creative acceptance + any spend/publish decision.
