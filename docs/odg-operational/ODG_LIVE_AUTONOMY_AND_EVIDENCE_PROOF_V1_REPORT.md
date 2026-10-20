# ODG_LIVE_AUTONOMY_AND_EVIDENCE_PROOF_V1 — Consolidated Report

**Mission type:** real internal operational mission (local, no spend, no external effect). **No code change** (§6).
**Date:** 2026-10-20. **HEAD:** `efcccc8` (unchanged by the runs — only gitignored runtime artifacts were written).
**Verdict:** **PASS WITH BLOCKERS** (§Verdict).

This report deliberately separates **(A) really-observed LIVE events**, **(B) synthetic tests (labeled)**,
**(C) proven conclusions**, and **(D) uncertainties / blockers**. Nothing is fabricated; where a measure is not
obtainable it is stated as NOT_MEASURABLE / INSUFFICIENT_EVIDENCE, never as a number.

## Truth Lock
HEAD `efcccc8`, branch `main` synced with origin, worktree clean on entry, 5 stashes intact, protected zones
untouched. Compass entry-point `@3d1ce76` (consistent 1-commit lag). All runtime writes landed in gitignored
`runtime/generated/**` (verified ignored).

---

## A. Really-observed LIVE events

### A1 — ODG executed a real mission end-to-end through its own 13-stage pipeline
Command: `bash runtime/bin/odg-local-pipeline.sh AUDIT_THE_RUNTIME_STATE` (a read-only runtime self-audit;
`requires_engineering:false`, `authorized_paths:[]`, capability `self-diagnostic`).

| LIVE metric | Observed value |
|---|---|
| Mission ID | `AUDIT_THE_RUNTIME_STATE` |
| Start / End | 2026-10-20T11:09:00Z → 11:09:34Z |
| Total wall duration | **34,130 ms** (includes the TS-runtime ensure/build pre-flight) |
| Stages **executed** (10) | Mission Interpreter (203ms), Mission Loader (213), Execution Planner (174), Capability Registry (277), Knowledge Engine (362), Fleet Bridge (235), Decision Engine (213), Patch Engine (208), Patch Executor (238), **Validation Engine (256, FAIL)** |
| Stages **NOT executed** | the post-validation stages (artifact finalization / ledger record) — the pipeline STOPPED at the Validation Engine gate |
| Retries | 0 (single pass) |
| Runner verdict | **BLOCKED, validated=false** — coverage OK (1/1), gates build=tsc=true, but `Objective recorded as a no-op without evidence (RECORDED): AUDIT_THE_RUNTIME_STATE_1` |
| Independent verification | ODG's **Validation Engine** is the independent verifier; it refused to validate (no evidence bound to the objective). No false success. |
| Final ledger status | **NOT recorded** (ledger `count` unchanged 1265→1265) — the proven-gate correctly refused an UNPROVEN mission |
| Recovery duration | n/a — no recovery invoked (build/tsc already green) |
| Compass checkpoint | recorded `lastMission=AUDIT_THE_RUNTIME_STATE status=BLOCKED acceptanceMet=false`; **`verifiedCheckpoint` untouched (still `M0000`)** — a BLOCKED mission did not advance the verified checkpoint |
| Evidence provenance | `runtime/generated/mission-report.json` + `runtime/generated/runtime-verify.json` |

**Discrepancy observed (execution vs recording):** the single-mission front-door (`odg-local-pipeline.sh`
→ `odg-run.js`) does **not** write to the attempt-log (`mission-attempts.jsonl` stayed 114). The attempt-log
is fed only by the autonomy-loop route (`src/runtime/autonomy-runtime-adapter.ts`). So for a pipeline-run
mission the record-of-run lives in the compass-checkpoint + mission-report, **not** the attempt-log. This is
a real observability gap (listed in §D).

### A2 — ODG executed its evidence runner on the ODG-local repo (useful operational task, completed)
Command: `node runtime/bin/odg-evidence-pack.js --repo /home/ubuntu/bmax-v21 --sign --out <scratch>/pack.json`.

