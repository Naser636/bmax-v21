#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V65 §3/§4 — benchmark-execution test. Verifies 15 métiers executed ODG-side (reproducible) over CERTIFIED
 * non-contaminated hidden adversarial sets, named external references recorded as an external dependency (not skipped,
 * not substituted as a commercial comparison), ODG-version progression tracked, and world-superiority FAIL-CLOSED (0).
 */

const path = require("path");
const fs = require("fs");
const MULTI = require("../core/metier-benchmark-multidim.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V65_BENCHMARK_EXECUTION.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("benchmark-execution artifact exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  check("15 métiers executed", m.metierCount === 15 && m.results.length === 15);
  check("ALL hidden adversarial sets certified non-contaminated", m.hiddenSetsClean === 15 && m.results.every((r: any) => r.hiddenSet.nonContaminated === true && r.hiddenSet.cases >= 1));
  check("ODG-side reproducible (harness)", MULTI.runMultidim().reproducible === true && m.harnessSummary.reproducible === true);
  check("ODG-version progression tracked per métier", m.results.every((r: any) => typeof r.progression === "string" && r.progression.length > 0));
  check("named external references recorded (not skipped)", Array.isArray(m.externalReferences) && m.externalReferences.length >= 6 && /NOT_EXECUTABLE_LOCALLY/i.test(m.externalReferenceStatus));
  check("external reference NOT executed (honest)", m.results.every((r: any) => r.externalReferenceExecuted === false));
  check("world-superiority FAIL-CLOSED (0)", m.superiorityDemonstrated === 0 && m.results.every((r: any) => /NOT DEMONSTRATED/i.test(r.superiorityVsWorld)));
  check("invariant: ODG-side reproducible is never world-superiority; no commercial-substitute", /never world-superiority/i.test(m.invariant) && /never silently skipped nor substituted as a commercial comparison/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V65 benchmark execution (hidden sets certified, external recorded, superiority fail-closed)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
