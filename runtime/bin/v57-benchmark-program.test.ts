#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V57 (§2) — 15-métier benchmark-program honesty test. Verifies the program: (a) covers all 15 métiers with
 * the five strictly-separate states; (b) ODG side is executed+reproducible over NON-CONTAMINATED synthetic sets; (c) is
 * FAIL-CLOSED on the two strongest claims — independent_confirmed=0 and superiority_demonstrated=0 for ALL métiers; (d)
 * recomputes identically (reproducible); (e) never conflates an ODG-side result with superiority.
 */

const path = require("path");
const fs = require("fs");
const MULTI = require("../core/metier-benchmark-multidim.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V57_15_METIERS_BENCHMARK_PROGRAM.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null;
  try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("benchmark program exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  // (a) coverage + five states
  check("covers 15 métiers", m.metierCount === 15 && m.program.length === 15);
  const states = ["designed", "executed", "reproducible", "independently_confirmed", "superiority_demonstrated"];
  check("every métier carries the five separate states", m.program.every((p: any) => states.every((s) => s in p.states)));

  // (b) ODG side executed + reproducible over non-contaminated sets
  check("all designed", m.tally.designed === 15);
  check("all ODG-side executed", m.tally.executed === 15);
  check("all ODG-side reproducible", m.tally.reproducible === 15);
  check("all synthetic datasets non-contaminated", m.tally.datasetsClean === 15 && m.program.every((p: any) => p.syntheticDataset.nonContaminated === true));

  // (c) FAIL-CLOSED on the two strongest claims
  check("independent-confirmation FAIL-CLOSED (0)", m.tally.independently_confirmed === 0 && m.program.every((p: any) => p.states.independently_confirmed === false));
  check("superiority FAIL-CLOSED (0)", m.tally.superiority_demonstrated === 0 && m.program.every((p: any) => p.states.superiority_demonstrated === false));
  check("each métier states gap-to-reference NOT MEASURED", m.program.every((p: any) => /NOT MEASURED/i.test(p.gapToReference)));

  // (d) reproducible: re-running the underlying harness gives the same effective/reproducible signal
  const re = MULTI.runMultidim();
  check("underlying harness reproducible (effectiveRate 1, reproducible true)", re.effectiveRate === 1 && re.reproducible === true);
  check("program records the same harness summary", m.odgHarnessSummary.effectiveRate === re.effectiveRate && m.odgHarnessSummary.reproducible === re.reproducible);

  // (e) invariant: ODG-side result is never superiority
  check("invariant: ODG-side reproducible is NEVER superiority", /never superiority/i.test(m.invariant));
  check("conclusion: has NOT demonstrated world-superiority", /has NOT demonstrated world-superiority/i.test(m.honestConclusion));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V57 15-métier benchmark program (designed+executed+reproducible; superiority fail-closed 0)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
