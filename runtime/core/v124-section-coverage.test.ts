#!/usr/bin/env node
"use strict";
const assert = require("assert");
const SC = require("./v124-section-coverage");
let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }
console.log("V12.4 Phase-3 — 122-SECTION COVERAGE + TWO-CTO-OUTPUTS FUSION");

// POSITIVE: all 122 sections covered exactly once (no gap/overlap/drop).
{
  const v = SC.verifyCoverage();
  check(v.ok === true, "fail-closed coverage proof passes");
  check(v.covered === 122 && v.totalSections === 122, "all 122 sections covered");
  check(v.gaps.length === 0, "no gap (no silently-dropped requirement)");
  check(v.overlaps.length === 0, "no overlap (each section in exactly one block)");
  check(v.beyond.length === 0 && v.malformed === 0, "no section beyond §122, no malformed range");
  check(SC.BLOCKS.length === 32, "Préambule + 31 Parts = 32 structural blocks");
}

// the two CTO outputs are named real files (target roadmap + reality matrix); second distinct source honest.
{
  check(/ODG_MASTER_ROADMAP_V12.4/.test(SC.TWO_CTO_OUTPUTS.target.file), "TARGET output = owner-supplied roadmap");
  check(/TRACEABILITY_MATRIX/.test(SC.TWO_CTO_OUTPUTS.reality.file), "REALITY output = traceability matrix");
  check(/NOT_RECOVERABLE/.test(SC.TWO_CTO_OUTPUTS.distinctSecondSource.status), "a distinct second source, if meant, is honestly NOT_RECOVERABLE (not fabricated)");
}

// NEGATIVE/structural: the first block starts at §1 and the last ends at §122 (full span).
{
  check(SC.BLOCKS[0].range[0] === 1, "coverage starts at §1 (Préambule)");
  check(SC.BLOCKS[SC.BLOCKS.length - 1].range[1] === 122, "coverage ends at §122 (Décisions finales)");
}

check(SC.V124_SECTION_COVERAGE_CONTRACT.invariants.some((i: any) => /no silent drop/.test(i)), "contract documents the no-silent-drop guarantee");

console.log(failures === 0 ? "ALL PASS — V12.4 Phase-3 SECTION COVERAGE + FUSION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
