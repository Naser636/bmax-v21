#!/usr/bin/env node
"use strict";
/* V375 Lot B — ONE resident-driver L1 SIMULATE cycle over the COMMITTED V12.4 companion. Pure: it calls
 * odg-resident-driver.simulate (no persistence, no execution, canTriggerL2=false) and prints the record as JSON on stdout.
 * It writes NOTHING (no log line either) — designed to run under a read-only filesystem sandbox
 * (scripts/odg-resident-driver-l1-sandbox.sh), which is what proves the "zero write" claim structurally. */
const fs = require("fs");
const D = require("../core/odg-resident-driver.js");
const V124 = require("../core/odg-v124-consolidation.js");
function main() {
  const companion = JSON.parse(fs.readFileSync("docs/odg/v124-consolidated-roadmap.json", "utf8"));
  const program = V124.toContinuityProgram(companion);
  const engaged = process.env.ODG_SCHEDULER_STOP === "1";   // canonical stop signal (same as mission-scheduler)
  const asOf = Date.now();
  const sim = D.simulate({ program, context: { asOfEpochMs: asOf, currentCommit: "l1-sandbox" }, emergencyStopEngaged: engaged });
  process.stdout.write(JSON.stringify({ asOf: new Date(asOf).toISOString(), emergencyStopEngaged: engaged, l1: sim }) + "\n");
}
main();
export {};
