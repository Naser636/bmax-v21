#!/usr/bin/env node
"use strict";

/*
 * WI-A4-32 — primitive-validation. Loads the 8 runtime/core canonical primitive modules (ALLOCATOR is vnext),
 * builds the matrix, and asserts: exactly nine primitives, no tenth, nine distinct responsibilities (no merge),
 * STATE + EVIDENCE verified by their key invariant export, ALLOCATOR additive (Seam B), and that the canonical
 * modules load. Pure/deterministic matrix. Run: node_modules/.bin/tsx runtime/core/primitive-validation.test.ts
 */
const assert = require("assert");
const V = require("./primitive-validation");

let failures = 0;
function check(c: any, label: any) { if (c) { console.log("  ok -", label); } else { failures++; console.log("  FAIL", label); } assert.ok(c, label); }

console.log("WI-A4-32 — NINE-PRIMITIVE VALIDATION MATRIX");

// load each canonical runtime/core module (fail-safe)
const loaded: any = {};
for (const mod of V.canonModules()) {
  try { loaded[mod] = { ok: true, exports: require("./" + mod) }; }
  catch (e: any) { loaded[mod] = { ok: false, error: String(e && e.message || e) }; }
}
const matrix = V.validatePrimitives(loaded);

check(matrix.count === 9 && matrix.noTenth === true, "exactly NINE primitives, no tenth");
check(matrix.noDuplicateResponsibility === true, "nine distinct primitives (no artificial merge)");
check(matrix.rows.find((r: any) => r.primitive === "ALLOCATOR").status === "INTEGRATED_ADDITIVE", "ALLOCATOR = INTEGRATED_ADDITIVE (vnext, Seam B)");
check(matrix.rows.find((r: any) => r.primitive === "STATE").status === "VERIFIED", "STATE VERIFIED (validateStateTransition present)");
check(matrix.rows.find((r: any) => r.primitive === "EVIDENCE").status === "VERIFIED", "EVIDENCE VERIFIED (stampProvenance present)");
// all canonical runtime/core modules actually load (present)
const presentCount = matrix.rows.filter((r: any) => r.present).length;
check(presentCount === 9, `all 9 primitive modules present (loaded) — got ${presentCount}`);
check(matrix.verified >= 8, `at least 8 primitives VERIFIED/ADDITIVE — got ${matrix.verified}`);
// print the matrix for the audit record
for (const r of matrix.rows) console.log(`     ${r.primitive.padEnd(9)} ${String(r.status).padEnd(20)} ${r.module}`);
// determinism
check(JSON.stringify(V.validatePrimitives(loaded)) === JSON.stringify(V.validatePrimitives(loaded)), "deterministic matrix");

console.log(failures === 0 ? "ALL PASS — WI-A4-32 PRIMITIVE VALIDATION" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
export {};
