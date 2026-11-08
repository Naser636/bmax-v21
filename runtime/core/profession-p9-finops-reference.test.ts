#!/usr/bin/env node
"use strict";
const assert = require("assert");
const P9 = require("./profession-p9-finops-reference");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 §43 P9 — FINOPS REFERENCE (E2/E3)");

// kinds kept strictly separate; unknown kind ⇒ SIMULATED (never OBSERVED).
{
  const c = P9.computeCosts([
    { kind: "OBSERVED", amountEur: 2, missionId: "m1" },
    { kind: "ESTIMATED", amountEur: 5 },
    { kind: "SIMULATED", amountEur: 100 },
    { kind: "BOGUS", amountEur: 7 },
  ]);
  check(c.byKind.OBSERVED === 2 && c.byKind.ESTIMATED === 5 && c.byKind.SIMULATED === 107, "kinds separate; unknown kind folded into SIMULATED (never OBSERVED)");
  check(c.perMissionObserved.m1 === 2, "cost-per-mission comes from OBSERVED only");
  check(c.conflated === true, "an invalid kind is surfaced as conflation risk");
}

// budget-stop fail-closed on OBSERVED spend.
{
  check(P9.budgetStop(12, 10).stop === true, "OBSERVED spend over budget ⇒ stop (fail-closed)");
  check(P9.budgetStop(8, 10).stop === false, "OBSERVED spend within budget ⇒ no stop");
}

// E2 clean reference: OBSERVED within budget, separation clean.
{
  const r = P9.runReferenceProject({ lineItems: [
    { kind: "OBSERVED", amountEur: 1, missionId: "m1" }, { kind: "ESTIMATED", amountEur: 50 },
  ], budgetEur: 10 });
  check(r.synthetic === true && r.profession === "P9" && r.separationAudit.clean === true && r.budget.stop === false && r.degraded === false, "E2: OBSERVED within budget, kinds clean ⇒ not degraded");
}

// E3: OBSERVED over budget ⇒ degraded (fail-closed surfaced).
{
  const r = P9.runReferenceProject({ lineItems: [ { kind: "OBSERVED", amountEur: 999, missionId: "m1" } ], budgetEur: 10 });
  check(r.budget.stop === true && r.degraded === true, "E3: OBSERVED over budget ⇒ budget-stop + degraded");
}

check(P9.P9_FINOPS_REFERENCE_CONTRACT.invariants.some((i: any) => /E5.*owner-gated NOT_RUN/.test(i)), "honesty: SYNTHETIC only, E5 owner-gated NOT_RUN");

console.log(failures === 0 ? "ALL PASS — V12.4 §43 P9 FINOPS REFERENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
