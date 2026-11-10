#!/usr/bin/env node
"use strict";
const I = require("./intelligence-loop");
let failures = 0; function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }
const auth = { approved: true, authorizedBy: "odg-cto" };
const plans = [{ id: "p1", metrics: { Psuccess: 0.9, Vobjective: 0.8, Qquality: 0.8, Ttime: 0.2, Cresources: 0.2, Rrisk: 0.1, Uuncertainty: 0.1 } }];
// (1) a fully-authorized cycle connects end-to-end: DISCOVER→AUTHORIZE→PLAN→EXECUTE→RECORD→LEARN→MEASURE.
{
  const r = I.runCycle({ discovery: { title: "new cap" }, existingItems: [], authorization: auth, candidatePlans: plans }, { execute: () => ({ mission: "p1", validated: true, status: "SUCCESS" }) });
  check(r.completed === true && r.outcome === "SUCCESS", "authorized cycle completes end-to-end with a SUCCESS outcome");
  check(JSON.stringify(r.connected) === JSON.stringify(["DISCOVER", "AUTHORIZE", "PLAN", "EXECUTE", "RECORD", "LEARN", "MEASURE"]), "all 7 steps connected (system intelligence, not isolated)");
}
// (2) WITHOUT external authorization ⇒ the cycle STOPS at PROPOSED (never self-authorizes).
{
  const r = I.runCycle({ discovery: { title: "new cap" }, existingItems: [], candidatePlans: plans }, { execute: () => ({ mission: "p1", validated: true, status: "SUCCESS" }) });
  check(r.completed === false && r.stage === "AUTHORIZE" && r.proposedOnly === true, "no external authorization ⇒ stops at PROPOSED (never self-authorizes)");
}
// (3) a duplicate discovery is deduped and halts (no re-work).
{
  const r = I.runCycle({ discovery: { title: "existing" }, existingItems: [{ id: "e", title: "existing", status: "ACCEPTED" }], authorization: auth, candidatePlans: plans }, { execute: () => ({ mission: "p1", validated: true, status: "SUCCESS" }) });
  check(r.duplicate === true && r.completed === false, "duplicate discovery ⇒ deduped, cycle halts");
}
// (4) no feasible plan ⇒ the cycle halts at PLAN (hard constraints first).
{
  const r = I.runCycle({ discovery: { title: "new cap" }, existingItems: [], authorization: auth, candidatePlans: [{ id: "bad", policyAllowed: false, metrics: { Psuccess: 1 } }] }, { execute: () => ({ mission: "x", validated: true, status: "SUCCESS" }) });
  check(r.completed === false && r.stage === "PLAN", "no feasible plan ⇒ cycle halts at PLAN (hard constraints enforced)");
}
// (5) a FAILED execution is recorded as a real FAILURE (failure-inclusive learning), cycle still completes the loop.
{
  const r = I.runCycle({ discovery: { title: "new cap" }, existingItems: [], authorization: auth, candidatePlans: plans }, { execute: () => ({ mission: "p1", validated: false, status: "FAILED" }) });
  check(r.completed === true && r.outcome === "FAILURE", "a failed execution ⇒ recorded as a real FAILURE (the loop learns from failures too)");
}
// (6) execution producing no report ⇒ halts fail-closed at EXECUTE (no silent success).
{
  const r = I.runCycle({ discovery: { title: "new cap" }, existingItems: [], authorization: auth, candidatePlans: plans }, { execute: () => null });
  check(r.completed === false && r.stage === "EXECUTE", "no report ⇒ halts fail-closed at EXECUTE");
}
check(/never self-authorizes/i.test(JSON.stringify(I.INTELLIGENCE_LOOP_CONTRACT.invariants)), "contract: never self-authorizes");
check(/system intelligence, not isolated/i.test(JSON.stringify(I.INTELLIGENCE_LOOP_CONTRACT.invariants)), "contract: system intelligence");
if (failures === 0) process.stdout.write("ALL PASS — V12.4 INTELLIGENCE LOOP\n");
process.exit(failures === 0 ? 0 : 1);
export {};
