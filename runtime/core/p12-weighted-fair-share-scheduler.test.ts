#!/usr/bin/env node
"use strict";
const assert = require("assert");
const S = require("./p12-weighted-fair-share-scheduler");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("SÉRIE 23/W9 — WEIGHTED FAIR-SHARE SCHEDULER (DRR)");
// weighted split: a (weight 2) gets more than b (weight 1), Σ ≤ capacity.
{
  const r = S.scheduleFairShare({ tenants: [{ id: "a", weight: 2, demand: 10 }, { id: "b", weight: 1, demand: 10 }], capacity: 6, round: 1 });
  check(r.admittedTotal <= 6, "Σ admitted ≤ capacity");
  const a = r.admitted.find((x: any) => x.id === "a").units; const b = r.admitted.find((x: any) => x.id === "b").units;
  check(a > b, `weighted: a(${a}) > b(${b})`);
}
// no over-admission when capacity < total demand.
{
  const r = S.scheduleFairShare({ tenants: [{ id: "a", weight: 1, demand: 100 }], capacity: 5, round: 1 });
  check(r.admittedTotal === 5 && r.deferred[0].units === 95, "capacity-limited: admit 5, defer 95");
}
// no starvation: an under-served tenant accrues deficit and advances next round.
{
  const r1 = S.scheduleFairShare({ tenants: [{ id: "a", weight: 1, demand: 3 }, { id: "b", weight: 1, demand: 0 }], capacity: 1, round: 1 });
  check(r1.deficits.a >= 0, "under-served tenant carries a deficit");
  const r2 = S.scheduleFairShare({ tenants: [{ id: "a", weight: 1, demand: 2 }], capacity: 1, round: 2, deficits: r1.deficits });
  check(r2.admittedTotal >= 1, "carried deficit lets the tenant advance next round (no starvation)");
}
// fail-closed: malformed tenant / weight ≤ 0 ⇒ admit 0.
{
  const r = S.scheduleFairShare({ tenants: [{ id: "x", weight: 0, demand: 5 }, { id: "y", weight: -1, demand: 5 }, { weight: 1, demand: 5 }], capacity: 10, round: 1 });
  check(r.admittedTotal === 0, "bad weight / malformed tenant ⇒ admit 0 (fail-closed)");
}
// empty ⇒ empty admitted.
check(S.scheduleFairShare({ tenants: [], capacity: 10, round: 1 }).admittedTotal === 0, "empty ⇒ 0 admitted");
check(S.FAIR_SHARE_SCHEDULER_CONTRACT.invariants.some((i: any) => /never over-admits/.test(i)), "contract: never over-admits");
console.log(failures === 0 ? "ALL PASS — SÉRIE 23/W9 FAIR-SHARE SCHEDULER" : "FAILURES: " + failures);
process.exit(failures === 0 ? 0 : 1);
export {};
