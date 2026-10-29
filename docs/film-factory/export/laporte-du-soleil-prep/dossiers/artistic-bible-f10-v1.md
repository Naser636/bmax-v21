# Artistic Bible — La Porte du Soleil (F10) — v1

> Historical-feel cinematic, immersive, sober, sensory, emotionally powerful; story-truth first; nothing invented or over-claimed; 10/10 is an ambition measured on real media, never self-awarded.

### AB-01 [VERIFIED]
- **Règle:** World/era = original fantasy, Norse ∩ pharaonic (dramatized). Never present a design as verified historical fact.
- **Portée:** all shots
- **Test:** prompt-audit: anachronism/ modern-term scan
- **Échec:** REJECT (anachronism / false-historical claim)

### AB-02 [VERIFIED]
- **Règle:** Palette: cold Norse steel-grey vs Egyptian gold/ochre; twin-sun convergence = blinding gold → calm single-sun dawn.
- **Portée:** all shots
- **Test:** transition-audit palette similarity
- **Échec:** FLAG abrupt unmotivated palette break

### AB-03 [PROPOSED]
- **Règle:** Light must be motivated by in-scene sources; readable shadows; controlled contrast.
- **Portée:** all visual shots
- **Test:** CIQE exposure/dynamic_range + human
- **Échec:** ARTISTIC_REVIEW_REQUIRED

### AB-04 [HUMAN_REQUIRED]
- **Règle:** Performance contained by default; no overacting, grimacing or artificial sentimentality. Nuance stays PROPOSED until evidenced.
- **Portée:** performance
- **Test:** human scoring grid (jeu/émotion)
- **Échec:** HUMAN_REVIEW_REQUIRED

### AB-05 [PROPOSED]
- **Règle:** Camera/edit/music/FX serve the story — no gratuitous effects, impossible motion or added spectacle without justification.
- **Portée:** all
- **Test:** shot-intent visualIntent review + human
- **Échec:** FLAG gratuitous → revise

### AB-06 [VERIFIED (requirement)]
- **Règle:** Character identity (face/morphology/hair/costume/props/wounds) consistent across shots vs reference sheets.
- **Portée:** all character shots
- **Test:** artistic-reviewer identity (multimodal/human)
- **Échec:** CANON_FAIL / BLOCK on mismatch

### AB-07 [PROPOSED]
- **Règle:** Composition: clear visual hierarchy; depth of field and camera moves motivated by action or POV.
- **Portée:** all visual shots
- **Test:** human scoring grid (image)
- **Échec:** ARTISTIC_REVIEW_REQUIRED

### AB-08 [PROPOSED]
- **Règle:** Materials/architecture/objects/costumes plausible where sources allow; assumptions never stated as verified fact.
- **Portée:** design
- **Test:** human (DA) + prompt-audit
- **Échec:** FLAG unverified-as-fact

### AB-09 [VERIFIED (constraint)]
- **Règle:** Sound: dialogue intelligibility, credible acoustic space, motivated ambiences, intentional silences, clean raccords. Do NOT invent or alter the 141 EN lines.
- **Portée:** sound
- **Test:** dubbing.test (EN verbatim) + sound-raccord-audit
- **Échec:** CANON_FAIL if a line altered/invented

### AB-10 [VERIFIED (requirement)]
- **Règle:** Continuity: morphology/hair/costume/props/wounds/orientation/emotional-state consistent; every visual break justified or FLAGGED for arbitration.
- **Portée:** all
- **Test:** continuity.test + transition.test
- **Échec:** BLOCK on unjustified break

### AB-11 [VERIFIED]
- **Règle:** Twin-sun / double-dawn desync is MONOTONIC (worsens over time).
- **Portée:** temporal/VFX
- **Test:** continuity-audit double-dawn
- **Échec:** FLAG non-monotonic desync

### AB-12 [VERIFIED (pair) + HUMAN (staging)]
- **Règle:** Wound continuity SC39 (inflicted) → SC48 (bound/healed) must read as the same wound progressing; exact staging HUMAN.
- **Portée:** SC39, SC48
- **Test:** shot-intent continuityDependencies
- **Échec:** CANON_FAIL on wound mismatch

### AB-13 [HUMAN_REQUIRED]
- **Règle:** Olaf SC43–SC44: dies vs departs through the seam is a HUMAN arbitration — do NOT impose. Provide both readings.
- **Portée:** SC43, SC44
- **Test:** decision register
- **Échec:** BLOCK until arbitrated

### AB-14 [VERIFIED]
- **Règle:** Helgi carries a carved wooden horse for Sǫlveig; it is handed on (SC29→SC32→SC33→SC44). Prop must persist/transfer correctly.
- **Portée:** SC29,32,33,44
- **Test:** shot-intent continuityDependencies (knownCanon)
- **Échec:** CANON_FAIL on prop discontinuity

### AB-15 [PROPOSED]
- **Règle:** AI-disclosure + commercial-rights-clear outputs required at publish; licensing of music/voice to be confirmed.
- **Portée:** release
- **Test:** rightsReleaseCheck (film-pipeline)
- **Échec:** BLOCK release if rights unclear

