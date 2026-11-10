#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V75 §6 — test-matrix harness test. Verifies the structured record schema, that a non-measured result is
 * never upgraded to PASS, a thrown check ⇒ BLOCKED, NOT_APPLICABLE is kept distinct, all 7 domains are exercised with
 * real modules, and the matrix artifact is honest (0 FAIL/BLOCKED among the real checks). Live harness assertions.
 */

const path = require("path");
const fs = require("fs");
const TR = require("../core/test-record.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V75_TEST_MATRIX.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  // LIVE harness behaviour
  const schema = ["test_id", "domain", "scenario", "input", "expected", "observed", "status", "duration", "resource_metrics", "evidence", "reproducibility", "limitations"];
  const pass = TR.record({ test_id: "t", domain: "unit", scenario: "s", run: () => 2 + 2, assert: (o: any) => o === 4 });
  check("record carries the full 12-field schema", schema.every((k) => k in pass));
  check("passing check ⇒ PASS + duration measured", pass.status === "PASS" && typeof pass.duration === "number");
  check("resource_metrics OBSERVED, tokens NOT_MEASURED", pass.resource_metrics && typeof pass.resource_metrics.wallMs === "number" && pass.resource_metrics.tokens === "NOT_MEASURED");
  check("thrown check ⇒ BLOCKED (never PASS)", TR.record({ test_id: "t", run: () => { throw new Error("boom"); }, assert: () => true }).status === "BLOCKED");
  check("no assert + no explicit ⇒ NOT_MEASURED (never fake PASS)", TR.record({ test_id: "t", observed: 1 }).status === "NOT_MEASURED");
  check("explicit NOT_MEASURED honoured (not upgraded)", TR.record({ test_id: "t", status: "NOT_MEASURED", run: () => 1, assert: () => true }).status === "NOT_MEASURED");
  check("applicable:false ⇒ NOT_APPLICABLE", TR.record({ test_id: "t", applicable: false }).status === "NOT_APPLICABLE");
  check("failing assert ⇒ FAIL", TR.record({ test_id: "t", run: () => 1, assert: (o: any) => o === 2 }).status === "FAIL");

  // artifact assertions
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("matrix artifact exists", !!m);
  if (m) {
    check("7 domains exercised", m.domainsCovered.length === 7);
    check("honest: 0 FAIL + 0 BLOCKED among real checks", m.tally.FAIL === 0 && m.tally.BLOCKED === 0 && m.honest === true);
    check("NOT_MEASURED + NOT_APPLICABLE present & distinct from PASS", m.tally.NOT_MEASURED >= 1 && m.tally.NOT_APPLICABLE >= 1);
    check("every record has status in the allowed set", m.records.every((r: any) => TR.STATUS.includes(r.status)));
  }

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V75 structured test-matrix harness (full schema, non-measured never PASS, 7 domains real)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
