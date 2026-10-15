#!/usr/bin/env node
/*
 * LOT state-transition — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/state-transition.ts →
 * runtime/dist/core/state-transition.js (LEAF, self-contained). Asserts all 7 exports are
 * BYTE-IDENTICAL (JSON) and frozen constants frozen, canonicalize/computeDifference are stable, and
 * validateStateTransition enforces I1–I6 with the SAME deterministic error-list order. No normalisation.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/state-transition-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "state-transition.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "state-transition.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT state-transition — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/state-transition.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/state-transition.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["VERIFICATION_STATUS", "PROOF_REQUIRING", "REQUIRED_FIELDS", "C03_CONTRACT", "canonicalize", "computeDifference", "validateStateTransition"]) {
  check(js[x] !== undefined && ts[x] !== undefined, `both export ${x}`);
}
// Frozen constants byte-identical + frozen.
for (const c of ["VERIFICATION_STATUS", "PROOF_REQUIRING", "REQUIRED_FIELDS", "C03_CONTRACT"]) {
  check(EQ(js[c], ts[c]) && Object.isFrozen(ts[c]), `${c} byte-identical + frozen`);
}

// canonicalize: order-independence + primitives/arrays/nesting.
{
  const CANON = [null, 1, "s", true, [3, 1, 2], { b: 1, a: 2 }, { a: { y: 1, x: 2 }, z: [{ q: 1 }] }, undefined];
  for (const v of CANON) check(js.canonicalize(v) === ts.canonicalize(v), `canonicalize(${JSON.stringify(v)}) identical`);
  check(js.canonicalize({ a: 1, b: 2 }) === js.canonicalize({ b: 2, a: 1 }), "canonicalize is key-order-independent");
}
// computeDifference.
{
  const b = { a: 1, b: 2, same: "x" }, a = { a: 1, b: 9, c: 3, same: "x" };
  check(EQ(js.computeDifference(b, a), ts.computeDifference(b, a)), "computeDifference identical");
}

// validateStateTransition — valid + each invariant failure (deterministic error order).
const valid = {
  state_before: { v: 1 }, action: { do: "x" }, observed_effect: { got: "y" }, state_after: { v: 2 },
  state_version_before: 0, state_version_after: 1, difference: { v: { before: 1, after: 2 } },
  evidence_refs: ["e1"], verification_status: "VERIFIED",
};
const CASES: Array<[string, any]> = [
  ["valid ⇒ ok, normalized frozen", valid],
  ["non-object record", 42],
  ["missing fields", {}],
  ["version not advancing (I2)", { ...valid, state_version_after: 0 }],
  ["proof-requiring no evidence (I5)", { ...valid, evidence_refs: [] }],
  ["identical state + version advance (I6)", { ...valid, state_after: { v: 1 }, difference: {} }],
  ["unknown status (I4)", { ...valid, verification_status: "MAYBE" }],
  ["evidence_refs not string[] (I3)", { ...valid, evidence_refs: [1, 2] }],
  ["empty action (I1)", { ...valid, action: "   " }],
  ["RECORDED no evidence ⇒ ok (coverage)", { ...valid, verification_status: "RECORDED", evidence_refs: [] }],
];
for (const [label, rec] of CASES) {
  const j = js.validateStateTransition(rec), t = ts.validateStateTransition(rec);
  check(EQ(j, t) && Object.isFrozen(t) && Object.isFrozen(t.errors), `validate ${label}: BYTE-IDENTICAL + frozen (ok=${j.ok}, errs=${j.errors.length})`);
}
// Error-ORDER determinism spot-check: a record failing multiple invariants lists them in fixed order.
{
  const multi = { state_before: 1, action: "", observed_effect: "", state_after: 2, state_version_before: -1, state_version_after: -2, difference: 7, evidence_refs: [1], verification_status: "X" };
  check(EQ(js.validateStateTransition(multi).errors, ts.validateStateTransition(multi).errors), "multi-failure error order identical (deterministic)");
}

console.log(failures === 0 ? "ALL PASS — LOT state-transition EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
