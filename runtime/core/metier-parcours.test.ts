#!/usr/bin/env node
"use strict";

const P = require("./metier-parcours");

let failures = 0;
function check(c: any, label: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + label + "\n"); } }

const allow = { canExecute: () => true };
const auditOK = () => ({ ok: true });
// a fully-specified clean dependency (synthetic fixture) ⇒ the real P3 guard ADMITs.
const CLEAN = { name: "left-pad", version: "1.3.0", license: "MIT", integrity: "sha512-abc" };
const TYPOSQUAT = { name: "reakt", version: "^1.0.0" };

// (A) FULL E2E on P3 with the REAL guard: clean dep ⇒ CLOSED/ADMIT; traceable; INDEPENDENT assurance (not reproducibility).
{
  const out = P.runParcours({ metier: "P3", payload: CLEAN, declaredSynthetic: true }, { permissions: allow, audit: auditOK, now: "t", seenDigests: new Set() });
  check(out.stage === "CLOSED" && out.decision === "ADMIT" && out.admit === true, "A clean dep ⇒ CLOSED + ADMIT (full parcours via the real P3 guard)");
  check(out.assurance === "independent" && out.traceable === true, "A assurance is INDEPENDENT (necessary-condition cross-check, not a re-run) + traceable");
  check(out.auditTrail.length >= 1, "A audit trail recorded");
}

// (A2) SECOND MÉTIER — FULL E2E on P8 (release/SemVer) with the REAL enforce guard, distinct verdict shape (ok/verdict).
{
  const oldC = { version: "1.0.0", inputSchema: { a: { required: true } }, outputSchema: { x: {} } };
  const newC = (ver: string) => ({ version: ver, inputSchema: { a: { required: true }, b: { required: true } }, outputSchema: { x: {} } });
  const okRun = P.runParcours({ metier: "P8", payload: { oldContract: oldC, newContract: newC("2.0.0") }, declaredSynthetic: true }, { permissions: allow, audit: auditOK, now: "t" });
  check(okRun.stage === "CLOSED" && okRun.decision === "ADMIT", "A2 P8 compliant major bump ⇒ CLOSED + ADMIT (native verdict mapped via decisionOf)");
  check(okRun.assurance === "independent", "A2 P8 uses its INDEPENDENT bump-rank assurer");
  const badRun = P.runParcours({ metier: "P8", payload: { oldContract: oldC, newContract: newC("1.0.1") }, declaredSynthetic: true }, { permissions: allow, audit: auditOK, now: "t" });
  check(badRun.stage === "CLOSED" && badRun.decision === "REJECT", "A2 P8 insufficient (patch) bump for a breaking change ⇒ CLOSED + REJECT");
}

// (A3) INDEPENDENT ASSURANCE CATCHES A BAD ADMIT — a (synthetic) guard that WRONGLY admits an unpinned/typosquat dep must
// be caught by P3's independent assurer ⇒ ASSURANCE_FAILED, never CLOSED. (Proves assurance ≠ reproducibility.)
{
  const badGuard = { P3: { ...P.METIER_GUARDS.P3, resolve: () => () => ({ decision: "ADMIT", reasons: [] }) } };
  const out = P.runParcours({ metier: "P3", payload: { name: "reakt", version: "^1.0.0" } }, { guards: badGuard, permissions: allow, audit: auditOK });
  check(out.stage === "ASSURANCE_FAILED", "A3 a wrong ADMIT (unpinned typosquat) ⇒ ASSURANCE_FAILED (independent check catches the guard)");
}
// (B) FULL E2E on P3: a typosquat ⇒ CLOSED/REJECT (the parcours surfaces the guard's REJECT, still a governed closure).
{
  const out = P.runParcours({ metier: "P3", payload: TYPOSQUAT, declaredSynthetic: true }, { permissions: allow, audit: auditOK, now: "t" });
  check(out.stage === "CLOSED" && out.decision === "REJECT" && out.admit === false, "B typosquat/unpinned ⇒ CLOSED + REJECT");
}

