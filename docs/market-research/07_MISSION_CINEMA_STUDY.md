# Mission Cinéma / YouTube — Strategic Study V1 (2026-10-23)

**Status: PRELIMINARY STUDY (analysis only).** No publishing, no media generation, no spend, no external
contact, no code change. Grounded in the FROZEN Master V5 cinema doctrine; implementation state verified
against the real repo.

**Evidence legend:** DOCTRINE = in the frozen Master V5 (cited). FACT = verifiable in-repo or externally
sourced. HYP = hypothesis/estimate. NO figure here is acquired revenue, promised views, or promised subs.

---

## 0. Honest grounding — what actually exists

- **Doctrine EXISTS (DOCTRINE).** `docs/odg-master-v5/source/ODG_FINAL_MASTER_V5_FICHE_04.md` §248–255:
  - §248 **ODG Creative Authority Contract** — "THE HUMAN CREATES. ODG OPERATES THE PRODUCTION." Human owns
    vision/meaning/creative direction/final acceptance/irreversible artistic decisions; ODG owns research,
    planning, story decomposition, world-state, continuity, shot planning, provider selection, generation,
    repair, editing, audio planning, QC, provenance, cost optimization, production memory.
  - §249 **Cinema as an Industry Pack** — sits *above* the nine primitives; no separate kernel/constitution.
  - §250 **Five Production Families** — A Story/Narrative · B World/Asset · C Cinematic Production (image/
    motion/VFX/compositing/editing/mastering) · D Quality/Repair · E Economics/Provider-Optimization.
  - §251 **Film Mission Constitution** (format/duration/language/genre/audience/themes/invariants/quality/
    rights/budget/resource-bound/delivery/acceptance/human-creative-gates).
  - §252 **Film Production Truth Layer** (per-artifact traceable identity: mission/scene/shot/asset/version/
    source/provider/model/params/cost/quality/verification/rights/approval).
  - §253 **Asset Factory**, §254 **Shot Factory** (contract→previs→low-cost candidates→continuity→quality→
    select→premium-only-if-justified→repair→verify→accept/reject), §255 Previs-First Economics.
- **Implementation = ZERO (FACT).** Repo grep: `youtube` = 0 occurrences; `mission cinéma` = 0; no cinema
  runtime module, no Shot/Asset Factory code, no media capability in the 11 registered executors. Mission
  Cinéma is **doctrine without implementation** — a specified-but-unbuilt Industry Pack.
- **No prior Mission Cinéma decisions/history exist to honour** — nothing to reconstruct; this is V1.

## 1. Positioning (DOCTRINE + HYP — all audience claims are hypotheses, no market data fetched this pass)

- **Candidate audiences (HYP):** (a) film-literate viewers wanting analysis/explainers; (b) aspiring
  creators wanting craft/pipeline/behind-the-scenes; (c) general audiences for original short narrative;
  (d) a *meta* audience interested in "an AI governance system operating a production pipeline" (ODG's own
  story — the one topic ODG can factually ground today).
- **Differentiating angle that is actually defensible (HYP→testable):** *reproducible, provenance-stamped,
  economically-measured production* — i.e. the Truth Layer (§252) as a visible editorial value ("every claim
  sourced, every asset traced, cost-per-accepted-minute reported"). This is the only angle where ODG's
  genuine assets (governance, provenance, economics) are the product rather than a commodity.
- **Confirmed vs hypothesis:** CONFIRMED = the doctrine + ODG's non-media capabilities. HYPOTHESIS =
  everything about *audience demand, angle resonance, and competition* (no web research executed here;
  autonomous web egress is BLOCKED `a.test`, so any market claim must go through the bounded provider and be
  logged, not asserted).

## 2. Content formats — compared, not pre-decided

| Format | ODG capability fit today | Rights risk | Verdict |
|---|---|---|---|
| Original short narrative (fiction) | LOW — needs full media generation (Family C) ODG lacks | LOW (original) but AI-media ToS/disclosure | High production cost, external tools; defer |
| Film analysis / explainer | MEDIUM — script+research+planning in-capability; needs clips/images | HIGH (film clips, posters, music = licensing) | Rights-heavy; defer unless original visuals only |
| Documentary / investigation | MEDIUM (research+script) / LOW (footage) | MEDIUM (archival rights) | Defer |
| Craft / history-of-cinema explainer (original visuals only) | MEDIUM | LOWER if fully original/licensed assets | Candidate |
| **"How it's made" — ODG operating a production pipeline (dogfood)** | **HIGH — ODG can factually ground this from its own proven artifacts** | **LOW (own content)** | **Strongest first candidate** |
| YouTube Shorts (short vertical) | same media gap; lower per-unit cost | same | Cheapest test vehicle |
| Multilingual variants | ODG has no proven TTS/translation media pipeline | depends | Only after a single-language proof |

**Reading:** the formats that *need media ODG cannot generate* (narrative, clip-based analysis) are the most
expensive and rights-riskiest; the format where ODG's proven capabilities ARE the content (its own
provenance/economics/governance pipeline) is the cheapest and lowest-risk first test.

