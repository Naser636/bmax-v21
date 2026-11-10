#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V66 §7 — weekly governed improvement-cycle test. Verifies the cycle is EXECUTED end-to-end (functional,
 * not described): without external authorization it STOPS at PROPOSED (no self-promotion); with an owner/CTO
 * authorization it completes all 7 stages with a recorded outcome. Re-runs the canonical loop live to confirm. Fail-closed.
 */

const path = require("path");
const fs = require("fs");
const LOOP = require("../core/intelligence-loop.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V66_WEEKLY_IMPROVEMENT_CYCLE.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const plans = [{ id: "p", metrics: { Psuccess: 0.9, Vobjective: 0.8, Qquality: 0.8, Ttime: 0.2, Cresources: 0.2, Rrisk: 0.1, Uuncertainty: 0.1 } }];
const execute = () => ({ mission: "p", validated: true, status: "SUCCESS" });

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("weekly-cycle artifact exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  check("artifact: governance invariant held (unauthorized stops at PROPOSED)", m.governanceInvariantHeld === true && m.tickA_unauthorized.stage === "AUTHORIZE");
  check("artifact: ran end-to-end (7 stages) with recorded outcome", m.ranEndToEnd === true && m.tickB_authorized.outcome === "SUCCESS");

  // LIVE re-run to confirm it's a real execution, not a stored string.
  const unauth = LOOP.runCycle({ discovery: { title: "live" }, existingItems: [], candidatePlans: plans }, { execute });
  check("LIVE: no external authorization ⇒ stops at PROPOSED (no self-promotion)", unauth.completed === false && unauth.stage === "AUTHORIZE" && unauth.proposedOnly === true);
  const auth = LOOP.runCycle({ discovery: { title: "live" }, existingItems: [], authorization: { approved: true, authorizedBy: "odg-cto" }, candidatePlans: plans }, { execute });
  check("LIVE: external authorization ⇒ completes all 7 stages", auth.completed === true && JSON.stringify(auth.connected) === JSON.stringify(["DISCOVER", "AUTHORIZE", "PLAN", "EXECUTE", "RECORD", "LEARN", "MEASURE"]));
  const failed = LOOP.runCycle({ discovery: { title: "live" }, existingItems: [], authorization: { approved: true, authorizedBy: "odg-cto" }, candidatePlans: plans }, { execute: () => ({ mission: "p", validated: false, status: "FAILED" }) });
  check("LIVE: failed execution recorded as real FAILURE (learns from failures)", failed.completed === true && failed.outcome === "FAILURE");

  check("invariant: one canonical loop reused; never self-authorizes/promotes", /One canonical loop, reused/i.test(m.invariant) && /never self-authorizes or self-promotes/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V66 weekly governed improvement cycle (executed end-to-end, governance held)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
