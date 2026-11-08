#!/usr/bin/env node
"use strict";
const assert = require("assert");
const L = require("./frontier-lab");
const R = require("./frontier-radar");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-FR-03 — FRONTIER LAB (isolated experimentation engine)");

// A well-formed preregistration linked to a (real WI-FR-01) Radar proposal.
function realProposalRef(): string {
  const sig = R.normalizeSignal({ title: "Faster parser", categories: ["parsing"], claims: ["2x"] }, { sourceId: "ted" });
  const q = R.qualify(sig, { sourceReliability: 0.9, impactHint: 0.9, baseline: { focusAreas: ["parsing"], crossChecked: true } });
  const cand = R.toCandidate(sig, q, { now: 1 });
  return R.toMissionProposal(cand, R.compareWithOdg(cand, { capabilities: [] }), { now: 1 }).candidateId;
}
function spec(over?: any): any {
  return Object.assign({
    id: "exp-1", proposalRef: realProposalRef(), touchesProduction: false,
    hypothesis: {
      hypothesis: "the faster parser doubles throughput without raising latency",
      problem: "current parser is the throughput bottleneck",
      expectedOutcome: "throughput >= 1.5x and latency improved",
      refutationConditions: [{ metric: "latencyMs", field: "after", op: ">", value: 200 }],
      successCriteria: [{ metric: "throughput", field: "after", op: ">=", value: 1.5 }, { metric: "latencyMs", field: "direction", op: "==", value: "improved" }],
    },
    budget: { maxMs: 1000, maxCalls: 10, maxCostEur: 0 },
    config: { sense: { throughput: "higher", latencyMs: "lower" } },
  }, over || {});
}
const collectors = { throughput: () => 1.0, latencyMs: () => 100 };
function runner(after: any, cost?: any, extra?: any): any { return async () => Object.assign({ afterSignals: after, raw: { ok: true }, cost: cost || { ms: 50, calls: 1, costEur: 0 } }, extra || {}); }

// (1) HYPOTHESIS correctly formulated ⇒ REGISTERED; + unfalsifiable/incomplete ⇒ REJECTED.
{
  const r = L.registerExperiment(spec(), { now: 1 });
  check(r.ok === true && r.experiment.status === "REGISTERED" && r.experiment.proposalRef, "well-formed preregistration ⇒ REGISTERED (linked to Radar proposal)");
  const noRef = L.registerExperiment(spec({ hypothesis: { hypothesis: "h", problem: "p", expectedOutcome: "o", refutationConditions: [], successCriteria: [{ metric: "x", op: ">", value: 1 }] } }), {});
  check(noRef.ok === false && noRef.problems.some((p: any) => /refutation/.test(p)), "no refutation condition ⇒ REJECTED (unfalsifiable experiment refused)");
  const prod = L.registerExperiment(spec({ touchesProduction: true }), {});
  check(prod.ok === false && prod.problems.some((p: any) => /production/.test(p)), "touchesProduction=true ⇒ REJECTED (no production effect)");
  const noBudget = L.registerExperiment(spec({ budget: {} }), {});
  check(noBudget.ok === false && noBudget.problems.some((p: any) => /budget/.test(p)), "no budget ⇒ REJECTED");
}

// (2) BASELINE recorded + immutable.
{
  const reg = L.registerExperiment(spec(), { now: 1 });
  const bl = L.recordBaseline(reg.experiment, collectors, { now: 2 });
  check(bl.ok === true && bl.experiment.status === "BASELINED" && bl.experiment.baseline.signals.throughput === 1.0, "baseline captured (immutable before-state)");
  check(L.recordBaseline(bl.experiment, collectors, {}).ok === false, "re-baseline refused (baseline immutable)");
}

