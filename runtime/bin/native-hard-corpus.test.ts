#!/usr/bin/env node
"use strict";
// V42 LOT O — hermetic HARD corpus-soundness test (NO model/network). Each task's REFERENCE implementation (`ref`, used
// only by the harness and never shown to the model) must assemble as a full multi-file DAG and pass its own independent
// test (with hidden edge cases). Guards against a harness bug fabricating a failure; ids must be distinct; contracts must
// be SPEC-ONLY (not contain the implementation) so the benchmark measures reasoning, not transcription.
const { HARD_TASKS } = require("./native-hard-corpus");
const B = require("../core/native-project-builder");
let failures = 0;
function check(c: any, l: any): void { if (!c) { failures++; process.stderr.write("FAIL: " + l + "\n"); } }

check(Array.isArray(HARD_TASKS) && HARD_TASKS.length >= 12, "the HARD corpus has >= 12 tasks");
const ids = HARD_TASKS.map((t: any) => t.id);
check(new Set(ids).size === ids.length, "all HARD task ids are DISTINCT");
check(new Set(HARD_TASKS.map((t: any) => t.family)).size >= 4, "at least 4 distinct structural families");

for (const t of HARD_TASKS) {
  const files: any = {}; for (const f of t.files) files[f.path] = f.ref;
  const built = B.assembleAndLoad(files);
  check(built.ok === true, `reference impl of ${t.id} assembles (${t.files.length}-file DAG)`);
  let ok = false; try { ok = t.test(built.modules && built.modules["report.js"]) === true; } catch { ok = false; }
  check(ok, `reference impl of ${t.id} PASSES its own independent test (hidden edge cases; no harness-fabricated failure)`);
  // SPEC-ONLY guard: a contract must NOT contain the implementation body (no 'module.exports =' code in the spec).
  for (const f of t.files) check(!/module\.exports\s*=/.test(f.contract), `contract of ${t.id}/${f.path} is SPEC-ONLY (no implementation leaked)`);
}

if (failures === 0) process.stdout.write(`ALL PASS — V42 HARD CORPUS SOUND + SPEC-ONLY (${HARD_TASKS.length} tasks)\n`);
process.exit(failures === 0 ? 0 : 1);

export {};
