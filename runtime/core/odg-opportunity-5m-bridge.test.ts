#!/usr/bin/env node
"use strict";
/* V216 §5 — opportunity × €5M-net bridge. Proves: composes rankByFit + searchFor5M + targetConditions; ranks by FIT;
 * reports €5M MODEL reachability per opportunity as a DISTINCT axis; surfaces fit/€5M divergence; NO_ECON_PROFILE never
 * fabricated; aggregate used ONLY at €5M; nothing claimed as forecast/client; deterministic + frozen. */
const B = require("./odg-opportunity-5m-bridge.js");
let failures = 0; function check(n: string, c: boolean) { process.stdout.write((c ? "ok" : "NOT OK") + " - " + n + "\n"); if (!c) failures++; }

// strong econ profile (NIS2 fixture — searchFor5M reports reachable via lever combinations); weak econ (never reaches €5M in 3 people).
const STRONG_ECON = { id: "nis2", proposedPrice: 25000, estDeliveryCostPerCustomer: 2000, estSupportDaysPerCustomer: 3, certificationCost: 20000 };
const WEAK_ECON = { id: "lowval", proposedPrice: 300, estDeliveryCostPerCustomer: 200, estSupportDaysPerCustomer: 10, certificationCost: 0 };

function main() {
  const opps = [
    { id: "A", name: "high-fit strong-econ", grade: "A", feasible: true, deadlineDays: 20, budgetEur: 25000, econ: STRONG_ECON },
    { id: "B", name: "low-fit weak-econ", grade: "C", feasible: false, deadlineDays: 2, econ: WEAK_ECON },
    { id: "C", name: "high-fit no-econ", grade: "A", feasible: true, deadlineDays: 20, budgetEur: 25000 },
  ];
  const r = B.compare({ opportunities: opps });

  check("ranks by FIT (axis 1): a grade-A feasible opp is ranked above the grade-C infeasible one", r.count === 3 && r.comparison[0].fitRank === 1 && r.comparison.find((x: any) => x.id === "B").fitRank > r.comparison.find((x: any) => x.id === "A").fitRank);
  check("€5M reachability (axis 2) computed per-opp via REUSED searchFor5M — strong econ reachable in model", r.comparison.find((x: any) => x.id === "A").fiveMReachableInModel === true && typeof r.comparison.find((x: any) => x.id === "A").leastStretchRevenue === "number" && typeof r.comparison.find((x: any) => x.id === "A").leastStretchCustomers === "number");
  check("weak econ: €5M NOT reachable in model (not fabricated as reachable)", r.comparison.find((x: any) => x.id === "B").fiveMReachableInModel === false && r.comparison.find((x: any) => x.id === "B").leastStretchRevenue === null);
  check("NO_ECON_PROFILE honestly reported (not fabricated) for the opp lacking an econ profile", r.comparison.find((x: any) => x.id === "C").fiveMReachableInModel === null && /NO_ECON_PROFILE/.test(r.comparison.find((x: any) => x.id === "C").note));
  check("fit and €5M-reachability are DISTINCT axes — both present, reported separately", r.comparison.every((x: any) => "fitRank" in x && "fiveMReachableInModel" in x));

  // divergence: a TOP-FIT opp with a weak (unreachable) econ ⇒ divergence surfaced
  const div = B.compare({ opportunities: [{ id: "top", grade: "A", feasible: true, deadlineDays: 20, budgetEur: 1, econ: WEAK_ECON }] });
  check("divergence surfaced when highest-fit opp is NOT €5M-reachable", div.summary.topFitIsFiveMReachable === false && /fit and €5M-reachability diverge/.test(div.summary.divergence));

  // aggregate (axis 3) — blended revenue REQUIRED for €5M net, reused from targetConditions, ONLY at the €5M target
  check("aggregate = targetConditions at €5M (blended revenue-required present)", r.targetNet === 5000000 && /targetConditions/.test(r.aggregate.lens) && r.aggregate.conditions && /5,000,000/.test(r.aggregate.conditions.target));
  const other = B.compare({ opportunities: [], targetNet: 2000000 });
  check("non-€5M target ⇒ aggregate N/A (targetConditions NOT retuned — honesty over convenience)", other.aggregate.lens === "N/A" && /fixed at €5M/.test(other.aggregate.note));

  check("honesty: MODEL conditions only, €5M a TARGET, demand OWNER_GATED, €0 clients, CA≠net", /MODEL conditions only/.test(r.honesty) && /OWNER_GATED/.test(r.honesty) && /€0 real clients/.test(r.honesty) && /CA ≠ marge/.test(r.honesty));
  check("contract: composes 3 existing modules, no 2nd engine, distinct axes, never conflated", B.OPPORTUNITY_5M_BRIDGE_CONTRACT.invariants.some((i: string) => /builds NO second economic model\/ranker/.test(i)) && B.OPPORTUNITY_5M_BRIDGE_CONTRACT.invariants.some((i: string) => /DISTINCT axes/.test(i)));
  check("deterministic + frozen", JSON.stringify(B.compare({ opportunities: opps }).comparison) === JSON.stringify(r.comparison) && Object.isFrozen(r) && Object.isFrozen(r.comparison));

  process.stdout.write("\n" + (failures === 0 ? "ALL PASS — opportunity-5m-bridge (V216 §5: composes rankByFit + searchFor5M + targetConditions; FIT rank × €5M-net MODEL reachability as DISTINCT axes; divergence surfaced; NO_ECON_PROFILE not fabricated; aggregate only at €5M; MODEL-only, demand OWNER_GATED, €0 clients)" : failures + " FAIL") + "\n");
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
