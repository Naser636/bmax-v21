# Human-Quality 7.5–8/10 + Minimum-Cost Gate — F10 — 2026-10-24

**Orchestrator:** ODG. **Reference:** F10 (`37`, unchanged). **Goal:** perceived cinematic quality **7.5–8/10 or
better** at the **lowest total cost**, hard cap **€2,000**. **€0 spent / €0 committed; no media, no purchase, no
install this mission.** Tags: **[SCRIPT]** = assessable on the screenplay now · **[MEDIA]** = needs real generated
media · **[HUMAN]** = needs a human viewer. **No visual-quality score is assigned to images that do not exist.**

---
## 1. QUALITY RUBRIC (0–10 per axis; target ≥7.5 weighted)

| # | Axis | Weight | How scored | Evidence class | Target | Status today |
|---|---|---|---|---|---|---|
| 1 | Story: clarity + emotion | 18% | scene logic, arc completion, stakes legibility | **[SCRIPT]** + [HUMAN] | ≥8 | F10 arc complete + critique-verified (`38`); **awaits [HUMAN] read** |
| 2 | Character acting + credibility | 15% | performance, voice match, micro-expression | **[MEDIA]**+[HUMAN] | ≥7.5 | **unverified** (no media) |
| 3 | Directing / framing / action legibility | 15% | shot grammar, geography readable, no confusion | [SCRIPT] (plan) + **[MEDIA]** | ≥7.5 | plan strong (shot-list+action-audit); render **unverified** |
| 4 | Visual coherence + continuity | 14% | identity/costume/wound/prop stability across shots | **[MEDIA]**+[HUMAN] | ≥7.5 | **unverified**; plan now anchors identity (inserts carry char refs) |
| 5 | Editing / rhythm / real duration | 12% | pace, no dead air, true 60:00 | [SCRIPT] (timing) + **[MEDIA]** | ≥7.5 | timing model 57–94→60; real cut **unverified** |
| 6 | Dialogue / FR voice / music / mix | 14% | FR VO naturalness, music fit, clean mix | **[MEDIA]**+[HUMAN] | ≥7.5 | **unverified** (no audio) |
| 7 | Technical finish + overall satisfaction | 12% | artifact-free 1080p+, codec, export, "would watch" | **[MEDIA]**+[HUMAN] | ≥7.5 | **unverified** |

**Honest reading:** only **Axis 1** is partly evidenced today (script + model critique) and even it needs a
**[HUMAN]** read. Axes 2–7 are **structurally prepared but quality-unverified** because no media exists. A model
score is NOT a human/theatrical score. **Overall quality is therefore UNVERIFIED** until the benchmark + a human
pass; this document builds the gate that would let us claim a number honestly.

---
## 2. 420-SHOT AUDIT (data-driven — `pipeline/shot-risk-audit-f10.mjs`, read-only)

**Media mix (ESTIMATE):** 63 PREMIUM_VIDEO (€252) · 197 STILL_ANIMATABLE (€68.95) · 141 AUDIO_LINE (€70.50) ·
19 MUSIC_CUE (€57) = **€448.45 generation allocation** (one envelope of the €2,000 register). Unique generated
coverage ≈ **27.1 min**; the 60-min runtime is reached by holds/reuse/scored stills over coverage — **flagged**:
the benchmark must confirm held-still screen-time reads as quality, not as thin coverage.

**Risk tiers:** HIGH **3** · MED **345** · LOW **72**.
- **HIGH (3):** the siege action INSERTs that stack CROWD + COMBAT + seam/water VFX + faces-in-motion — the single
  hardest generation case. These are the mandatory benchmark hero shots.
- **High-risk tag counts:** CONTINUITY 322 (recurring identities) · CROWD 217 · VFX_WATER_SEAM 167 ·
  COMPLEX_MOVE/action-insert 48 · (faces-in-motion concentrated in the siege/storm inserts).

**Cost-reduction found (no perceptible loss): 15 wide establishers** ("slow push-in", camera-only motion) →
**STILL + Ken-Burns/parallax**, saving **~€54.75** of the €448.45 (≈12%). Motion-critical inserts (floods, charge,
disarm, plunge) are **never** downgraded. Downgrade is a **[HUMAN]** decision confirmed by the benchmark, not an
auto-change.

**DEFECT FOUND + FIXED this mission:** all 48 video action inserts previously carried **no character reference** —
the hardest shots would have been generated with nothing to lock identity against (a direct threat to Axis 4). Fix
applied in `build-shotlist-f10.mjs`: action inserts now inherit the scene's character refs. Re-verified 0/48
missing. Also fixed stale **€4,000** cap text → **€2,000** in the register (allocation/commit/spend still distinct).

