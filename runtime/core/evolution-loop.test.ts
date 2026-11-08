#!/usr/bin/env node
"use strict";
const assert = require("assert");
const E = require("./evolution-loop");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("WI-FR-04 — EVOLUTION-LOOP ENGINE");

const builder = async () => ({ id: "cand-1", change: "faster parser" });
function baseSpec(over?: any): any {
  return Object.assign({
    id: "evo-1", proposalRef: "cand:abc", budget: { maxMs: 1000, maxCalls: 10, maxCostEur: 0 },
    config: { sense: { throughput: "higher", latencyMs: "lower", memoryMb: "lower" } },
    hypothesis: {
      hypothesis: "faster parser improves throughput without regressions", problem: "parser bottleneck", expectedOutcome: "throughput up, nothing regresses",
      refutationConditions: [{ metric: "latencyMs", field: "after", op: ">", value: 200 }],
      successCriteria: [{ metric: "throughput", field: "after", op: ">=", value: 1.5 }],
    },
  }, over || {});
}
const collectors = { throughput: () => 1.0, latencyMs: () => 100, memoryMb: () => 100 };
function runner(after: any, cost?: any, extra?: any): any { return async () => Object.assign({ afterSignals: after, raw: { ok: true }, cost: cost || { ms: 50, calls: 1, costEur: 0 } }, extra || {}); }
function roles(after: any, extra?: any): any { return Object.assign({ builder, runner: runner(after), collectors, now: 1 }, extra || {}); }

