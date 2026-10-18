#!/usr/bin/env node
/*
 * `odg generate-contracts` — Mission Contract Factory driver (TS port → runtime/dist/bin/
 * odg-generate-contracts.js, DEFAULT; runtime/bin/odg-generate-contracts.js is the ODG_RUNTIME=js
 * rollback). All behaviour lives in runtime/core/mission-contract-factory + mission-synthesizer (sibling
 * ../core → resolve to dist/core from runtime/dist/bin). --dry-run detects gaps without writing. Exit 0
 * unless a factory-generated contract on disk is structurally invalid (Convergence surfaces it as PARTIAL).
 */
"use strict";

const fs = require("fs");
const factory = require("../core/mission-contract-factory");
const synth = require("../core/mission-synthesizer");

const dryRun = process.argv.includes("--dry-run");
const report = factory.generateMissing(process.cwd(), { write: !dryRun });

function auditGeneratedContracts(): any {
  const audit: any = { total: 0, valid: 0, invalid: [] };
  let files: string[] = [];
  try {
    files = fs.readdirSync("runtime/missions").filter((f: string) => f.endsWith(".json")).sort();
  } catch {
    return audit;
  }
  for (const f of files) {
    let raw: any;
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

process.exit(audit.invalid.length > 0 ? 1 : 0);

export {};