// (3) EXECUTED in isolation via injected runner + (4) reproducible MEASUREMENT.
{
  const reg = L.registerExperiment(spec(), { now: 1 });
  const bl = L.recordBaseline(reg.experiment, collectors, { now: 2 });
  void (async () => {
    const run = await L.runExperiment(bl.experiment, { runner: runner({ throughput: 2.0, latencyMs: 60 }), now: 3 });
    check(run.ok === true && run.experiment.status === "EXECUTED", "experiment executes in isolation via the injected runner");
    const m1 = L.measure(run.experiment), m2 = L.measure(run.experiment);
    check(m1.ok === true && m1.measurement.metrics.throughput.direction === "improved" && m1.measurement.metrics.latencyMs.direction === "improved", "measurement computes baseline/intervention delta");
    check(JSON.stringify(m1) === JSON.stringify(m2), "measurement is reproducible (deterministic)");

    // (6-PASS) INDEPENDENT VERIFICATION: executor self-report is IGNORED; recomputed from preregistered criteria.
    const v = L.verifyIndependently(run.experiment, m1.measurement, {});
    check(v.verdict === "PASS" && v.complete === true && v.integrity === "NO_DATA", "independent verification ⇒ PASS when all preregistered criteria met");

    // (9a) FALSIFICATION — executor CLAIMS success but the measured signals don't meet criteria ⇒ verifier FAILs.
    const lie = await L.runExperiment(bl.experiment, { runner: runner({ throughput: 1.0, latencyMs: 100 }, { ms: 10, calls: 1, costEur: 0 }, { raw: { claimedSuccess: true } }), now: 3 });
    const vlie = L.verifyIndependently(lie.experiment, L.measure(lie.experiment).measurement, {});
    check(vlie.verdict === "FAIL", "executor claims success but criteria not met ⇒ INDEPENDENT verifier FAILs (executor ≠ verifier)");

    // (9b) FALSIFICATION — hard integrity marker ⇒ FAIL even if criteria 'met'.
    const vgame = L.verifyIndependently(run.experiment, m1.measurement, { integritySignals: { gaming: { metric: { before: 1, after: 2 }, manipulationMarker: true } } });
    check(vgame.verdict === "FAIL" && vgame.integrity === "DETECTED", "hard manipulation marker ⇒ integrity DETECTED ⇒ FAIL");

    // PROMISING — PASS but a SUSPECTED (Goodhart) integrity flag ⇒ decision PROMISING (not yet review-ready).
    const vsus = L.verifyIndependently(run.experiment, m1.measurement, { integritySignals: { gaming: { metric: { before: 1, after: 2 }, independentCheck: { before: 1, after: 1 } } } });
    check(vsus.verdict === "PASS" && vsus.integrity === "SUSPECTED" && L.decide({ ...run.experiment, verification: vsus }).decision === "PROMISING", "PASS + SUSPECTED integrity ⇒ PROMISING");

    // (5) FAILED experiment — a refutation condition is met ⇒ REJECTED.
    const failRun = await L.runExperiment(bl.experiment, { runner: runner({ throughput: 2.0, latencyMs: 250 }), now: 3 });
    const vf = L.verifyIndependently(failRun.experiment, L.measure(failRun.experiment).measurement, {});
    check(vf.verdict === "FAIL" && vf.refuted === true && L.decide({ ...failRun.experiment, verification: vf }).decision === "REJECTED", "refutation condition met ⇒ FAIL ⇒ REJECTED");

    // (6-INCONCLUSIVE) a success criterion references an UNMEASURED metric ⇒ incomplete ⇒ INCONCLUSIVE.
    const incReg = L.registerExperiment(spec({ hypothesis: Object.assign({}, spec().hypothesis, { successCriteria: [{ metric: "memoryMb", op: "<", value: 10 }] }) }), { now: 1 });
    const incBl = L.recordBaseline(incReg.experiment, collectors, { now: 2 });
    const incRun = await L.runExperiment(incBl.experiment, { runner: runner({ throughput: 2.0, latencyMs: 60 }), now: 3 });
    const vi = L.verifyIndependently(incRun.experiment, L.measure(incRun.experiment).measurement, {});
    check(vi.complete === false && vi.verdict === "INCONCLUSIVE" && L.decide({ ...incRun.experiment, verification: vi }).decision === "INCONCLUSIVE", "unmeasured criterion ⇒ incomplete ⇒ INCONCLUSIVE (fail-closed)");

    // (7) BUDGET exceeded ⇒ ABORTED ⇒ INCONCLUSIVE.
    const overRun = await L.runExperiment(bl.experiment, { runner: runner({ throughput: 2.0, latencyMs: 60 }, { ms: 99999, calls: 1, costEur: 0 }), now: 3 });
    check(overRun.experiment.status === "ABORTED" && /budget/.test(overRun.experiment.abortReason) && L.decide(overRun.experiment).decision === "INCONCLUSIVE", "over-budget run ⇒ ABORTED ⇒ INCONCLUSIVE");

    // isolation breach ⇒ ABORTED
    const prodRun = await L.runExperiment(bl.experiment, { runner: runner({ throughput: 2.0, latencyMs: 60 }, { ms: 10, calls: 1, costEur: 0 }, { productionTouched: true }), now: 3 });
    check(prodRun.experiment.status === "ABORTED" && /production/.test(prodRun.experiment.abortReason), "runner reports a production side-effect ⇒ ABORTED (isolation enforced)");

    // (10) UNAUTHORIZED PROMOTION — the terminal positive is READY_FOR_REVIEW; the Lab NEVER promotes/authorizes.
    const e2e = await L.runLabExperiment(spec(), { collectors, runner: runner({ throughput: 2.0, latencyMs: 60 }), now: 5 });
    check(e2e.ok === true && e2e.experiment.status === "DECIDED" && e2e.experiment.decision.decision === "READY_FOR_REVIEW", "E2E clean PASS ⇒ READY_FOR_REVIEW (full lifecycle)");
    check(e2e.experiment.decision.grantsNoPromotion === true && e2e.experiment.decision.authorizesIntegration === false && !L.DECISIONS.includes("PROMOTED") && typeof (L as any).promote !== "function", "no experiment can authorize its own promotion (grants no promotion; no promote())");
    check(e2e.experiment.evidence && e2e.experiment.evidence.hypothesis && e2e.experiment.evidence.baseline && e2e.experiment.evidence.verification && e2e.experiment.evidence.provenance.synthetic === false, "evidence bundle is complete (hypothesis+baseline+raw+measures+verification+decision+provenance)");

    // (8) INTERRUPTION + RESUME — durable immutable snapshots; resume reconstructs the latest lifecycle state.
    const m = new Map();
    const store = { read: (n: any, f: any) => (m.has(n) ? m.get(n) : (f === undefined ? null : f)), readStrict: (n: any) => m.has(n) ? { present: true, corrupt: false, value: m.get(n) } : { present: false, corrupt: false, value: null }, write: (n: any, o: any) => { m.set(n, o); return o; }, _corrupt: (n: any) => m.set(n, "__CORRUPT__") };
    L.persistExperiment(reg.experiment, { store, now: 1 });
    L.persistExperiment(bl.experiment, { store, now: 2 });
    const resumed = L.resume({ store });
    check(resumed.ok === true && resumed.experiments["exp-1"].status === "BASELINED", "resume() reconstructs the latest lifecycle snapshot (BASELINED) after interruption");
    check(L.persistExperiment(bl.experiment, { store }).decision === "DUPLICATE", "re-persisting the same id:status ⇒ DUPLICATE (idempotent immutable history)");
    // fail-closed on corrupt store
    const mc = new Map(); const storeC = { read: (n: any, f: any) => (mc.has(n) ? mc.get(n) : f), readStrict: (_n: any) => ({ present: true, corrupt: true, value: null }), write: (n: any, o: any) => mc.set(n, o) };
    check(L.resume({ store: storeC }).ok === false && L.persistExperiment(bl.experiment, { store: storeC }).ok === false, "corrupt experiment store ⇒ resume + persist fail-closed (no clobber)");

    console.log(failures === 0 ? "ALL PASS — WI-FR-03 FRONTIER LAB" : `FAILURES: ${failures}`);
    process.exit(failures === 0 ? 0 : 1);
  })();
}
export {};