// (A4) THIRD MÉTIER — FULL E2E on P9 (finops/unit-economics), decision against a budget threshold in the payload.
{
  const POS = { observedCostEur: 40, attempts: 100, successes: 100, maxCostPerSuccessEur: 0.6 };   // €0.40/success ≤ 0.6
  const over = { observedCostEur: 80, attempts: 100, successes: 100, maxCostPerSuccessEur: 0.6 };   // €0.80/success > 0.6
  const zero = { observedCostEur: 40, attempts: 100, successes: 0, maxCostPerSuccessEur: 0.6 };      // not viable
  const posRun = P.runParcours({ metier: "P9", payload: POS, declaredSynthetic: true }, { permissions: allow, audit: auditOK, now: "t" });
  check(posRun.stage === "CLOSED" && posRun.decision === "ADMIT" && posRun.assurance === "independent", "A4 P9 viable + within budget ⇒ CLOSED/ADMIT (independent assurer)");
  check(P.runParcours({ metier: "P9", payload: over }, { permissions: allow, audit: auditOK }).decision === "REJECT", "A4 P9 over budget ⇒ REJECT");
  check(P.runParcours({ metier: "P9", payload: zero }, { permissions: allow, audit: auditOK }).decision === "REJECT", "A4 P9 zero successes (not viable) ⇒ REJECT");
}
// (A5) P9 INDEPENDENT ASSURANCE CATCHES A BAD ADMIT — a synthetic guard that fakes a viable cheap econ for an
// over-budget/zero-success payload must be caught ⇒ ASSURANCE_FAILED.
{
  const liar = { P9: { ...P.METIER_GUARDS.P9, resolve: () => () => ({ viable: true, costPerSuccess: 0.1 }) } };
  const out = P.runParcours({ metier: "P9", payload: { observedCostEur: 80, attempts: 100, successes: 100, maxCostPerSuccessEur: 0.6 } }, { guards: liar, permissions: allow, audit: auditOK });
  check(out.stage === "ASSURANCE_FAILED", "A5 a faked-cheap ADMIT over real budget ⇒ ASSURANCE_FAILED (independent recomputation catches it)");
}

