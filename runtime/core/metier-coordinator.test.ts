#!/usr/bin/env node
"use strict";
const C = require("./metier-coordinator");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
// (1) select only the relevant competency-matching subset — NEVER all 15.
{
  const s = C.selectMetiers({ competenciesNeeded: ["security", "release"] });
  check(s.selected.includes("P3") && s.selected.includes("P8") && s.selected.length < 15, "selects only relevant métiers (P3 security, P8 release), not all 15");
  check(s.selected.length === 2, "exactly the 2 matching métiers selected");
}
// (2) no competency match ⇒ nothing selected (fail-closed, clarify — don't run all 15).
check(C.selectMetiers({ competenciesNeeded: ["astrology"] }).selected.length === 0, "no match ⇒ nothing selected (don't reflexively run 15)");
check(C.selectMetiers({}).selected.length === 0, "empty need ⇒ nothing selected");
// (3) dependency ordering: topological; a cycle flagged.
{
  const o = C.orderByDependency(["P1", "P2", "P3"], { P2: ["P1"], P3: ["P2"] });
  check(o.order.indexOf("P1") < o.order.indexOf("P2") && o.order.indexOf("P2") < o.order.indexOf("P3") && o.cycle === false, "topological order respects deps");
  check(C.orderByDependency(["A", "B"], { A: ["B"], B: ["A"] }).cycle === true, "a cycle is flagged (fail-closed)");
}
// (4) consolidation FAIL-CLOSED: any REJECT ⇒ REJECT.
check(C.consolidate([{ metier: "P3", decision: "ADMIT" }, { metier: "P8", decision: "REJECT" }]).verdict === "REJECT" || C.consolidate([{ metier: "P3", subject: "x", decision: "ADMIT" }, { metier: "P8", subject: "y", decision: "REJECT" }]).verdict === "REJECT", "a single REJECT (different subjects) ⇒ overall REJECT");
// (5) CONTRADICTION on the SAME subject (ADMIT vs REJECT) ⇒ ESCALATE (never silently resolved).
{
  const con = C.consolidate([{ metier: "P3", subject: "dep", decision: "ADMIT" }, { metier: "P8", subject: "dep", decision: "REJECT" }]);
  check(con.verdict === "ESCALATE" && con.contradictions.length === 1, "métiers contradicting on a shared subject ⇒ ESCALATE (cross-verification), not a silent pick");
}
// (6) all ADMIT ⇒ ADMIT.
check(C.consolidate([{ metier: "P3", subject: "d", decision: "ADMIT" }, { metier: "P8", subject: "d", decision: "ADMIT" }]).verdict === "ADMIT", "all ADMIT ⇒ ADMIT");
// (7) collaboration gain is MEASURED, not assumed.
{
  check(C.collaborationGain(0.7, 0.9).better === true && C.collaborationGain(0.7, 0.9).gain > 0, "collaboration that improves quality ⇒ measured positive gain");
  check(C.collaborationGain(0.9, 0.8).better === false, "collaboration that does NOT improve ⇒ flagged (don't coordinate for its own sake)");
  check(C.collaborationGain("x", 0.9).gain === null, "insufficient data ⇒ no gain claimed");
}
check(/never all 15 by reflex/i.test(JSON.stringify(C.METIER_COORDINATOR_CONTRACT.invariants)), "contract: never all 15 by reflex");
check(/contradiction.*ESCALATE|ADMIT vs REJECT/i.test(JSON.stringify(C.METIER_COORDINATOR_CONTRACT.invariants)), "contract: contradiction ⇒ ESCALATE");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 METIER COORDINATOR\n");
process.exit(failures === 0 ? 0 : 1);
export {};
