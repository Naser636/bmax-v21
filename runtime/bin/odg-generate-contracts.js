#!/usr/bin/env node

/*
 * `odg generate-contracts` — Mission Contract Factory driver.
 *
 * Reads runtime/governance/ROADMAP.json, generates a complete Mission-Loader-conformant contract for
 * every roadmap entry whose contract is missing, validates and writes it. Adds no logic of its own:
 * all behaviour lives in runtime/core/mission-contract-factory.js. Pass --dry-run to detect the gaps
 * without writing. Exit code 0 always (materialising gaps is never itself a failure); a report is
 * printed so the operator (and the autonomy loop that calls the same factory) sees what was created.
 */

"use strict";

const fs = require("fs");
const factory = require("../core/mission-contract-factory");
const synth = require("../core/mission-synthesizer");

const dryRun = process.argv.includes("--dry-run");
const report = factory.generateMissing(process.cwd(), { write: !dryRun });

// CONVERGENCE: every factory-generated contract on disk must be a NORMAL, valid Runtime proof before
// the campaign builds on it. Re-validate them here (the Convergence Orchestrator runs this driver as
// Step 1) with the SAME guard the Mission Loader enforces. A broken generated contract makes this
// driver exit non-zero so `odg converge` reports the contract step as PARTIAL instead of silently
// building on an invalid contract. Reused validator — no new logic.
function auditGeneratedContracts() {
  const audit = { total: 0, valid: 0, invalid: [] };
  let files = [];
  try {
    files = fs.readdirSync("runtime/missions").filter((f) => f.endsWith(".json")).sort();
  } catch {
    return audit;
  }
  for (const f of files) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(`runtime/missions/${f}`, "utf8"));
    } catch {
      continue;
    }
    if (!raw || raw.generatedBy !== "mission-contract-factory") continue;
    audit.total += 1;
    if (synth.isValidContract(raw)) audit.valid += 1;
    else audit.invalid.push(f.replace(/\.json$/, ""));
  }
  return audit;
}
const audit = auditGeneratedContracts();

console.log("======================================");
console.log("MISSION CONTRACT FACTORY");
console.log("======================================");
console.log("Roadmap    :", report.roadmap.length, "mission(s)");
console.log("Mode       :", dryRun ? "DRY-RUN (no write)" : "WRITE");
console.log("Generated  :", report.generated.length);
for (const g of report.generated) {
    console.log("   +", g.mission, "->", g.path);
}
console.log("Skipped    :", report.skipped.length, report.skipped.length ? `(already authored: ${report.skipped.join(", ")})` : "");
if (report.invalid.length > 0) {
    console.log("Invalid    :", report.invalid.join(", "), "(NOT written — structural guard rejected)");
}
console.log("--------------------------------------");
console.log("Generated contracts on disk:", audit.total, "(valid:", audit.valid + ")");
if (audit.invalid.length > 0) {
    console.log("INVALID generated contracts:", audit.invalid.join(", "));
}
console.log("--------------------------------------");
console.log(
    report.generated.length > 0
        ? "All missing roadmap contracts materialised. `odg autonomy` can now run the full campaign."
        : "No gaps: every roadmap mission already has an executable contract.",
);
console.log("======================================");

// Non-zero ONLY when a factory-generated contract on disk is structurally invalid — so the
// Convergence Orchestrator surfaces it as a PARTIAL contract step. Materialising gaps is never itself
// a failure (report.invalid entries are refused, never written), so the happy path still exits 0.
process.exit(audit.invalid.length > 0 ? 1 : 0);