| LIVE metric | Observed value |
|---|---|
| Mission / attempt ID | `ODG_LIVE_EVIDENCE_AUDIT_1792494655` |
| Start / End | 2026-10-20T11:10:55.000Z → 11:10:55.290Z |
| Duration | **290 ms** |
| Runner verdict | exit 0 — CycloneDX SBOM of **489** npm components, in-toto attestation, ed25519-signed, self-verify OK |
| **Independent verification** (separate process, re-reading the subject's `package.json` bytes itself) | **ok=true** — "verified (signature + subject digest + SBOM rebind)" |
| Gaps surfaced (not masked by the signature) | SLSA L2 gap; AI-Act readiness NOT_ASSESSED; robustness NOT_ASSESSED |
| Evidence provenance | `sourceCommit=efcccc8…`, sbom=489 components, ed25519 signature + embedded publicKey |
| Key safety (§2) | the signing key was **ephemeral** (generated in-process, discarded); the written pack contains **no private key** (grep `PRIVATE KEY` = 0) |
| Attempt-log final status | **RECORDED** via the real `mission-attempt-log` mechanism (total 114→115); read-back coherent (outcome RECORDED, durationMs 290) |

### A3 — LIVE autonomy measurement (the §3 / §X.9 question)
Ran `autonomy-rate.buildAutonomyRate` on the **real** post-run artifacts (`patch-execution.json`,
`mission-plan.json`, `objective-attribution.json` from the A1 run):

- **As-is: `measurable:false`** — reason `eligibility declarations incomplete: missing [AUDIT_THE_RUNTIME_STATE_1]`.
  The pipeline's objective carries no `.authorization`, so the honest LIVE autonomy stays **NOT_MEASURABLE**.
  **No percentage was fabricated.**
- **Capability check (computed in memory, NOT written to disk):** applying Lot A `objective-authorization.stampObjectives`
  to those same objectives makes the measure computable → denominator 1, numerator 0, **autonomyPercent 0%**,
  `NOT_EXECUTED=1`. This proves Lot A closes the measurability gap, and the honest result for this real run is
  **0%** (the no-evidence objective is correctly not counted as autonomous). The stamped plan was deliberately
  **not persisted** — writing it would fabricate measurability the pipeline did not actually produce.

---

## B. Synthetic tests (labeled synthetic — isolated, no real effect)
Tamper tests on the A2 pack (in-memory copies; the real pack untouched):

| # | Tamper | Result |
|---|--------|--------|
| S1 | artifact bytes replaced | verify **FAILS** — "artifact digest mismatch (tampered subject)" |
| S2 | SBOM component injected | verify **FAILS** — "SBOM digest inconsistent with attestation" |
| S3 | ed25519 signature bytes flipped | verify **FAILS** — "invalid signature" |
| S4 | `signature.payloadSha256` echo field altered | verify still OK — **honest finding:** that field is informational; verification recomputes the digest from the attestation itself (proven by S2). It is **not load-bearing**; the real tamper-evidence (content + signature) holds. |

---

## C. Proven conclusions
1. ODG orchestrated a real mission end-to-end through its own pipeline (10 stages executed, real timings) and
   its **Validation Engine independently refused** to declare success for a no-evidence objective — **no false
   completion**, confirmed on a genuine LIVE run (not a unit fixture).
2. A BLOCKED mission **did not advance** the verified checkpoint and **produced no ledger entry** — the
   anti-false-advance and proven-gate guarantees hold LIVE.
3. ODG's evidence runner produced a **re-verifiable, tamper-evident** CRA+AI-Act evidence pack on the ODG repo,
   **independently verified in a separate process**; the signature does **not** mask content gaps (NOT_ASSESSED /
   SLSA-L2 gap surfaced on a signed pack); no private key was exposed or persisted.
4. The run was **recorded** via the existing attempt-log mechanism; read-back is coherent with the real outcome.
5. Lot A's authorization-stamping is the exact missing link that would make LIVE autonomy measurable, and on a
   real no-evidence run it yields an **honest 0%** — not an inflated number.

## D. Uncertainties / blockers (honest)
1. **LIVE autonomy is NOT_MEASURABLE in production** until the execution-planner stamps `objective.authorization`
   on emitted `mission-plan.json`. Lot A provides the capability; it is **not yet wired into the planner**. (No
   code change here per §6 — proposed as the next chantier.)
2. **Generic audit missions BLOCK on evidence-binding** (objective RECORDED-no-evidence) — consistent with the
   documented reality that generic missions can't self-complete without an authorized engineering provider.
3. **Attempt-log not fed by the single-mission front-door** — only the autonomy-loop route records attempts; a
   pipeline-run mission is recorded in the compass-checkpoint + mission-report instead. Observability gap.
4. **One mission is not statistically significant** — the MISSION_LATENCY / autonomy SLO stays
   INSUFFICIENT_EVIDENCE (no provenanced target declared either). Not a measurable SLO yet.
5. **SLSA L2** remains blocked (no managed/keyless keys — L1 + signing mechanism only).

## Learning persistence (§5)
The learning — *"LIVE autonomy stays NOT_MEASURABLE until the planner stamps objective.authorization; Lot A
`stampObjectives` makes it measurable, yielding an honest 0% on a no-evidence mission"* — is persisted in this
committed report (discoverable under `docs/odg-operational/`). ODG's `patch-memory` was **inapplicable** (it
requires non-empty `edits`; this is a diagnostic insight, not a replayable patch — no fake edit was injected);
`knowledge-engine` regenerates a whole snapshot, not an insight log. Graded by the existing `learning-chain`
classifier: state **PERSISTED** (→ DISCOVERABLE once committed). **NOT declared EFFECTIVE** — there is no
measured before/after gain (the fix is not applied).

## Verdict: **PASS WITH BLOCKERS**
ODG really executed a mission end-to-end through its own pipeline and its evidence runner; results were
independently verified (Validation Engine refusal + separate-process pack verification); the run was recorded in
the existing mechanisms; LIVE metrics were obtained; and the autonomy measure is honestly NOT_MEASURABLE as-is
(provably 0% if objectives were stamped). The blockers in §D are real dependencies, not failures.

**Next justified technical chantier (evidenced by this run, proposed — not executed):** wire
`objective-authorization.stampObjectives` into the execution-planner's `mission-plan.json` emission so LIVE
autonomy becomes measurable in production, and feed the single-mission front-door into the attempt-log. Both are
small and directly supported by the evidence above. Deploy / watchdog / commercial actions remain out of scope.

**STOP.** No automatic chaining to watchdog, commercial prospection, or public deployment.
