# Pilot Script — "The Machine That Refuses to Lie About Itself"

**Mission Cinéma pilot · CINEMA_SCRIPT_SPINE_PROBE_V1 · 2026-10-23 · sourceCommit 28c15a5**
**Rev. 2 (CTO verdict USABLE_WITH_MINOR_CORRECTIONS — bounded text-only corrective iteration).**

> The spoken narration below is clean (stage directions + inline tags removed to read for voice). The mandatory
> **fact / opinion / creative separation** is preserved in the structured mapping at the end (every spoken
> sentence is classified there, with `[FACT]` lines traced to `03_PROVENANCE_REGISTER.md`). Nothing is
> published; this is a text artifact for human review.

---

## §251 Film Mission Constitution (per Master V5)

- **FORMAT:** YouTube long-form explainer (single narrator; screen-recording of own code + original motion-text).
- **DURATION:** ~5 minutes (~790 spoken words).
- **LANGUAGE:** English (one-language pilot; multilingual deferred).
- **GENRE:** Technical explainer / software-culture.
- **AUDIENCE:** developers, platform/DevOps engineers, the technically-curious about AI agents and software
  trust (audience hypothesis — no validated demand signal).
- **THEMES:** honesty-by-construction; "green ≠ true"; refusal as a feature.
- **CREATIVE INVARIANTS:** every technical claim true + traceable; no hype; no claim that one check secures the
  whole system; the "refusal" framing is the spine. **MUST-NOT:** invented capabilities; anthropomorphic
  "wants".
- **QUALITY TARGET:** human-rated "usable with ≤ minor corrections".
- **RIGHTS:** 100% original narration; on-screen = the project's own code/terminal only; no third-party clip,
  image, music, or voice.
- **DELIVERY:** script + shot-plan + provenance only (NO media generated in this probe).
- **HUMAN CREATIVE GATES:** editorial angle + final acceptance = human (Master V5 §248).

---

## SPOKEN NARRATION

### COLD OPEN (0:00–0:25)

Most software will tell you it's fine. The tests are green, the dashboard is green, the deploy went through —
everything's green.

But "green" is not the same as "true." A system can pass every test and still be wrong about what it actually
is.

So here's a stranger idea: a system whose first move, before it does anything that matters, is to try to catch
*itself* out — and to stop if it can't.

*Title: THE MACHINE THAT REFUSES TO LIE ABOUT ITSELF.*

### BEAT 1 — The problem (0:25–1:20)

This is from a real codebase: an autonomous agent runtime. Buried in it is a small file with an unglamorous
job. It's called the Truth Lock.

Here's what makes it unusual. It's a *pure* policy — no file access, no clock, no randomness, nothing it can
reach out and touch. Which means it's completely predictable: give it the same facts, it returns the same
verdict, every time.

And the only facts it looks at are five plain observations about the Git repository it's running in. Not
opinions. Not vibes. Five yes-or-no questions about reality.

### BEAT 2 — The five questions (1:20–2:40)

One: are we even in a Git repository? Two: are we on the branch we expect — `main`? Three: can we actually
reach the published reference, `origin/main`? Four: does our current commit match it, or have we drifted? And
five: is the staging area empty — or are there changes sitting in the index that a run might sweep up by
accident?

If any one of those fails, the verdict flips to *refused*, and it says exactly why — in plain words, not a
stack trace.

And here's the part I like. It does *not* demand a spotless workspace. You're allowed to have messy,
uncommitted edits open while you work. The run builds its candidate from the committed version and overlays
only the files it's authorized to touch — so your unsaved work is left alone, never overwritten, never swept
in. Strict where it has to be; permissive where it safely can be.

### BEAT 3 — Refusal with teeth (2:40–3:40)

A policy nobody consults is just a comment. So this one is wired into a gate: a single checkpoint that runs
once, at the very start, before any real work begins.

And the consequence is specific. If a mission is going to *change* things and the verdict is failing, the run
is blocked — it exits, and not one stage runs. If the mission is read-only, just looking, it's never blocked;
the verdict is simply recorded so you can still see it. And when the system genuinely can't tell whether a
mission will change anything, it errs toward recording, not blocking — it won't halt work it can't prove is
dangerous.

Either way, the verdict is written down to an evidence file. The refusal doesn't just happen — it leaves a
receipt.

### BEAT 4 — Why it matters (3:40–4:30)

Step back. We keep handing more decisions to automated agents. And the frightening failure was never the crash
— a crash is honest. The frightening failure is the confident, wrong "all good."

So be clear about what this is — and isn't. One small check is not a force field. It does not make the system
secure; it doesn't vouch for the code, the dependencies, or anything the mission then goes on to do. It guards
exactly one narrow thing: that the system knows which version of itself it's about to act as, and refuses to
proceed if it can't be sure. One honest answer to one precise question — enforced by construction, instead of
by good intentions.

### CLOSE (4:30–5:00)

There's no trick here. Five observations, one pure function, one gate that runs first and is allowed to say
"no."

A green checkmark tells you a system passed. This one is trying to answer something harder, and it answers it
out loud: before you trust what a machine tells you, ask whether it's even sure who it is.

---

## FACT / OPINION / CREATIVE separation (mapping — mandatory, relocated out of the spoken flow)

`[FACT→Pn]` = verifiable, traced in `03_PROVENANCE_REGISTER.md`. `[OPINION]` = editorial judgement.
`[CREATIVE]` = framing/metaphor (no truth claim).

- COLD OPEN: "green ≠ true / can pass every test and still be wrong" = `[OPINION]`; the "catch itself out" setup
  + title = `[CREATIVE]` framing of the real mechanism detailed below.
- BEAT 1: "real agent-runtime codebase contains the Truth Lock" `[FACT→P1]`; "pure policy — no fs/clock/
  randomness; same facts → same verdict" `[FACT→P2]`; "only five Git observations" `[FACT→P3]`; "not vibes"
  `[OPINION]`.
- BEAT 2: the five questions `[FACT→P3]`; "refused, says why in plain words" `[FACT→P4]`; "does not demand a
  spotless workspace; unsaved work isolated via committed-version + authorized overlay, never swept in"
  `[FACT→P5]`; "part I like / strict where it has to be, permissive where it safely can be" `[OPINION]`.
- BEAT 3: "policy nobody consults is just a comment" `[OPINION]`; "wired into a gate that runs once, at the
  start, before any real work" `[FACT→P6]`; "mutating + failing ⇒ blocked, exits, no stage runs / read-only
  never blocked, recorded" `[FACT→P7]`; "can't tell ⇒ errs toward recording, won't halt what it can't prove
  dangerous" `[FACT→P8]`; "verdict written to an evidence file" `[FACT→P9]`; "leaves a receipt" `[CREATIVE]`.
- BEAT 4: "crash is honest / the frightening failure is the confident wrong 'all good'" `[OPINION]`; **nuance
  (per verdict): "not a force field; does not make the system secure; guards one narrow thing — which version
  of itself it acts as, refusing if unsure"** — the scope claim is grounded `[FACT→P3,P5,P7]`, the framing is
  `[OPINION]`; "enforced by construction not good intentions" `[OPINION]`.
- CLOSE: "five observations, one pure function, one gate that runs first and can say no" `[FACT→P2,P3,P6,P7]`;
  "green tells you it passed; this asks whether it's sure who it is" `[CREATIVE]`.

**Ungrounded factual claims: NONE.** Every `[FACT]` resolves to P1–P9 in the provenance register; all other
lines are explicitly `[OPINION]` or `[CREATIVE]` and carry no truth claim.
