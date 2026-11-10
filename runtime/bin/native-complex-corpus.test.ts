#!/usr/bin/env node
"use strict";
// V41 LOT N — hermetic COMPLEX corpus-soundness test (NO model/network). Each task's 4-file REFERENCE implementation must
// assemble and pass its own independent test (guards against a harness bug fabricating a failure); ids must be distinct.
const { COMPLEX_TASKS } = require("./native-complex-corpus");
const B = require("../core/native-project-builder");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

check(Array.isArray(COMPLEX_TASKS) && COMPLEX_TASKS.length >= 8, "the COMPLEX corpus has >= 8 tasks");
const ids = COMPLEX_TASKS.map((t: any) => t.id);
check(new Set(ids).size === ids.length, "all COMPLEX task ids are DISTINCT");

for (const t of COMPLEX_TASKS) {
  const built = B.assembleAndLoad({ "parse.js": t.parse, "a.js": t.a, "b.js": t.b, "report.js": t.report });
  check(built.ok === true, `reference impl of ${t.id} assembles (4-file DAG)`);
  let ok = false; try { ok = t.test(built.modules && built.modules["report.js"]) === true; } catch { ok = false; }
  check(ok, `reference impl of ${t.id} PASSES its own independent test (no harness-fabricated failure)`);
}

if (failures === 0) process.stdout.write(`ALL PASS — V41 COMPLEX CORPUS SOUND (${COMPLEX_TASKS.length} tasks)\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
