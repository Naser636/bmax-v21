# V12.4 — V37 LOT D: Radar strategic gap analysis (LOCAL campaign) 2026-11-10

CTO V37 = LOCAL-ONLY campaign (no push/fetch/VPS; local commits only). LOT D strengthens the EXISTING Radar (no 2nd Radar)
with the judgement §5 asks for. Preservation: 5 stashes / 6 untracked intact; tracked tree was clean at start.

## Capability — `radar-gap-analysis.ts` (PURE, fail-closed, gate suite)
Composes frontier-radar / roadmap-manager (discovery ≠ authorization) + capability-map (ODG's real inventory).
`analyzeOpportunity(opportunity, capabilities)` classifies a discovered method: **ALREADY_AVAILABLE** (fully covered ⇒ not
proposed), **REDUNDANT** (mostly overlaps ⇒ no decorative addition), **IMPROVEMENT** (a demonstrated enhancement of a named
existing capability ⇒ proposable as an enhancement, not a new engine), **USEFUL_NEW** (demonstrated + not covered ⇒
proposable), **INSUFFICIENTLY_DEMONSTRATED** (no evidence ⇒ a claim is not a proof, never promoted). `toProposal` yields a
PROPOSED record (authorized:false, grants no permission) — **never self-authorizes**. `radarSelfEvaluation` measures the
Radar's OWN relevance (useful vs redundant/undemonstrated/integrated), **not proposal volume**.

## Falsifications caught
undemonstrated ⇒ INSUFFICIENTLY_DEMONSTRATED · fully-covered ⇒ ALREADY_AVAILABLE · mostly-overlap ⇒ REDUNDANT · explicit
improvement ⇒ IMPROVEMENT (precedence over "covered") · new+demonstrated ⇒ USEFUL_NEW · eligible ⇒ PROPOSED authorized:false
· ineligible ⇒ no proposal · self-eval measures relevance not volume.

## Scope / provenance (LOCAL campaign ladder)
`radar-gap-analysis` : REGISTERED + CONNECTED (composes Radar + capability-map) + CALLABLE (local gate) + EXECUTED +
**VERIFIED (local gate)**. NOT DEPLOYED/OPERATIONAL. Provider-authored framework (classification control-logic). This
work is LOCAL ONLY — committed to the local branch, NOT pushed, NOT on origin/main, NOT on the VPS.
