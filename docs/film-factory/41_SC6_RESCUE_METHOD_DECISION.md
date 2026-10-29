# Scene 6 — First-Tide Ipy Rescue: Production-Method Decision — 2026-10-24

**Reference:** F10 (`37`, scene 6 "THE FIRST TIDE"), UNCHANGED (no narrative edit). **Decision:** compare three
production methods for the rescue and adopt the cheapest that keeps the dramatic force. **€0 spent/committed; no
media.** [FACT]=from F10 · [EST]=estimate, not measured.

## The beat (from F10, verbatim anchor)
[FACT] *"the sea does not withdraw politely… a true tide rising out of the sand between IPY and the dune… ASTRID is
already moving — she reads the run, not the panic… cuts a diagonal no one else would trust, and reaches IPY at the
instant the current takes her legs. She hauls the child up the slope to MERYT and is herself swept a staggering
stride before the sea drops back to dry dune, leaving Astrid on her knees, soaked, in a desert."*

**Dramatic job:** the FIRST proof of Astrid's gift (reading water nobody else can) AND the seed of the Astrid↔Ipy
bond that pays off the ending (sc38A). Four micro-beats: (1) the sudden surge, (2) **the decisive diagonal read-
and-grab as the current takes Ipy's legs**, (3) the haul-to-Meryt + Astrid swept, (4) the aftermath tableau
(Astrid kneeling soaked; Ipy's unafraid, assessing look). Beat (2) is the one that MUST read as real motion.

## Options

| | Method | Action legibility | Emotion | Identity risk | Water continuity | Cost [EST] | Failure risk |
|---|---|---|---|---|---|---|---|
| **A** | Full generated video (all 4 micro-beats as video) | Highest | High | **High** — child + Astrid faces in motion through water, several shots | one look to match across many video shots | **~€16** (≈4 video @ €4) | high (identity drift across many moving shots; most retakes) |
| **B** | Animated stills only (water + camera move; no real motion) | **Weak at beat 2** | undercut — the grab reads static | Low (stills) | easy (one still water look) | **~€1.40** (≈4 stills @ €0.35) | the emotional peak falls flat; the gift looks un-dramatic |
| **C** | **Hybrid** — stills (animated) for beats 1/3/4, ONE premium video for beat 2 only | **High where it matters** | preserved — the decisive grab moves | **Low–bounded** (1 video shot) | match animated water to the one video plate | **~€4.75** (3 stills + 1 video) | low — risk confined to a single shot |

[EST] costs use the register's €0.35 still / €4 video unit estimates; none measured.

## Verdict — **ADOPT C (hybrid)**
C is the **cheapest method that keeps the dramatic force**: it spends real motion only on beat (2), the single shot
whose power depends on movement, and carries beats 1/3/4 as cheaper animated stills. Versus A it saves **~€11.25
[EST]** and removes the multi-shot identity-drift risk; versus B it rescues the emotional peak that B flattens.
B alone was the status quo (scene 6 had NO video) — which under-served an essential beat; C corrects that for a
**net +€3.65 [EST]** over the all-still baseline.

**Acceptance for the one video shot (SC06-SH08):** Astrid identity ≥4/5; the current-takes-legs + diagonal grab
reads as real, weighted motion; water has a legible boundary (the "run" Astrid reads); Ipy safe-handoff clear; no
gore; animated-water in the flanking stills matches this plate's water. **Reject if:** identity drift, weightless/
impossible motion, no readable water line, or the grab reads as static.

## Register change (traceable)
[FACT] Applied to `pipeline/build-shotlist-f10.mjs` via a scoped `DECISIVE_VIDEO` map: scene 6's single insert
(SC06-SH08) is promoted STILL→PREMIUM_VIDEO ("the diagonal rescue — decisive moment"). **No F10 narrative change.**
Effect on `shot-list-f10.json`: totalShots **420 (unchanged)**; PREMIUM_VIDEO 63→**64**; allocation €448.45→
**€452.10** (+€3.65 [EST]); audio 141 unchanged; cap €2000, within. Re-verified: shotlist-check-f10 18/18,
video-prompts-check (64) PASS, shot-risk-audit 5/5. The full prompt for SC06-SH08 is in `video-prompts-f10.json`.

**Savings are ESTIMATED, never measured** — the benchmark (`39` §3) confirms the still-vs-video economics before
any scale-up. No visual quality is validated until a human inspects real generated media.
