# ODG Capability-Build Plan (film orchestration) — override V2 §7

Build ODG's missing film-orchestration capabilities by EXTENDING proven components (no duplicates). Each row:
reuse → missing part → effort → deps → acceptance test. Native = ODG code; external = generation services.

| Capability | Reuse (proven) | Missing part | Effort | Deps | Acceptance test |
|---|---|---|---|---|---|
| Cost-aware tool routing | economic/unit-economics modules | per-task tool+price map + chooser | S | tool price table | given a shot spec, selects the cheapest tool meeting its quality tier (unit test) |
| Shot & asset ledger | mission-ledger + evidence-provenance | media-asset schema (shot_id/scene_id/version/prompt/cost/status) | M | — | every generated asset has a ledger row w/ provenance (reproducible) |
| Character/env continuity register | evidence-provenance (sha256) | reference-sheet store + per-shot ref linkage | M | image tool | a shot without a linked locked ref is flagged (test) |
| Prompt + generation versioning | ledger | prompt/seed/params record + diff | S | — | re-generating a shot bumps a version, keeps history (test) |
| Quality scoring + acceptance gates | **validation-engine** (fail-closed) | per-shot + per-scene criteria + gate | M | — | a seeded sub-threshold shot is BLOCKED before dependents generate (reproducible) |
| Defect classification + bounded retry | **self-diagnostic** (expected-vs-observed) | media defect taxonomy + retry cap | M | — | a defective shot → classified + retried ≤N, never scene-restart (test) |
| Budget & credit accounting | economic modules | live committed/spent/reserved/remaining ledger + hard-stop at €4,000 | S | — | a spend that would exceed €4,000 is refused (test) |
| Editing & delivery automation | Governed Bash executor | ffmpeg/DaVinci-CLI scripting (assemble/subtitle/export) | M | ffmpeg install (authz) | a shot set → a muxed, subtitled export (reproducible once tools present) |
| Provenance + rights + release checks | evidence-provenance | per-asset licence/rights field + pre-release checklist gate | S | — | an asset lacking a cleared licence blocks release (test) |
| Audience analytics + iteration | self-diagnostic (ranking) | ingest published metrics → ranked iteration proposals | M | published asset (later) | given metrics, emits a ranked title/thumbnail iteration (test) — NOT_APPLICABLE until live |

**Honest split:** all the above are ODG-NATIVE orchestration/QC/accounting built on the proven spine
(evidence-provenance / validation-engine / self-diagnostic / mission-ledger / economic). **Generation itself
(image/video/voice/music) stays EXTERNAL**; the edit/export automation needs an authorized tool install
(ffmpeg/DaVinci — a system change requiring approval). Human = creative acceptance + final QC. Build order:
budget-ledger + acceptance-gate + shot-ledger FIRST (they protect the €4,000 and prevent contamination), before
any generation is wired in.
