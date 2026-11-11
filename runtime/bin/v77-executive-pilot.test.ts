#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V77 §7/§11 — executive-pilot + local-work-mandate test. Proves the PROPOSED halt is resolved WITHOUT
 * bypassing governance: Level-A local missions execute end-to-end under the OWNER's mandate (authorizedBy=owner,
 * selfAuthored=false); Level-C REFUSED; Level-B PREPARED-not-accepted (no invented sign-off); unknown/revoked ⇒ not
 * authorized; a failed execution ⇒ not closed; the campaign CHAINS. Live module assertions + artifact.
 */

const path = require("path");
const fs = require("fs");
const M = require("../core/local-work-mandate.js");
const LOOP = require("../core/intelligence-loop.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V77_EXECUTIVE_PILOT.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }
const plans = (id: string) => [{ id, metrics: { Psuccess: 0.9, Vobjective: 0.8, Qquality: 0.8, Ttime: 0.2, Cresources: 0.2, Rrisk: 0.1, Uuncertainty: 0.1 } }];

function main(): void {
  // Test 2 — local authorization recognized (owner, not self)
  const a = M.authorizeLocalMission({ id: "m", actions: ["code_edit_local", "test", "commit_local"] });
  check("Level-A local mission ⇒ authorized by OWNER (selfAuthored=false)", a.authorized === true && a.level === "A" && a.authorization.authorizedBy === "owner" && a.authorization.selfAuthored === false);
  check("authorization carries provenance + is revocable + scope LOCAL", /CTO directives V61/.test(a.authorization.provenance) && a.authorization.revocable === true && a.authorization.scope === "LOCAL_REVERSIBLE");
  // Test 3 — scope overflow (Level-C) refused
  check("Level-C action (deploy/vps) ⇒ REFUSED", M.authorizeLocalMission({ id: "m", actions: ["deploy", "vps"] }).authorized === false && M.authorizeLocalMission({ id: "m", actions: ["spend"] }).level === "C");
  // Test 4 — human-authorization mission prepared, not accepted
  const b = M.authorizeLocalMission({ id: "m", actions: ["doc", "canonization"] });
  check("Level-B (sign-off) ⇒ not authorized, PREPARE not accept", b.authorized === false && b.level === "B" && /PREPARE/i.test(b.reason));
  // revocability + fail-closed
  check("revoked mandate ⇒ not authorized", M.authorizeLocalMission({ id: "m", actions: ["test"] }, { revoked: true }).authorized === false);
  check("unknown action ⇒ fail-closed (not authorized)", M.authorizeLocalMission({ id: "m", actions: ["frobnicate"] }).authorized === false);
  check("no declared actions ⇒ fail-closed", M.authorizeLocalMission({ id: "m", actions: [] }).authorized === false);

  // Test 5 — full execution end-to-end with the owner mandate
  const auth = M.authorizeLocalMission({ id: "mx", actions: ["test", "doc"] }).authorization;
  const loop = LOOP.runCycle({ discovery: { title: "mx" }, existingItems: [], authorization: auth, candidatePlans: plans("mx") }, { execute: () => ({ mission: "mx", validated: true, status: "SUCCESS" }) });
  check("Test5: Level-A mission executes END-TO-END + closes (SUCCESS, 7 stages)", loop.completed === true && loop.outcome === "SUCCESS" && loop.connected.length === 7);
  // Test 6 — failed mission ⇒ not accepted
  const failLoop = LOOP.runCycle({ discovery: { title: "mf" }, existingItems: [], authorization: auth, candidatePlans: plans("mf") }, { execute: () => ({ mission: "mf", validated: false, status: "FAILED" }) });
  check("Test6: failed execution ⇒ recorded FAILURE (not falsely closed)", failLoop.outcome === "FAILURE");

  // artifact — chaining + mix
  let art: any = null; try { art = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("Test8/10: artifact shows a CHAINED campaign (>=2 executed)", !!art && art.executed >= 2 && art.chained === true);
  check("Test3/4 in campaign: 1 refused (Level-C) + 1 prepared (Level-B)", !!art && art.refused >= 1 && art.preparedNotAccepted >= 1);
  check("Test9: ODG selects + owner authorizes (not provider, not self)", !!art && /ODG selected|selectedByODG/.test(JSON.stringify(art.campaignLog)) && /authorizedBy.{0,6}owner/i.test(JSON.stringify(art.campaignLog)));
  check("invariant: executes only with owner-provenance Level-A auth; gates preserved", !!art && /ODG selects \(not the provider\)/i.test(art.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V77 executive pilot (Level-A executes under owner mandate; B prepared; C refused; chained; governance intact)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
