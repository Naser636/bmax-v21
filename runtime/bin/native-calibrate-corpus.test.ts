#!/usr/bin/env node
"use strict";
// V40 LOT L — hermetic corpus-soundness test (NO model/network). Guards against a harness bug fabricating a failure: each
// task's REFERENCE implementation (its own contract code) MUST pass its own independent test, and the tasks MUST be distinct.
const { SIMPLE_TASKS } = require("./native-calibrate-corpus");
const B = require("../core/native-project-builder");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

check(Array.isArray(SIMPLE_TASKS) && SIMPLE_TASKS.length >= 20, "the corpus has >= 20 tasks");
const ids = SIMPLE_TASKS.map((t: any) => t.id);
check(new Set(ids).size === ids.length, "all task ids are DISTINCT (no repetitions presented as independent)");

for (const t of SIMPLE_TASKS) {
  const built = B.assembleAndLoad({ "helper.js": t.helper, "main.js": t.main });
  check(built.ok === true, `reference impl of ${t.id} assembles`);
  let ok = false; try { ok = t.test(built.modules && built.modules["main.js"]) === true; } catch { ok = false; }
  check(ok, `reference impl of ${t.id} PASSES its own independent test (no harness-fabricated failure)`);
}

if (failures === 0) process.stdout.write(`ALL PASS — V40 CALIBRATION CORPUS SOUND (${SIMPLE_TASKS.length} tasks)\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