## 3. Production feasibility — Five Families mapped to ODG's REAL 11 capabilities

Capabilities (FACT, from `runtime/core/capability-executors.ts`): Clean Workspace · Connectivity Audit ·
Decision Precedent Consultation · External Research Acquisition (egress BLOCKED → bounded provider, logged) ·
Governed Bash/Linux · Governed Git Branch · Governed Observability · Implement Via Local Provider · ODG Spec
Author · ODG Synthetic Deliverable · Provider Activation. Plus economic substrate (`economic-verification`,
`unit-economics`, `revenue-model`, provider routing) and `evidence-provenance` (sha256 + sourceCommit).

| Family (§250) | Step | ODG state today |
|---|---|---|
| **A Story/Narrative** | research, fact-check, topic watch, story decomposition, script | **TO-TEST (in-capability):** ODG Spec Author + Implement Via Local Provider can draft structured scripts/outlines; Decision Precedent for consistency. Fact-grounding needs External Research (bounded provider, logged). Not yet proven for video scripts. |
| **B World/Asset** | world/character bible, asset identity/provenance/versioning | **PARTIAL (substrate only):** ledger + `evidence-provenance` give asset *identity/version/provenance/traceability* (§252/§253 Truth-Layer mechanics). But **no visual asset generation** exists. |
| **C Cinematic Production** | previs, image/motion/VFX, compositing, editing, mastering | **ABSENT (EXTERNAL-TOOL):** ODG has **zero** media-generation capability. Requires external text-to-image/video, TTS, editing tools — not integrated, not authorized, cost unknown, ToS/rights unverified. |
| **D Quality/Repair** | identity/continuity/spatial/temporal/narrative/audio verification, repair | **PARTIAL (text only):** ODG's verification/governance/regression substrate can QC *text artifacts* (script factuality, structure). **Media QC (continuity, spatial, temporal) = not implemented.** |
| **E Economics/Provider-Opt** | provider comparison, routing, caching, batching, cost-per-accepted-minute | **PROVEN substrate:** `economic-verification`/`unit-economics`/provider champion-challenger/cost accounting are real and map directly to §255 previs-first economics. |

**Per-step honesty:** PROVEN today = planning/governance/provenance/economics spine (Families A-planning, E,
and §252 Truth Layer). TO-TEST = ODG authoring reviewer-acceptable scripts/plans. EXTERNAL-TOOL = all actual
media generation (C) + TTS/translation. HUMAN = creative vision, final acceptance, irreversible artistic
choices (mandated by §248). **Conclusion: ODG can operate the *text/planning/governance/economics* production
spine of a channel; it cannot itself produce the audiovisual content.** A fully-autonomous "ODG makes YouTube
videos" is NOT feasible with current capabilities.

## 4. Rights & compliance (FACT doctrine + general legal caution; no legal advice, verify with counsel)

- Prefer **original or verifiably-licensed** assets (§248 rights/provenance; Truth Layer records rights per
  asset). Do **not** assume commentary/montage makes film clips, posters, trailers, or music lawful — fair
  use/fair dealing is fact-specific and jurisdiction-specific.
- **AI-generated media:** provider Terms-of-Service + emerging synthetic-content *disclosure* duties (several
  platforms now require labelling AI-generated/altered realistic content — **verify current YouTube policy via
  the bounded provider before any pilot**). Voice/likeness and music licensing carry separate risk.
- **Position:** the lowest-risk path is 100%-original or own-content (the dogfood format), with every asset's
  rights/provenance recorded in the Truth Layer. Rights-heavy clip-based formats stay deferred.

## 5. Economic model (HYP — no promised views/subs; thresholds commonly-cited, VERIFY, not fetched here)

- **Revenue avenues (HYP):** YouTube Partner Program ad-share (monetization thresholds commonly cited as
  ~1,000 subscribers + ~4,000 public watch-hours, or a Shorts-views equivalent — **flag as needs-verification**,
  not fetched this pass); sponsorship; channel memberships; lead-gen for ODG's *own* services (the market-study
  OPP-1/2/3 evidence packs); repurposing content as marketing. **All contingent on an audience that does not
  exist yet.**
