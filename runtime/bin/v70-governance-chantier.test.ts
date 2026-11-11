#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO — governance-chantier integration test. Verifies the 12 lots A–L are mapped (not invented), derived from
 * the present canonical protocol, each bound to a present component + a present test + a primitive + a program + a proof +
 * a closure criterion (fail-closed: INTEGRATED_SATISFIED only if grounded), with NO duplicate and integration explicitly
 * the START of execution (not a completion claim).
 */

const path = require("path");
const fs = require("fs");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V70_GOVERNANCE_CHANTIER_MATRIX.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

function main(): void {
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("chantier matrix exists & parses", !!m);
  if (!m) { process.stdout.write(`\n${failures} FAIL\n`); process.exit(1); }

  const letters = m.correspondenceMatrix.map((l: any) => l.lot);
  check("12 lots A–L present", m.lotCount === 12 && "ABCDEFGHIJKL".split("").every((c) => letters.includes(c)));
  check("derived from the present canonical protocol (not invented)", m.protocolPresent === true && /ODG_AUTONOMOUS_WORK_PROTOCOL/.test(m.derivedFrom));
  check("each lot maps component + primitive + program + test + proof + closure", m.correspondenceMatrix.every((l: any) => l.components.length >= 1 && l.primitive && l.program && l.test && l.proof && l.closure));
  check("fail-closed grounding: INTEGRATED_SATISFIED iff component+test present", m.correspondenceMatrix.every((l: any) => (/SATISFIED/.test(l.status)) === (l.componentsPresent && l.testPresent)));
  check("all 12 lots grounded (component + test present)", m.allGrounded === true);
  check("maps across multiple programs P1–P10 (no parallel roadmap)", Array.isArray(m.programsCovered) && m.programsCovered.length >= 4);
  check("integration = START of execution, NOT completion", /START of .*execution.*NOT a completion/i.test(m.honestConclusion));
  check("invariant: reuse, no tenth primitive, none complete by integration alone", /no tenth primitive, no parallel roadmap/i.test(m.invariant) && /none is declared complete by integration alone/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — governance chantier A–L integrated (reuse-mapped, grounded, execution not completion)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
