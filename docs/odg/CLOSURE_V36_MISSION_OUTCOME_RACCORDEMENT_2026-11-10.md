# V12.4 — V36: Mission lifecycle → outcome ledger raccordement (real, failure-inclusive source) 2026-11-10

CTO V36: owner delegation (2026-11-10) authorizes continuous internal engineering lot-after-lot. Priority §3 delivered:
the raccordement between the canonical mission verdict and the mission-outcome-ledger, demonstrated on REAL data producing
a real FAILURE — the unbiased calibration source the V34/V35 audit required. V31–V35 preserved, not interrupted.

## Delegation (recorded as external authority)
The owner's general delegation (internal audits, improvements, new capabilities on a demonstrated gap, tests/benchmarks,
reversible private integration, roadmap updates) is recorded. It NEVER permits bypassing a permission, self-authorization,
spend, public exposure, SSH/admin changes, deletion, Docker, or Truth-Lock/9-primitives bypass (§7). Discovery stays open;
owner-reserved actions stay out of delegation.

## §3 — Raccordement — `runtime/core/mission-outcome-recorder.ts` (PURE, fail-closed, gate suite)
The canonical per-attempt verdict is the governed pipeline's `mission-report.json` ({mission, validated, status}) —
produced by the Validation Engine (the INDEPENDENT verifier), which emits real FAILUREs. `deriveOutcome(report)` maps it
fail-closed: validated+SUCCESS ⇒ SUCCESS; FAILED/validated:false ⇒ FAILURE; BLOCKED ⇒ BLOCKED (not a technical failure);
CANCELLED/SKIPPED/DEFERRED ⇒ their kind; unknown/absent ⇒ UNKNOWN (never a silent success). `recordFromReport` composes
`mission-outcome-ledger.recordOutcome` — append-only, deduped by (missionId, attempt), independentlyVerified only when the
governed boolean verdict decided SUCCESS/FAILURE (never the generator's self-report). No parallel memory; no estimate; no
authorization; history never rewritten.

## Demonstration on REAL data (§3, VPS execution artifact)
The real `runtime/generated/mission-report.json` = `{mission:"TEST_CONSEQUENTIAL_EXEC_GATE", validated:false,
status:"FAILED"}`. The recorder derived **FAILURE** (independentlyVerified:true) and recorded it. **This proves the
governed pipeline DID produce a real failure** — the verdict source is failure-inclusive and unbiased, unlike the
closure-register (0 failures, V34). A verdict-derived sample of 15 success / 10 failure runs through calibration ⇒
**CALIBRATED** (bias removed), still authorizing nothing.

## Falsifications caught
SUCCESS/FAILURE/BLOCKED/UNKNOWN mapping · no-mission-id ⇒ rejected · unverified-verdict ⇒ independentlyVerified:false ·
duplicate (missionId,attempt) ⇒ deduped · failure-inclusive sample ⇒ CALIBRATED but never authorizes.

## Integration ladder (HONEST — §6, "not operational just because the gate passes")
`mission-outcome-recorder` : REGISTERED + CONNECTED (composes the ledger; reads the real verdict) + CALLABLE (gate) +
EXECUTED (on the real mission-report.json, deriving a real FAILURE) + **VERIFIED** (falsifications + real-data derivation).
- **DEPLOYED/OPERATIONAL (emitting from EVERY live run) = NOT yet claimed.** The bounded, additive, reversible hook is a
  single `recordFromReport(...)` call at `odg-run`'s closure (where `mission-report.json` is written). It is **identified +
  ready** but NOT wired into the critical execution path in this gate-only turn (to avoid risking the pipeline/CI without a
  dedicated reversible integration pass). Honestly: the raccordement capability is proven on real data; the always-on emit
  is the next bounded authorized step.

## Provenance & security
`mission-outcome-recorder.ts` + test = provider-authored framework (verdict-mapping control-logic deterministic + fail-
closed). §7 restrictions intact (Truth Lock, 9 primitives, permissions, private VPS, SSH:22 only, edg-core loopback, no
spend/secret/exposure/Docker; no auto-delegation; FDIR-live NOT activated; Program C stays PROPOSED).

## Boussole + continuation (per the delegation, §4/§9)
Register reconciled (new item `serie30-v36-mission-outcome-raccordement`). HEAD=origin/main=`cb0baa6`. Under the delegation,
the next authorized lot is **LOT C — intelligent multi-métier coordination** (improve metier-parcours: dynamic subset
selection, dependency ordering, cross-verification, measured collaboration gain), without reopening the closed V17–V23
qualification. Proceeding to LOT C.