- **Costs (HYP):** script/research via local provider = low compute; **media generation/editing = unknown and
  potentially the dominant cost** (external providers, per-minute) + human creative time. Net profit
  unknowable; treat as an *experiment cost*, not an investment with expected return.
- **Honest stance:** signed sponsorships = €0 (FACT); expected views/subs/revenue = **NOT_MEASURABLE** (no
  channel, no history). Any number beyond that would be fabricated.

## 6. Minimal, measurable first experiment (NO publish, NO spend, NO media gen, NO upload)

- **Hypothesis:** *ODG can autonomously produce a reviewer-acceptable, fact-grounded video **script + shot
  plan + rights/provenance record** for one short explainer — using only in-capability steps (Family A
  planning + §252 Truth Layer + E economics) — without any media generation.*
- **Candidate topics (dogfood, factually groundable from own proven artifacts):** (1) "How a reproducible SBOM
  evidence pack works" (ODG's proven 489-component CycloneDX capability); (2) "What JS≡TS byte-parity proves";
  (3) "Truth-Lock: how a system refuses to lie about its own state." All three are topics ODG can source from
  its OWN repo evidence (no external rights, no unverifiable claims).
- **Quality criteria (acceptance):** every factual claim traces to a repo artifact (sha256/sourceCommit in a
  §252-style record); structure passes a rubric (hook/explain/evidence/takeaway); no claim ungrounded; a
  **human creative gate** reviews editorial quality (§248 — ODG does not self-accept creative work).
- **Cost/effort (est., HYP):** local-provider compute only; single sandboxed run; ~1 human review pass. No
  external spend.
- **Decide-to-continue signal:** human rates the script+plan+provenance as "usable as-is / minor edits" →
  continue to test ONE media-generation step (separate, authorized, budgeted). "Not usable" → stop; the
  text-spine hypothesis is falsified cheaply.

---

## Opportunity card (Phase-4 format) — OPP-CINE-1

- **Problem:** creators/channels carry heavy *operational* burden (research, scripting, fact-checking,
  continuity, provenance, cost control) around a creative core. Doctrine §248 targets exactly this split.
- **Potential user:** a human creator (possibly the owner) willing to own creative vision while ODG operates
  the text/planning/governance spine.
- **Evidence a need exists:** DOCTRINE (Master V5 dedicates §248–255 to it) + the general creator-tooling
  market (HYP — not quantified here). **No validated external demand signal yet.**
- **Possible solution:** an ODG "production spine" — research→script→shot-plan→provenance→cost — with human
  creative gates and external media tools bolted on later.
- **ODG capabilities needed:** Spec Author + Local Provider (proven infra; script-authoring TO-TEST), Truth
  Layer/provenance (proven substrate), economics (proven). Media generation = external, not present.
- **Value & confidence:** potential = unknown/speculative; confidence in *demand* = LOW (no market proof);
  confidence in *ODG executing the text-spine step* = MEDIUM (infra proven, output quality unproven).
- **Effort/cost/deps:** experiment = low (internal, no spend). Full channel = high (media tools + human
  creative time + rights). Dependency: external media providers + their authorization/budget/rights.
- **Risks/rights/authorizations:** rights (clips/music/voice/AI-disclosure); platform ToS; **no spend/publish
  without explicit owner authorization**; creative acceptance is HUMAN-mandatory (§248).
- **Minimal experiment:** §6 above (script+plan+provenance for one dogfood short; human-rated).
- **Acceptance criterion:** human rates the artifact "usable with ≤minor edits" AND every claim is
  provenance-traced.
- **Next executable mission:** `CINEMA_SCRIPT_SPINE_PROBE_V1` — sandboxed, read-only-to-repo, no publish/spend;
  ODG authors one dogfood explainer script+shot-plan+§252 provenance record; human creative gate rates it.
- **Decision owner:** VPS/project owner (go/no-go on the experiment; and separately on any future media spend,
  external tool integration, or publication).

## Verdict (does Mission Cinéma merit a real ODG campaign?)

**Not yet as a production/commercial campaign — YES as one bounded, no-cost internal probe.** The doctrine is
real and ODG owns a genuine, differentiated *operational* spine (provenance + economics + governance), but the
*audiovisual* half is entirely absent and demand is unproven. Spinning up a full cinema Industry Pack now would
be building on an unvalidated hypothesis with the most expensive, rights-riskiest parts (media generation)
unsolved. The disciplined move is the **§6 minimal experiment**: cheaply confirm or falsify the ONE thing that
is both useful and in-capability — "can ODG produce a reviewer-acceptable, fully-provenanced script+plan?" —
before any media spend, external integration, or publication is even considered.
