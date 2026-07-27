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

const factory = require("../core/mission-contract-factory");

const dryRun = process.argv.includes("--dry-run");
const report = factory.generateMissing(process.cwd(), { write: !dryRun });

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
console.log(
    report.generated.length > 0
        ? "All missing roadmap contracts materialised. `odg autonomy` can now run the full campaign."
        : "No gaps: every roadmap mission already has an executable contract.",
);
console.log("======================================");

process.exit(0);
