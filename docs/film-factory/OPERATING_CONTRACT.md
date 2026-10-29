# ODG — La Porte du Soleil — PERMANENT OPERATING METHOD

> **Canonical, auto-loaded operating contract for the film project.** The CTO does not need to
> restate this in future sessions. It is an *execution interface* subordinate to the Master (FROZEN),
> the Runtime Constitution, the CTO Directives and `ODG_AUTONOMOUS_WORK_PROTOCOL.json` — on any
> disagreement, those win. It governs the self-contained film workflow under `docs/film-factory/`
> (the engineering runtime in `runtime/` / `src/` does not touch these files).

Machine SSOT: [`pipeline/operating-contract.json`](pipeline/operating-contract.json) ·
Executable method: [`pipeline/operating-contract.mjs`](pipeline/operating-contract.mjs) ·
Resume entry point: [`pipeline/session-resume.mjs`](pipeline/session-resume.mjs) ·
Learning ledger: [`pipeline/f11-production-learning-ledger.json`](pipeline/f11-production-learning-ledger.json) ·
Regression proof: [`pipeline/operating-contract.test.mjs`](pipeline/operating-contract.test.mjs).

## How to resume (every new session / mission / recovery)

```
node docs/film-factory/pipeline/session-resume.mjs
```

This loads the contract, recovers the last verified checkpoint, **reconciles the compass against the
real ledgers (reality wins)**, verifies F10 is frozen byte-for-byte, lists completed assets that must
not be regenerated, and prints the exact next action from the compass pointer. Then: verify repo
HEAD/branch/worktree, pick the next dependency-ready action from the timeline SSOT, and run its
preflight guards before any paid call.

## Invariants (INV-1…INV-10 — enforced, not aspirational)

1. **ODG owns** end-to-end orchestration + continuous improvement; providers execute only bounded, authorized tasks.
2. The film is produced through **one chronological, scene-linked master timeline** — `canon/F11_PROPOSED/f11-film-timeline.json` is SSOT.
3. Every asset has a **purpose, scene assignment, continuity constraints, acceptance criteria and a cost record**.
4. **No paid generation** without a preflight check, a known worst-case exposure and an authorized budget.
5. **F10 is immutable** (SHA256SUMS verified each resume). F11 changes are traceable and respect approval gates.
6. Final distribution is **FIXED at 64/13/10/5/5/3** and **measured on the rendered edit**, never claimed from estimates, never renormalized.
7. **Quality, licensing and actual evidence** take precedence over optimistic reporting.
8. Every interruption/exit **updates the compass** with a verified next action.
9. **Every future invocation auto-loads this contract** (via `session-resume.mjs` / `operating-contract.mjs`).
10. The active production cap is the **t1 ledger ceiling (€15)**. A forecast (€130 / €167–401) is **NOT** authorization.

## Closed-loop learning (directive §3)

`f11-production-learning-ledger.json` (schema v2) carries, per lesson, an executable `guard`:

- **BLOCK** — refuses the paid call before it is issued (e.g. PL-2 seedance+Björn-face → E005; PL-9 child-in-peril).
- **WARN** — allows but surfaces the correction (e.g. PL-3 undersized greatsword; PL-4 costume drift).
- **RECOVERY** — a non-generation protocol for a named event (e.g. PL-5 timeout → reconcile read-only, keep the reservation, never blind-retry).

`operating-contract.mjs` evaluates these guards. **`campaign-runner.mjs` invokes them on every shot**
before `adapter.generate` — a BLOCK-class lesson records `PREFLIGHT_BLOCKED` with **no spend**. A lesson
is only "complete" once a regression test proves the workflow applies it and prevents recurrence
(see the operating-contract test, §(3)/§(4)). A failed fix **reopens** its incident.

## The single preflight gate (every paid call)

`preflightForGeneration(op)` refuses the call unless **all** hold: (a) the shot has a timeline position +
purpose + acceptance test; (b) no BLOCK-class lesson fires; (c) worst-case exposure fits the authorized
cap and an attempt remains. Authorization is owned by the `PersistentLedger` (reserve-before-call,
halt-before-cap); the contract verifies a finite cap is wired and layers the lesson guards on top.

## Compass exit contract (directive §9)

Every mission exit (including a BLOCKED exit) writes a compass entry satisfying `exitRecordSchema`:
`truthLock, spentEur, remainingEur, attemptsLeft, f10Frozen, nextAction, evidence`. `nextAction` must be
a **concrete, dependency-ready** operation — never "continue". `validateExitRecord()` enforces this.

## What is enforced vs. what remains human

- **Enforced in code + tests:** recovery/resume, spend reconciliation, F10 immutability check, lesson
  guards (BLOCK/WARN/RECOVERY), authorization cap + attempt cap, timeline-position requirement, exit-record validity.
- **Human/CTO gates (not automatable):** F11 creative acceptance (editorial footprint, INC-1=B, re-gendering);
  full-motion cinematic acceptance of each clip (≥7.5/10); any tranche authorization beyond €15; final
  distribution sign-off measured on the rendered edit.

## Scope note

The engineering runtime (`odg-run.ts`, `mission-cli.ts`, `checkpoint-engine.ts`, `compass-update.ts`) has a
parallel, mature governance/checkpoint stack for *engineering* missions. The film workflow is deliberately
self-contained here; this contract mirrors the runtime's proven patterns (fail-closed, sha provenance,
reserve-before-cap ledger) without forking engineering architecture (directive §10: no unrelated scope).