---
## 3. BENCHMARK BEFORE SCALING (reproducible; thresholds set BEFORE the test; executable only after `12`)

**Representative set (5 shots) — chosen to span the risk surface:**
1. **Hero HIGH** — a siege action insert (SC40/SC45 class): faces + crowd + water VFX + motion. The make-or-break.
2. **VFX env-peril** — a tide/flood insert (SC06/SC22): water sim + Astrid reading.
3. **Intimate dialogue** — Olaf's death two-shot (SC33 class): FR voice + micro-expression, cheapest path.
4. **Wide establisher** — a "slow push-in" (SC01): tests whether a STILL+Ken-Burns equals the video (the €54.75
   question).
5. **Continuity pair** — Meryt before/after the forearm wound (SC30→SC38): identity + wound persistence.

**Protocol:** same intent/refs/criteria across ≥2 tools per shot-type (video: e.g. Runway vs Kling vs Veo-lite;
stills on one image tool; FR voice on one TTS). **Max 8 attempts/shot** (entry ceiling); **every rejected attempt
counted**. Metrics per tool/shot: attempts-to-usable (yield), identity 1–5, artifact rate, motion stability,
**cost per usable SECOND = (attempts × unit)/usable_seconds**, correction time, edit compatibility. **Hard stop:**
`BudgetLedger(250)` pre-spend refusal; stop at cap or at an unfixable eliminatory defect. Prices verified at source
at purchase time.

**Acceptance thresholds (set NOW, before any spend) — a shot-type PASSES only if:**
- identity ≥ **4/5** across all its shots; motion coherent (video); geography legible; **no** eliminatory artifact;
- FR voice intelligible + consistent + lip-syncable;
- **cost per usable second ≤ €1.20** at entry tier (else re-method before scaling);
- a **[HUMAN]** inspector rates the shot-type ≥ **7.5/10** on its relevant axes.
**If any threshold fails:** propose a targeted cheaper method (still+parallax, fewer attempts, simpler staging)
BEFORE increasing volume — never scale a failing method.

---
## 4. BUDGET OPTIMIZATION — scenarios, cheapest→most ambitious (all [EST], €/usable-sec prioritized)

Basis: €448.45 generation allocation; €2,000 register with reserve. Figures are **estimates, not measured**.

| Scenario | Method | Gen cost [EST] | + Voice/Music/SFX [EST] | + Edit/Sound reserve [EST] | Total [EST] | Risk to 7.5/10 |
|---|---|---|---|---|---|---|
| **S0 Lean** | 15 establishers→stills; video only for the 48 motion inserts; stills elsewhere | ~€394 | ~€180 | ~€350 | **~€924** | medium (held stills must read well) |
| **S1 Balanced (recommended)** | S0 + keep the 3 HIGH hero shots at premium video, more attempts allowed | ~€430 | ~€200 | ~€350 | **~€980** | low–medium |
| **S2 Ambitious** | all 63 video shots at premium + extra retakes + a second voice pass | ~€560 | ~€250 | ~€400 | **~€1,210** | low (cost ↑, not quality-guaranteed) |

**All three sit under €2,000 with the €300 reserve intact.** Priority rule honored: decide by **cost per usable
second**, not sticker price — a cheap tool with a 1-in-8 yield can cost more per usable second than a dearer tool
at 1-in-2. The benchmark (§3) replaces every [EST] above with a MEASURED €/usable-sec before any scale-up.

**Recommendation: S1 Balanced** — spends on motion where motion is the point, saves ~€55 on establishers, holds a
full reserve, and concentrates retake budget on the 3 HIGH hero shots that decide Axis 3/4.

---
## 5. DECISION GATES (full production proceeds ONLY if ALL pass)

1. **Quality:** benchmark hero + each shot-type clears §3 thresholds AND a human rates ≥7.5/10.
2. **Cost:** MEASURED €/usable-sec projects a full-film total **≤ €2,000** with reserve intact.
3. **Continuity + sound:** identity/wound/prop stable across the continuity pair; FR voice + mix acceptable.
4. **Whole-film feasibility:** the workflow can produce AND verify a complete 60:00 cut (exportDurationGate,
   fail-closed — no "film done" without a real file at 60:00 ± tol).
**Any gate fails → targeted fix or cheaper method first; do not scale.**

---
## 6. Governance
€0 spent/committed; no media, purchase, subscription, or install. F7/F8/F9/F10 + all artifacts preserved; F10
unmodified. The only writes this mission: this doc, the risk-audit script, and two defect fixes in the shot-list
generator (identity anchoring + €2,000 cap text) — re-verified green. Real media + the benchmark remain blocked on
authorization **`12`** (≤€250 benchmark stack + ffmpeg). Visual/audio quality remains **UNVERIFIED** until that
test + a human pass; no quality number is claimed for non-existent media.