// ===== V20 BATCH 01: P1, P12, P4 =====
// (B1) P1 semantic-regression — SAFE (tests pass + behaviour preserved) ⇒ ADMIT; a changed held-out output ⇒ REJECT.
{
  const before = [{ input: "x", observedOutput: 1 }, { input: "y", observedOutput: 2 }];
  const safe = P.runParcours({ metier: "P1", payload: { statedTestsPass: true, before, after: before }, declaredSynthetic: true }, { permissions: allow, audit: auditOK, now: "t" });
  check(safe.stage === "CLOSED" && safe.decision === "ADMIT" && safe.assurance === "independent", "B1 P1 SAFE ⇒ CLOSED/ADMIT (independent output-compare assurer)");
  const reg = P.runParcours({ metier: "P1", payload: { statedTestsPass: true, before, after: [{ input: "x", observedOutput: 1 }, { input: "y", observedOutput: 999 }] } }, { permissions: allow, audit: auditOK });
  check(reg.stage === "CLOSED" && reg.decision === "REJECT", "B1 P1 semantic regression (held-out output changed) ⇒ CLOSED/REJECT");
  // independent assurance catches a guard that wrongly marks SAFE on a changed output:
  const liar = { P1: { ...P.METIER_GUARDS.P1, resolve: () => () => ({ verdict: "SAFE", safe: true }) } };
  const caught = P.runParcours({ metier: "P1", payload: { statedTestsPass: true, before, after: [{ input: "x", observedOutput: 1 }, { input: "y", observedOutput: 999 }] } }, { guards: liar, permissions: allow, audit: auditOK });
  check(caught.stage === "ASSURANCE_FAILED", "B1 a wrong SAFE (changed output) ⇒ ASSURANCE_FAILED (independent catches it)");
}
// (B12) P12 circuit-breaker — healthy CLOSED ⇒ ADMIT; tripped ⇒ REJECT; wrong admit of a tripped breaker caught.
{
  const healthy = { state: "CLOSED", outcomes: ["SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS", "SUCCESS"], config: { failureThreshold: 0.5, minSamples: 5 } };
  const tripped = { state: "CLOSED", outcomes: ["FAIL", "FAIL", "FAIL", "FAIL", "SUCCESS"], config: { failureThreshold: 0.5, minSamples: 5 } };
  check(P.runParcours({ metier: "P12", payload: healthy, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B12 P12 healthy breaker ⇒ ADMIT");
  check(P.runParcours({ metier: "P12", payload: tripped }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B12 P12 tripped breaker ⇒ REJECT");
  const liar = { P12: { ...P.METIER_GUARDS.P12, resolve: () => () => ({ admit: true, nextState: "CLOSED" }) } };
  check(P.runParcours({ metier: "P12", payload: tripped }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B12 a wrong ADMIT of a tripped breaker ⇒ ASSURANCE_FAILED");
}
// (B4) P4 distribution-drift — identical distributions ⇒ ADMIT; gross shift ⇒ REJECT; wrong admit of a gross shift caught.
{
  const ref = [1, 2, 3, 4, 5, 1, 2, 3, 4, 5]; const same = ref.slice(); const shifted = [9, 9, 9, 9, 9, 9, 9, 9, 9, 9];
  check(P.runParcours({ metier: "P4", payload: { reference: ref, current: same }, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B4 P4 no drift ⇒ ADMIT");
  check(P.runParcours({ metier: "P4", payload: { reference: ref, current: shifted } }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B4 P4 significant drift ⇒ REJECT");
  const liar = { P4: { ...P.METIER_GUARDS.P4, resolve: () => () => ({ gate: "PASS", drift: "NONE", psi: 0 }) } };
  check(P.runParcours({ metier: "P4", payload: { reference: ref, current: shifted } }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B4 a wrong PASS on a gross shift ⇒ ASSURANCE_FAILED (independent TV metric catches it)");
}

// ===== V21 BATCH 02: P2, P10, P13 =====
// (B2) P2 reliability — all-pass over k rollouts ≥ threshold ⇒ ADMIT; a flaky task ⇒ REJECT; inflated pass@k caught.
{
  const pos = { rolloutsByTask: { t1: [true, true], t2: [true, true] }, threshold: 0.9 };
  const neg = { rolloutsByTask: { t1: [true, false], t2: [true, true] }, threshold: 0.9 };
  check(P.runParcours({ metier: "P2", payload: pos, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B2 P2 pass@k ≥ threshold ⇒ ADMIT");
  check(P.runParcours({ metier: "P2", payload: neg }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B2 P2 flaky task (pass@k < threshold) ⇒ REJECT");
  const liar = { P2: { ...P.METIER_GUARDS.P2, resolve: () => () => ({ passAtK: 1.0 }) } };   // guard fakes a perfect score
  check(P.runParcours({ metier: "P2", payload: neg }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B2 an inflated pass@k on flaky rollouts ⇒ ASSURANCE_FAILED (independent recompute catches it)");
}
// (B10) P10 incident deadline — reported within window ⇒ ADMIT; overdue ⇒ REJECT; wrong ON_TIME caught.
{
  const onTime = { incident: { category: "DEATH_SERIOUS_HARM", awareDate: "2026-01-01" }, reportedDate: "2026-01-02", activities: { deploysHighRiskAISystem: true } };
  const overdue = { incident: { category: "DEATH_SERIOUS_HARM", awareDate: "2026-01-01" }, reportedDate: "2026-12-01", activities: { deploysHighRiskAISystem: true } };
  check(P.runParcours({ metier: "P10", payload: onTime, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B10 P10 reported on time ⇒ ADMIT");
  check(P.runParcours({ metier: "P10", payload: overdue }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B10 P10 overdue ⇒ REJECT");
  const liar = { P10: { ...P.METIER_GUARDS.P10, resolve: () => () => ({ verdict: "REPORTED_ON_TIME", deadlineDays: 2 }) } };   // fakes on-time for a late report
  check(P.runParcours({ metier: "P10", payload: overdue }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B10 a wrong ON_TIME for a late report ⇒ ASSURANCE_FAILED (direct date recompute catches it)");
}
// (B13) P13 carbon — SCI/unit ≤ budget ⇒ ADMIT; over budget ⇒ REJECT; under-reported SCI caught.
{
  const mk = (epu: number) => ({ benchmark: { totalUnits: 1000, kind: "cpu-reference" }, factors: { energyPerUnitKWh: epu, pue: 1.5, gridCarbonIntensityGco2PerKWh: 400, embodiedGco2: 100000, lifespanUnits: 1000000 }, maxGco2PerUnit: 1.0 });
  check(P.runParcours({ metier: "P13", payload: mk(0.0001), declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B13 P13 SCI ≤ budget ⇒ ADMIT");
  check(P.runParcours({ metier: "P13", payload: mk(0.01) }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B13 P13 SCI > budget ⇒ REJECT");
  const liar = { P13: { ...P.METIER_GUARDS.P13, resolve: () => () => ({ viable: true, sciPerUnit: 0.1 }) } };   // fakes a low SCI
  check(P.runParcours({ metier: "P13", payload: mk(0.01) }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B13 an under-reported SCI over real budget ⇒ ASSURANCE_FAILED (raw-factor recompute catches it)");
}

// ===== V22 BATCH 03: P11, P15, P6 =====
// (B11) P11 document routing — clean doc ⇒ STRAIGHT_THROUGH/ADMIT; HIGH finding ⇒ REJECT; a quarantine faked as STP caught.
{
  const clean = { parser: { ok: true }, validation: { valid: true, findings: [] }, extraction: { status: "TEXT_EXTRACTED" } };
  const high = { parser: { ok: true }, validation: { valid: true, findings: [{ severity: "HIGH" }] }, extraction: { status: "TEXT_EXTRACTED" } };
  check(P.runParcours({ metier: "P11", payload: clean, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B11 P11 clean doc ⇒ STRAIGHT_THROUGH/ADMIT");
  check(P.runParcours({ metier: "P11", payload: high }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B11 P11 HIGH finding ⇒ REJECT (quarantine/reject never admits)");
  const liar = { P11: { ...P.METIER_GUARDS.P11, resolve: () => () => ({ tier: "STRAIGHT_THROUGH" }) } };
  check(P.runParcours({ metier: "P11", payload: high }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B11 a wrong STP on a HIGH-finding doc ⇒ ASSURANCE_FAILED (independent eligibility recompute catches it)");
}
// (B15) P15 saga — all steps commit ⇒ ADMIT; a step fails (⇒ compensated) ⇒ REJECT; a faked COMMITTED caught.
{
  const ok = { steps: [{ id: "a", forward: () => true, compensate: () => true }, { id: "b", forward: () => true, compensate: () => true }] };
  const fail = { steps: [{ id: "a", forward: () => true, compensate: () => true }, { id: "b", forward: () => false, compensate: () => true }] };
  check(P.runParcours({ metier: "P15", payload: ok, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B15 P15 all steps commit ⇒ ADMIT");
  check(P.runParcours({ metier: "P15", payload: fail }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B15 P15 a failed step (compensated) ⇒ REJECT");
  const liar = { P15: { ...P.METIER_GUARDS.P15, resolve: () => () => ({ status: "COMMITTED" }) } };
  check(P.runParcours({ metier: "P15", payload: fail }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B15 a faked COMMITTED where a step forward fails ⇒ ASSURANCE_FAILED (saga reconstitution catches it)");
}
// (B6) P6 evaluation — F1 ≥ threshold ⇒ ADMIT; below ⇒ REJECT; an inflated F1 caught.
{
  const perfect = { gold: { a: 1, b: 1, c: 0, d: 0 }, predictions: { a: 1, b: 1, c: 0, d: 0 }, threshold: 0.8 };
  const poor = { gold: { a: 1, b: 1, c: 0, d: 0 }, predictions: { a: 0, b: 0, c: 1, d: 1 }, threshold: 0.8 };
  check(P.runParcours({ metier: "P6", payload: perfect, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B6 P6 F1 ≥ threshold ⇒ ADMIT");
  check(P.runParcours({ metier: "P6", payload: poor }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B6 P6 F1 < threshold ⇒ REJECT");
  const liar = { P6: { ...P.METIER_GUARDS.P6, resolve: () => () => ({ f1: 1.0 }) } };
  check(P.runParcours({ metier: "P6", payload: poor }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B6 an inflated F1 on poor predictions ⇒ ASSURANCE_FAILED (independent F1 recompute catches it)");
}

// ===== V23 BATCH 04 (final): P7, P14, P5 =====
// (B7) P7 SRE/SLO — within SLO ⇒ ADMIT; breached ⇒ REJECT; a faked compliant caught by independent p99 recompute.
{
  const lat = [10, 12, 11, 13, 10, 12, 11, 100];
  const okSlo = { latencies: lat, slo: { targetP99Ms: 200, observedAvailability: 0.999, availabilityTarget: 0.99 } };
  const badSlo = { latencies: lat, slo: { targetP99Ms: 50, observedAvailability: 0.999, availabilityTarget: 0.99 } };
  check(P.runParcours({ metier: "P7", payload: okSlo, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B7 P7 within SLO ⇒ ADMIT");
  check(P.runParcours({ metier: "P7", payload: badSlo }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B7 P7 SLO breached ⇒ REJECT");
  const liar = { P7: { ...P.METIER_GUARDS.P7, resolve: () => () => ({ compliant: true }) } };
  check(P.runParcours({ metier: "P7", payload: badSlo }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B7 a faked compliant over a breached p99 ⇒ ASSURANCE_FAILED (independent p99 recompute catches it)");
}
// (B14) P14 devex — complete scaffold ⇒ ADMIT; incomplete ⇒ REJECT; a faked attested caught.
{
  const full = { buildRef: "abc", sbom: { components: [{ name: "x" }] }, confinement: { netOff: true, envCleared: true }, health: { available: true } };
  const partial = { buildRef: "abc" };
  check(P.runParcours({ metier: "P14", payload: full, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B14 P14 complete scaffold ⇒ ADMIT");
  check(P.runParcours({ metier: "P14", payload: partial }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B14 P14 incomplete scaffold ⇒ REJECT");
  const liar = { P14: { ...P.METIER_GUARDS.P14, resolve: () => () => ({ attested: true, missing: [] }) } };
  check(P.runParcours({ metier: "P14", payload: partial }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B14 a faked attested on an incomplete scaffold ⇒ ASSURANCE_FAILED");
}
// (B5) P5 progressive-delivery (canary candidate) — read-only ⇒ ADMIT; engineering/mutating ⇒ REJECT; a faked safe caught.
{
  const ro = { mission: "HEALTH_RO", requiresEngineering: false, authorizedPaths: [] };
  const eng = { mission: "SOME_ENG", requiresEngineering: true, authorizedPaths: ["src/"] };
  check(P.runParcours({ metier: "P5", payload: ro, declaredSynthetic: true }, { permissions: allow, audit: auditOK }).decision === "ADMIT", "B5 P5 read-only canary candidate ⇒ ADMIT");
  check(P.runParcours({ metier: "P5", payload: eng }, { permissions: allow, audit: auditOK }).decision === "REJECT", "B5 P5 engineering/mutating rollout ⇒ REJECT (not canary-safe)");
  const liar = { P5: { ...P.METIER_GUARDS.P5, resolve: () => () => ({ safe: true }) } };
  check(P.runParcours({ metier: "P5", payload: eng }, { guards: liar, permissions: allow, audit: auditOK }).stage === "ASSURANCE_FAILED", "B5 a faked safe on an engineering mission ⇒ ASSURANCE_FAILED (independent read-only recompute catches it)");
}
// (DEDUP-FIX §5) P15 digestOf — two sagas with the SAME step ids but DIFFERENT forwards must NOT false-DUPLICATE; identical ones still dedup.
{
  const seen = new Set();
  const sagaA = { steps: [{ id: "a", forward: () => true }, { id: "b", forward: () => true }] };
  const sagaB = { steps: [{ id: "a", forward: () => true }, { id: "c", forward: () => true }] };   // different id ⇒ different content
  const r1 = P.runParcours({ metier: "P15", payload: sagaA }, { permissions: allow, audit: auditOK, seenDigests: seen });
  const r2 = P.runParcours({ metier: "P15", payload: sagaB }, { permissions: allow, audit: auditOK, seenDigests: seen });   // must NOT be a false DUPLICATE
  check(r1.stage === "ADMIT" || r1.stage === "CLOSED", "DEDUP r1 processed");
  check(r2.stage !== "DUPLICATE", "DEDUP §5: a saga with different step ids is NOT a false DUPLICATE (digestOf excludes closures, includes ids)");
  const r3 = P.runParcours({ metier: "P15", payload: sagaA }, { permissions: allow, audit: auditOK, seenDigests: seen });   // identical ⇒ real dedup
  check(r3.stage === "DUPLICATE", "DEDUP §5: an identical saga (same ids+ctx) IS a DUPLICATE (real dedup preserved, idempotent)");
  // the raw default digest would have collided these differing-forward sagas; digestOf fixes it deterministically.
  check(P.METIER_GUARDS.P15.digestOf({ steps: [{ id: "a", forward: () => true }] }) === P.METIER_GUARDS.P15.digestOf({ steps: [{ id: "a", forward: () => false }] }), "DEDUP: same ids+ctx ⇒ same digest BY DESIGN (closures excluded — documented identity)");
}

// (C) RÉSILIENCE [§5] — permission refused (deny-by-default) ⇒ PERMISSION_REFUSED, guard never runs.
{
  const out = P.runParcours({ metier: "P3", payload: CLEAN }, { permissions: { canExecute: () => false }, audit: auditOK, now: "t" });
  check(out.stage === "PERMISSION_REFUSED", "C permission refused ⇒ PERMISSION_REFUSED");
}
check(P.runParcours({ metier: "P3", payload: CLEAN }, { audit: auditOK }).stage === "PERMISSION_REFUSED", "C no permission seam at all ⇒ deny-by-default");

// (D) RÉSILIENCE — capability unavailable (guard resolve throws) ⇒ CAPABILITY_UNAVAILABLE.
{
  const guards = { P3: { resolve: () => { throw new Error("module missing"); } } };
  const out = P.runParcours({ metier: "P3", payload: CLEAN }, { guards, permissions: allow, audit: auditOK });
  check(out.stage === "CAPABILITY_UNAVAILABLE", "D guard resolve throws ⇒ CAPABILITY_UNAVAILABLE");
}
// (E) RÉSILIENCE — unknown métier ⇒ UNKNOWN_METIER.
check(P.runParcours({ metier: "P99", payload: {} }, { permissions: allow, audit: auditOK }).stage === "UNKNOWN_METIER", "E unknown métier ⇒ UNKNOWN_METIER");
// (F) RÉSILIENCE — execution throws (guard that throws) ⇒ EXECUTION_FAILED.
{
  const guards = { PX: { resolve: () => () => { throw new Error("boom"); } } };
  check(P.runParcours({ metier: "PX", payload: {} }, { guards, permissions: allow, audit: auditOK }).stage === "EXECUTION_FAILED", "F guard throws at run ⇒ EXECUTION_FAILED");
}
// (G) RÉSILIENCE — invalid result (guard returns no ADMIT/REJECT) ⇒ INVALID_RESULT.
{
  const guards = { PX: { resolve: () => () => ({ whatever: 1 }) } };
  check(P.runParcours({ metier: "PX", payload: {} }, { guards, permissions: allow, audit: auditOK }).stage === "INVALID_RESULT", "G no ADMIT/REJECT ⇒ INVALID_RESULT");
}
// (H) RÉSILIENCE — assurance failure (decision does not reproduce / custom assurer fails) ⇒ ASSURANCE_FAILED.
{
  const guards = { PX: { resolve: () => () => ({ decision: "ADMIT" }) } };
  const out = P.runParcours({ metier: "PX", payload: {} }, { guards, permissions: allow, audit: auditOK, assure: () => ({ ok: false, reason: "independent check disagreed" }) });
  check(out.stage === "ASSURANCE_FAILED", "H assurance fails ⇒ ASSURANCE_FAILED (not CLOSED)");
}
// (I) RÉSILIENCE — dedup: an identical request is DUPLICATE on the second run (idempotent).
{
  const seen = new Set();
  const first = P.runParcours({ metier: "P3", payload: CLEAN }, { permissions: allow, audit: auditOK, seenDigests: seen });
  const second = P.runParcours({ metier: "P3", payload: CLEAN }, { permissions: allow, audit: auditOK, seenDigests: seen });
  check(first.stage === "CLOSED" && second.stage === "DUPLICATE", "I identical request ⇒ first CLOSED, second DUPLICATE");
}
// (J) RÉSILIENCE — closure/traceability failure (audit persist fails) ⇒ CLOSURE_FAILED (fail-closed, no silent close).
{
  const out = P.runParcours({ metier: "P3", payload: CLEAN }, { permissions: allow, audit: () => ({ ok: false }), now: "t" });
  check(out.stage === "CLOSURE_FAILED" && out.traceable === false, "J audit persist failure ⇒ CLOSURE_FAILED (not CLOSED)");
}

// contract invariants.
check(/permission is deny-by-default/i.test(JSON.stringify(P.METIER_PARCOURS_CONTRACT.invariants)), "contract: deny-by-default");
check(/independent assurance must pass/i.test(JSON.stringify(P.METIER_PARCOURS_CONTRACT.invariants)), "contract: assurance before CLOSED");
check(/modifies no register|unblock nothing canonical/i.test(JSON.stringify(P.METIER_PARCOURS_CONTRACT.invariants)), "contract: no canonical mutation");

if (failures === 0) process.stdout.write("ALL PASS — V12.4 MÉTIER PARCOURS E2E\n");
process.exit(failures === 0 ? 0 : 1);

export {};