void (async () => {
  // (1) REAL IMPROVEMENT ⇒ PROMOTION_REVIEW (external required; NOT promoted by the loop).
  const good = await E.runEvolutionCycle(baseSpec(), roles({ throughput: 2.0, latencyMs: 60, memoryMb: 90 }));
  check(good.ok === true && good.cycle.state === "PROMOTION_REVIEW" && good.cycle.outcome === "PROMOTION_REVIEW", "real improvement ⇒ reaches PROMOTION_REVIEW");
  check(good.cycle.promoted === false && good.cycle.promotionReview.requiresExternalDecision === true && good.cycle.promotionReview.grantsNoPromotion === true, "the loop NEVER promotes — PROMOTION_REVIEW requires an external decision");

  // (12 / self-promotion) applyExternalPromotion refuses a self-authored / unapproved decision; accepts a real external one.
  check(E.applyExternalPromotion(good.cycle, { authorizedBy: "evolution-loop", approved: true }, { now: 2 }).ok === false, "self-authored promotion ⇒ refused (loop cannot authorize itself)");
  check(E.applyExternalPromotion(good.cycle, { selfAuthored: true, authorizedBy: "odg", approved: true }, {}).ok === false, "selfAuthored flag ⇒ refused");
  const declined = E.applyExternalPromotion(good.cycle, { authorizedBy: "odg-cto", approved: false }, { now: 2 });
  check(declined.ok === true && declined.cycle.state === "REJECTED", "external decision 'not approved' ⇒ REJECTED (not promoted)");
  const promoted = E.applyExternalPromotion(good.cycle, { authorizedBy: "odg-cto", approved: true }, { now: 2 });
  check(promoted.ok === true && promoted.cycle.state === "MEASURED" && promoted.cycle.promoted === true && promoted.cycle.promotedBy === "odg-cto", "an EXTERNAL approved decision ⇒ MEASURED (governed promotion)");

  // (2) NULL IMPROVEMENT ⇒ not promoted (INCONCLUSIVE). Criteria met but no measured gain.
  const flat = await E.runEvolutionCycle(baseSpec({ hypothesis: Object.assign({}, baseSpec().hypothesis, { successCriteria: [{ metric: "throughput", field: "after", op: ">=", value: 1.0 }] }) }), roles({ throughput: 1.0, latencyMs: 100, memoryMb: 100 }));
  check(flat.cycle.outcome === "INCONCLUSIVE" && flat.cycle.promoted !== true, "null improvement (no measured gain) ⇒ INCONCLUSIVE, not promoted");

  // (3) REGRESSION on the protected baseline (criteria still met) ⇒ DEGRADED ⇒ ROLLBACK.
  const regr = await E.runEvolutionCycle(baseSpec(), roles({ throughput: 2.0, latencyMs: 60, memoryMb: 200 }));
  check(regr.cycle.state === "ROLLED_BACK" && /regression/.test(regr.cycle.degraded.reason) && regr.cycle.outcome === "ROLLED_BACK", "regression vs protected baseline ⇒ DEGRADED ⇒ ROLLBACK");

  // (4) CONTRADICTION — a refutation condition is met ⇒ verify FAIL ⇒ DEGRADED ⇒ ROLLBACK.
  const contra = await E.runEvolutionCycle(baseSpec(), roles({ throughput: 2.0, latencyMs: 250, memoryMb: 90 }));
  check(contra.cycle.state === "ROLLED_BACK" && /verification FAIL/.test(contra.cycle.degraded.reason), "refutation met (contradiction) ⇒ verify FAIL ⇒ ROLLBACK");

  // (5) COMPROMISED EVALUATOR — hard integrity marker ⇒ DETECTED ⇒ DEGRADED ⇒ ROLLBACK.
  const game = await E.runEvolutionCycle(baseSpec(), roles({ throughput: 2.0, latencyMs: 60, memoryMb: 90 }, { integritySignals: { gaming: { metric: { before: 1, after: 2 }, manipulationMarker: true } } }));
  check(game.cycle.state === "ROLLED_BACK" && /integrity DETECTED/.test(game.cycle.degraded.reason), "compromised evaluator (integrity DETECTED) ⇒ DEGRADED ⇒ ROLLBACK");

  // (11) INSUFFICIENT EVIDENCE — a success criterion on an unmeasured metric ⇒ INCONCLUSIVE (fail-closed), not promoted.
  const inc = await E.runEvolutionCycle(baseSpec({ hypothesis: Object.assign({}, baseSpec().hypothesis, { successCriteria: [{ metric: "unmeasuredX", op: ">", value: 1 }] }) }), roles({ throughput: 2.0, latencyMs: 60, memoryMb: 90 }));
  check(inc.cycle.outcome === "INCONCLUSIVE" && inc.cycle.promoted !== true, "insufficient evidence ⇒ INCONCLUSIVE (fail-closed), not promoted");

  // budget breach in the sandbox ⇒ DEGRADED ⇒ ROLLBACK (isolation/budget enforced via the Lab).
  const over = await E.runEvolutionCycle(baseSpec(), { builder, runner: runner({ throughput: 2.0, latencyMs: 60, memoryMb: 90 }, { ms: 99999, calls: 1, costEur: 0 }), collectors, now: 1 });
  check(over.cycle.state === "ROLLED_BACK" && /sandbox aborted/.test(over.cycle.degraded.reason), "over-budget sandbox ⇒ ABORTED ⇒ DEGRADED ⇒ ROLLBACK");

  // separate roles required (Builder ≠ Tester).
  check((await E.runEvolutionCycle(baseSpec(), { runner: runner({ throughput: 2 }), collectors, now: 1 })).ok === false, "missing Builder role ⇒ refused (roles are separate)");
  check((await E.runEvolutionCycle(baseSpec(), { builder, collectors, now: 1 })).ok === false, "missing Tester (runner) role ⇒ refused");

  // (10) ROLLBACK is testable + (6) MODIFIED-BASELINE detection via revalidate.
  const rb = E.rollback(E.stop(E.degrade(regr.cycle, "manual", 3), 3), 3);
  const reval = E.revalidate(rb, collectors, { now: 4 });
  check(reval.state === "REVALIDATED" && reval.baselineIntact === true, "rollback ⇒ revalidate confirms the protected baseline is INTACT");
  const drift = E.revalidate(rb, { throughput: () => 5.0, latencyMs: () => 10, memoryMb: () => 10 }, { now: 4 });
  check(drift.baselineIntact === false, "a drifted/modified baseline is DETECTED by revalidate (baselineIntact=false)");

  // (8) INTERRUPTION + RESUME, (9) DOUBLE EXECUTION idempotent, corrupt ⇒ fail-closed.
  const m = new Map();
  const store = { read: (n: any, f: any) => (m.has(n) ? m.get(n) : (f === undefined ? null : f)), readStrict: (n: any) => m.has(n) ? { present: true, corrupt: false, value: m.get(n) } : { present: false, corrupt: false, value: null }, write: (n: any, o: any) => { m.set(n, o); return o; } };
  E.persistCycle(good.cycle, { store, now: 1 });
  check(E.resume({ store }).cycles["evo-1"].state === "PROMOTION_REVIEW", "resume() reconstructs the latest cycle snapshot after interruption");
  check(E.persistCycle(good.cycle, { store }).decision === "DUPLICATE", "re-persisting the same id:state ⇒ DUPLICATE (idempotent, no double execution)");
  const storeC = { read: () => null, readStrict: (_n: any) => ({ present: true, corrupt: true, value: null }), write: () => {} };
  check(E.resume({ store: storeC }).ok === false && E.persistCycle(good.cycle, { store: storeC }).ok === false, "corrupt cycle store ⇒ resume + persist fail-closed");

  // startCycle fail-closed: unfalsifiable hypothesis refused.
  check(E.startCycle({ id: "x", proposalRef: "p", budget: {}, hypothesis: { hypothesis: "h", refutationConditions: [], successCriteria: [] } }, {}).ok === false, "unfalsifiable / budget-less cycle ⇒ REJECTED at start");

  console.log(failures === 0 ? "ALL PASS — WI-FR-04 EVOLUTION-LOOP" : `FAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
export {};
