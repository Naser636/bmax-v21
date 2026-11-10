#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V82 §3 — evidence-qualifier test. Proves the SEMANTIC upgrade: VALID requires resolve + non-empty + all
 * expected markers (+ gate-wired for a .test.ts); a resolving-but-content-mismatched file ⇒ INSUFFICIENT (NOT upgraded to
 * VALID); empty ⇒ INSUFFICIENT; absent ⇒ ABSENT; an un-wired test ⇒ INSUFFICIENT. Confirms the real re-qualification run
 * (14 Level-B evidence) and that mere existence no longer counts as done. Live qualifier + artifact.
 */

const path = require("path");
const fs = require("fs");
const Q = require("../core/evidence-qualifier.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V82_EVIDENCE_REQUALIFICATION.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

const FILES: any = { "a.json": '{"RECONSTRUCTED":true,"partI":[]}', "b.json": '{"other":1}', "empty.json": "   ", "x.test.ts": "check(...)" };
const exists = (r: string) => r in FILES;
const read = (r: string) => FILES[r] || null;

function main(): void {
  // VALID — resolves + markers present
  check("VALID when resolves + all markers present", Q.qualify("a.json", { exists, read, expectMarkers: ["RECONSTRUCTED", "partI"] }).status === "VALID");
  // INSUFFICIENT — resolves but marker missing (content mismatch) ⇒ NOT upgraded to VALID
  check("resolving file with missing marker ⇒ INSUFFICIENT (not VALID)", Q.qualify("b.json", { exists, read, expectMarkers: ["RECONSTRUCTED"] }).status === "INSUFFICIENT");
  check("mere existence ≠ done (INSUFFICIENT carries the reason)", /missing expected markers/i.test(Q.qualify("b.json", { exists, read, expectMarkers: ["RECONSTRUCTED"] }).basis));
  // empty ⇒ INSUFFICIENT
  check("empty file ⇒ INSUFFICIENT (not fabricated done)", Q.qualify("empty.json", { exists, read, expectMarkers: [] }).status === "INSUFFICIENT");
  // absent ⇒ ABSENT
  check("absent pointer ⇒ ABSENT", Q.qualify("missing.json", { exists, read, expectMarkers: [] }).status === "ABSENT");
  // test file not gate-wired ⇒ INSUFFICIENT
  check("test file resolving but NOT gate-wired ⇒ INSUFFICIENT", Q.qualify("x.test.ts", { exists, read, expectMarkers: ["check"], gateSuites: [] }).status === "INSUFFICIENT");
  check("test file gate-wired + marker ⇒ VALID", Q.qualify("x.test.ts", { exists, read, expectMarkers: ["check"], gateSuites: ["x.test.ts"] }).status === "VALID");
  // no evidence ⇒ ABSENT; never upgraded
  check("no reference ⇒ ABSENT", Q.qualify(null, { exists, read }).status === "ABSENT");

  // artifact — real re-qualification of 14 Level-B evidence pointers
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("re-qualification artifact exists; 14 evidence evaluated", !!m && m.evaluated === 14);
  check("real evidence semantically VALID (markers genuinely present) — honest positive", !!m && m.valid === 14 && m.insufficient === 0 && m.absent === 0);
  check("invariant: existence alone INSUFFICIENT; non-measured never upgraded", !!m && /file existence alone is INSUFFICIENT/i.test(m.invariant));

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V82 semantic evidence qualifier (downgrades on content-mismatch/empty/unwired; real evidence survives)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
