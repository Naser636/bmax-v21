# Reusable Film Factory (Mission 2) — story-independent components — 2026-10-24

Goal: never pay/redo the same prep each film. Components are STORY-INDEPENDENT (schemas + gates); only their
filled VALUES are story-dependent. **No asset (visual/audio) is claimed to exist — these are structures + tests.**

## Components (`templates/schemas.json`, 10) — reusable structure vs story-dependent values
character-profile · location · visual-charter · prompt-spec(+versioning) · rights/provenance · generation-log
(accepted/rejected) · budget-forecast(+cost-per-usable-second) · acceptance-criteria(image/video/voice/music/sfx)
· post-production(edit bins/audio-check/export spec) · **validation-gates** (implemented + tested in
`pipeline/film-pipeline.mjs`: BudgetLedger, acceptanceGate, dependentsUnlocked, classifyDefect, retryPlan,
continuityCheck, rightsReleaseCheck, runtimeEstimate, editPlanCheck, releaseGate, exportDurationGate).
Each schema lists its `storyDependentFields` (the values to fill per film) vs the reusable structure.

## Proof of reuse (`templates/templates-reuse-test.mjs`) — PASS 9/9
Instantiated a DIFFERENT film — **"Neon Harvest"** (sci-fi; characters KAI/RIA; location ORBITAL FARM) — from the
schemas and ran the gates on it: budget-cap refusal, acceptance-gate, continuity flag, rights block, export
fail-closed all work. Asserted **zero La Porte du Soleil content** in both the schemas and the fictional instance.
⇒ the factory is genuinely story-independent and does not drag La Porte's characters/locations into a new project.

## Honest scope
These are TEMPLATES + TESTS (prep/infrastructure), not media. Reusing them on a real new film still requires that
film's own authorized generation (tools + spend). The value: continuity/profile/charter/prompt/rights/log/budget/
acceptance/post schemas + the validation gates are built once and reused, saving re-preparation per project.
