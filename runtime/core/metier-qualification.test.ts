#!/usr/bin/env node
"use strict";
/* V137 — métier-qualification evaluator battery. Proves the LOCAL maturity taxonomy is honest + fail-closed: all-pass ⇒
 * VALIDATED_LOCAL; a non-fail-closed failure class ⇒ NOT_FAIL_CLOSED (safety gap surfaced, NOT qualified); missing/garbage
 * scenario ⇒ not-ran/not-passed; ACTIVE_IN_PRODUCTION is never emitted; roll-up counts are correct; frozen + deterministic. */
const Q = require("./metier-qualification.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }
const P = { ran: true, passed: true }; const Fp = { ran: true, passed: false };

function main() {
  // 1 — all three classes pass ⇒ VALIDATED_LOCAL + qualified
  const v1 = Q.evaluateQualification("P1", { nominal: P, boundary: P, failure: P });
  check("all pass ⇒ qualified + VALIDATED_LOCAL", v1.qualified === true && v1.maturity === "VALIDATED_LOCAL" && v1.passCount === 3);

  // 2 — nominal + failure pass but boundary fails ⇒ PARTIAL_LOCAL, not qualified
  const v2 = Q.evaluateQualification("P2", { nominal: P, boundary: Fp, failure: P });
  check("nominal+failure pass, boundary fails ⇒ PARTIAL_LOCAL, not qualified", v2.qualified === false && v2.maturity === "PARTIAL_LOCAL");

  // 3 — SAFETY: nominal passes but the failure class is NOT fail-closed ⇒ NOT_FAIL_CLOSED (surfaced), not qualified
  const v3 = Q.evaluateQualification("P3", { nominal: P, boundary: P, failure: Fp });
  check("failure class not fail-closed ⇒ NOT_FAIL_CLOSED (safety gap surfaced) + not qualified", v3.qualified === false && v3.maturity === "NOT_FAIL_CLOSED");

  // 4 — nominal fails ⇒ NOT_QUALIFIED
  const v4 = Q.evaluateQualification("P4", { nominal: Fp, boundary: P, failure: P });
  check("nominal fails ⇒ NOT_QUALIFIED", v4.qualified === false && v4.maturity === "NOT_QUALIFIED");

  // 5 — fail-closed: a missing / garbage scenario counts as not-ran + not-passed
  const v5 = Q.evaluateQualification("P5", { nominal: P, boundary: P /* failure absent */ });
  check("absent scenario ⇒ not-ran, not-passed (fail-closed) ⇒ not qualified", v5.qualified === false && v5.scenarios.failure.ran === false && v5.scenarios.failure.passed === false);
  const v5b = Q.evaluateQualification("P5b", null);
  check("garbage results ⇒ not qualified, no throw", v5b.qualified === false && v5b.ranCount === 0);

  // 6 — a 'passed' claim without ran:true is NOT honored (fail-closed)
  const v6 = Q.evaluateQualification("P6", { nominal: { ran: false, passed: true }, boundary: P, failure: P });
  check("passed without ran ⇒ not counted (fail-closed)", v6.scenarios.nominal.passed === false && v6.qualified === false);

  // 7 — ACTIVE_IN_PRODUCTION is NEVER emitted; maturity stays LOCAL-scoped
  check("maturity never ACTIVE_IN_PRODUCTION (test-scoped only)", ![v1, v2, v3, v4].some((v) => /ACTIVE_IN_PRODUCTION/.test(v.maturity)) && /VALIDATED_LOCAL ≠ ACTIVE_IN_PRODUCTION/.test(v1.note));

  // 8 — summarise roll-up: counts by maturity, qualifiedCount, safety gaps surfaced, allQualified
  const sum = Q.summarise([v1, v2, v3, v4]);
  check("summarise: correct counts + surfaced safety gap + allQualified=false", sum.total === 4 && sum.qualifiedCount === 1 && sum.byMaturity.VALIDATED_LOCAL === 1 && sum.byMaturity.NOT_FAIL_CLOSED === 1 && sum.safetyGaps.includes("P3") && sum.allQualified === false);
  check("summarise: allQualified true only when every métier qualified", Q.summarise([v1, Q.evaluateQualification("X", { nominal: P, boundary: P, failure: P })]).allQualified === true);

  // 9 — frozen + deterministic
  check("output frozen + deterministic", Object.isFrozen(v1) && Object.isFrozen(v1.scenarios) && JSON.stringify(v1) === JSON.stringify(Q.evaluateQualification("P1", { nominal: P, boundary: P, failure: P })));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — métier-qualification (3-class LOCAL maturity, fail-closed, safety gaps surfaced, production never claimed from tests)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
