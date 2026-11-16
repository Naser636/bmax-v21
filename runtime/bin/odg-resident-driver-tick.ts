#!/usr/bin/env node
"use strict";
/*
 * V242 — ODG RESIDENT-DRIVER L0 TICK (CLI entrypoint for the user-systemd service). Runs ONE bounded L0 OBSERVE cycle
 * and EXITS (Type=oneshot; no daemon loop, no polling). It reuses odg-resident-driver.observe over the committed V12.4
 * consolidated roadmap (read-only), prints the state + the no-write proof, and appends a TECHNICAL trace line to a
 * DEDICATED gitignored log (runtime/logs/resident-driver-l0.log) — NOT a business register/source/config. In L0 it
 * modifies NO business state. Fail-closed: any error ⇒ ERROR line + exit 0 (a tick must never crash-loop the timer).
 */
const fs = require("fs");
const path = require("path");
const D = require("../core/odg-resident-driver.js");
const V124 = require("../core/odg-v124-consolidation.js");

function nowIso(): string { return new Date().toISOString(); } // CLI only (not a pure module) — a timestamp for the trace line

function main() {
  let line: string;
  try {
    const companion = JSON.parse(fs.readFileSync("docs/odg/v124-consolidated-roadmap.json", "utf8"));
    const program = V124.toContinuityProgram(companion);
    const r = D.observe({ program, context: { asOfEpochMs: Date.now(), currentCommit: "resident" } });
    line = `[${nowIso()}] L0 tick: level=${r.level} state=${r.state} workAvailable=${r.observation ? r.observation.workAvailable : "n/a"} nextEligible=${r.observation ? r.observation.nextEligible : "n/a"} writes=${r.writes.length} modifiedBusinessState=${r.modifiedBusinessState} executedMission=${r.executedMission}`;
    process.stdout.write(line + "\n");
  } catch (e: any) {
    line = `[${nowIso()}] L0 tick: state=ERROR reason=${String(e && e.message || e)} modifiedBusinessState=false`;
    process.stdout.write(line + "\n");
  }
  // technical trace ONLY (dedicated gitignored log); never a business register. Best-effort; a trace failure never fails the tick.
  try {
    const logDir = path.join("runtime", "logs");
    if (fs.existsSync(logDir)) fs.appendFileSync(path.join(logDir, "resident-driver-l0.log"), line + "\n");
  } catch { /* trace is optional (Phase 5: driver must work without it) */ }
  process.exit(0);
}
main();
export {};
