#!/usr/bin/env node
/*
 * LOT idempotency-guard — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/idempotency-guard.ts →
 * runtime/dist/core/idempotency-guard.js (LEAF, self-contained). Asserts all public exports are
 * BYTE-IDENTICAL (JSON) and frozen, admit() covers PROCEED(unguarded/guarded)/DUPLICATE/CONFLICT with
 * DUPLICATE-before-compare-and-set precedence, and record() is pure (new journal, never overwrites).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/idempotency-guard-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "idempotency-guard.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "idempotency-guard.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT idempotency-guard — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/idempotency-guard.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/idempotency-guard.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["DECISION", "IDEMPOTENCY_CONTRACT", "emptyJournal", "admit", "record"]) {
  check(js[x] !== undefined && ts[x] !== undefined, `both export ${x}`);
}
// Constants byte-identical + frozen.
check(JSON.stringify(js.DECISION) === JSON.stringify(ts.DECISION) && Object.isFrozen(ts.DECISION), "DECISION byte-identical + frozen");
check(JSON.stringify(js.IDEMPOTENCY_CONTRACT) === JSON.stringify(ts.IDEMPOTENCY_CONTRACT) && Object.isFrozen(ts.IDEMPOTENCY_CONTRACT), "IDEMPOTENCY_CONTRACT byte-identical + frozen");
check(JSON.stringify(js.emptyJournal()) === JSON.stringify(ts.emptyJournal()) && Object.isFrozen(ts.emptyJournal()), "emptyJournal() empty + frozen");

// admit() scenarios.
const J = { "applied-1": { ok: true, value: 7 } };
const ADMIT: Array<[string, any, any, any]> = [
  ["unguarded ⇒ PROCEED guarded:false", {}, {}, 0],
  ["guarded new ⇒ PROCEED guarded:true", { idempotencyKey: "k-new", actionId: "A1" }, {}, 0],
  ["DUPLICATE (key applied) ⇒ reconciledResult", { idempotencyKey: "applied-1", actionId: "A2" }, J, 5],
  ["CONFLICT: expected != current", { idempotencyKey: "k", expectedPreviousState: 3 }, {}, 5],
  ["CONFLICT: non-integer version", { expectedPreviousState: 2 }, {}, "x"],
  ["compare-and-set OK ⇒ PROCEED", { idempotencyKey: "k2", expectedPreviousState: 4 }, {}, 4],
  ["precedence: DUPLICATE before CAS (dup key + wrong expected)", { idempotencyKey: "applied-1", expectedPreviousState: 999 }, J, 0],
];
for (const [label, req, jr, ver] of ADMIT) {
  const j = js.admit(req, jr, ver), t = ts.admit(req, jr, ver);
  check(JSON.stringify(j) === JSON.stringify(t) && Object.isFrozen(t), `admit ${label}: BYTE-IDENTICAL + frozen (decision=${j.decision})`);
}
// Semantic spot-checks (on JS ref, == TS by byte-identity).
check(js.admit({}, {}, 0).decision === "PROCEED" && js.admit({}, {}, 0).guarded === false, "unguarded PROCEED is guarded:false");
check(js.admit({ idempotencyKey: "applied-1" }, J, 0).reconciledResult.value === 7, "DUPLICATE reconciles to the prior recorded result verbatim");

// record() purity.
{
  const j0 = js.emptyJournal(), t0 = ts.emptyJournal();
  const j1 = js.record(j0, "k", { r: 1 }), t1 = ts.record(t0, "k", { r: 1 });
  check(JSON.stringify(j1) === JSON.stringify(t1) && Object.isFrozen(t1), "record adds key, frozen, identical");
  check(JSON.stringify(j0) === "{}" && JSON.stringify(t0) === "{}", "record did NOT mutate the input journal (pure)");
  const j2 = js.record(j1, "k", { r: 999 }), t2 = ts.record(t1, "k", { r: 999 });
  check(JSON.stringify(j2) === JSON.stringify(t2) && JSON.stringify(j2) === JSON.stringify(j1), "record never overwrites an existing key");
  check(JSON.stringify(js.record(j0, "", { r: 1 })) === JSON.stringify(ts.record(t0, "", { r: 1 })), "record with empty key ⇒ unchanged (identical)");
  check(JSON.stringify(js.record(j0, "u", undefined)) === JSON.stringify(ts.record(t0, "u", undefined)), "record undefined result ⇒ null (identical)");
}

console.log(failures === 0 ? "ALL PASS — LOT idempotency-guard EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
