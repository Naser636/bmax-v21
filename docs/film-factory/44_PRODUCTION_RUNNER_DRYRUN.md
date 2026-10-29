# Autonomous Production Runner (DRY-RUN) — F10 — 2026-10-24

**Orchestrator:** ODG. **Reference:** F10 (unchanged). **Mode: DRY-RUN only.** No generation, no spend, no
install, no provider call, no subscription. Reuses `film-pipeline.mjs` primitives (no duplication). €0.

## What it is
`pipeline/production-runner-f10.mjs` + tests `production-runner-check.mjs` (**24/24**). An ODG-owned end-to-end
chain that, in dry-run, exercises the whole production path over the active F10 registers and the shared bible —
so that the moment gate `12` is granted, ODG runs it itself (no technical work handed to the CTO).

## Stages (each traced, with explicit status)
`load` (registers + voice bible + continuity) → `plan` (420 tracked shots, dependencies, €452.10 ESTIMATE ≤ cap,
committed/spent 0) → `generate.real` **BLOCKED** (gate 12) + `generate.simulated` **FIXTURE** (file=null, €0) →
`acceptance.simulated` **FIXTURE** (fail-closed gate over fixtures; dependents unlocked only when prereq accepted)
→ `select` **FIXTURE** → `assembly.plan` (49-scene conductor: dialogue/music/transitions/durations; generatedOutput
1628 s) → `postops.plan` (edit/compositing/wound-&-blood-continuity/colour/subtitles/mix — all **PLANNED**, OSS $0)
→ `export` **BLOCKED** (no real file → `exportDurationGate` fail-closed) → `release` **BLOCKED** (refs TO_CREATE,
no real media).

## Safety guarantees (tested)
- **Structurally cannot spend/install/call a provider:** no network code, no `ledger.spend()` in the runner;
  every external capability passes `requireAuth()` and is OFF by default (gate 12 ungranted) → explicit **BLOCKED**.
- **No false success:** `generate.real`, `export`, `release` are BLOCKED; `filmProduced=false`,
  `exportValidated=false`, `mediaReal=false`, `spent=€0` — and stay so until a real measured file exists.
- **Fixtures are never real media:** simulated outputs carry `{fixture:true, file:null, sha256:null}` and the report
  states fixtures are NOT real media.
- **Non-dry-run is refused** both without auth (gate 12) AND with auth (no real provider wired → no false claim).
- **F10 + registers preserved** (runner writes only `runs/dry-run-latest.json`; F10 hash unchanged in tests).

## The single external authorization to go live (gate `12`)
Prerequisites: (a) paid-generation authorization + provider API keys (≤€250 benchmark envelope first); (b)
privileged **ffmpeg** install (export + real duration measurement); (c) host has **no GPU** → generation is via
APIs, not local. Expected evidence on going live: real media files with sha256 provenance, measured yields +
cost-per-usable-second, acceptance verdicts on real media, and a real exported 60:00±120 s file passing
`exportDurationGate`. Only (a)+(b) are asked of the CTO — the operational execution stays with ODG.

## Limits of the dry-run
It proves the chain's structure, ordering, gating, and accounting — NOT quality or runtime. No quality number, no
produced cut, no validated 60:00. Those require real media (gate 12) + human inspection.
