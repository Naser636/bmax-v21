#!/usr/bin/env node
"use strict";
const P = require("./plan-evaluator");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const fast = { id: "fast-risky", metrics: { Psuccess: 0.6, Vobjective: 0.7, Qquality: 0.5, Ttime: 0.1, Cresources: 0.2, Rrisk: 0.8, Uuncertainty: 0.7 } };
const reliable = { id: "slower-reliable", metrics: { Psuccess: 0.95, Vobjective: 0.7, Qquality: 0.9, Ttime: 0.5, Cresources: 0.4, Rrisk: 0.1, Uuncertainty: 0.1 } };
// (1) reliability beats fast-but-risky (§10: speed alone never wins).
{
  const r = P.evaluatePlans([fast, reliable]);
  check(r.selected === "slower-reliable", "a slower, reliable, low-risk plan beats a fast, risky one (speed alone never wins)");
  check(r.explanation.length === 1 && r.explanation[0].over === "fast-risky" && r.explanation[0].byMargin > 0, "the decision explains why the winner beats the runner-up (margin)");
}
// (2) HARD CONSTRAINTS first: an infeasible plan is NEVER selected, whatever its benefits (§10).
{
  const perfect = { id: "perfect-but-denied", policyAllowed: false, metrics: { Psuccess: 1, Vobjective: 1, Qquality: 1, Ttime: 0, Cresources: 0, Rrisk: 0, Uuncertainty: 0 } };
  const r = P.evaluatePlans([perfect, fast]);
  check(r.selected === "fast-risky" && r.rejected.some((x: any) => x.id === "perfect-but-denied"), "a POLICY-denied plan is rejected regardless of a perfect score");
  check(P.scorePlan(perfect).J === -Infinity, "an infeasible plan scores J = -Infinity");
}
// (3) each hard constraint type rejects.
check(P.checkHardConstraints({ authorized: false }).feasible === false, "unauthorized ⇒ infeasible");
check(P.checkHardConstraints({ truthLockSafe: false }).feasible === false, "Truth-Lock unsafe ⇒ infeasible");
check(P.checkHardConstraints({ withinWriteSet: false }).feasible === false, "out-of-write-set ⇒ infeasible");
check(P.checkHardConstraints({ hardConstraints: [{ name: "x", satisfied: false }] }).feasible === false, "an unmet declared hard constraint ⇒ infeasible");
// (4) FAIL-CLOSED factors: a plan missing its risk/uncertainty is NOT favoured (worst-case assumed).
{
  const underSpecified = { id: "under", metrics: { Psuccess: 0.9, Vobjective: 0.9 } };   // no risk/uncertainty/quality/time/cost given
  const specifiedSafe = { id: "safe", metrics: { Psuccess: 0.9, Vobjective: 0.9, Qquality: 0.9, Ttime: 0.2, Cresources: 0.2, Rrisk: 0.05, Uuncertainty: 0.05 } };
  const r = P.evaluatePlans([underSpecified, specifiedSafe]);
  check(r.selected === "safe", "an under-specified plan (missing risk/uncertainty ⇒ worst-case) does NOT beat a fully-specified safe plan");
  check(P.scorePlan(underSpecified).missingFactors.length > 0, "missing factors are reported, not silently assumed favourable");
}
// (5) no feasible plan ⇒ nothing selected (fail-closed).
check(P.evaluatePlans([{ id: "a", policyAllowed: false }]).selected === null, "all-infeasible ⇒ nothing selected (fail-closed)");
// (6) deterministic/reproducible: same input ⇒ same result; ties broken by id.
{
  const a = P.evaluatePlans([fast, reliable]); const b = P.evaluatePlans([fast, reliable]);
  check(JSON.stringify(a) === JSON.stringify(b), "evaluation is deterministic/reproducible");
}
check(/HARD constraints are enforced BEFORE optimization/i.test(JSON.stringify(P.PLAN_EVALUATOR_CONTRACT.invariants)), "contract: hard constraints before optimization");
check(/speed alone never wins/i.test(JSON.stringify(P.PLAN_EVALUATOR_CONTRACT.invariants)), "contract: speed alone never wins");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 PLAN EVALUATOR\n");
process.exit(failures === 0 ? 0 : 1);
export {};
