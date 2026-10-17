#!/usr/bin/env node
/*
 * LOT incident-recurrence — EQUIVALENCE (historical runtime/core/incident-recurrence.js vs compiled .ts).
 *
 * Offline, deterministic, hermetic: build:runtime compiles runtime/core/incident-recurrence.ts →
 * runtime/dist/core/incident-recurrence.js. analyzeRecurrence is PURE; loadRecurrence's only I/O is an
 * INJECTED store (we pass a fake store on both — NO real autonomy-store read). Each scenario calls the SAME
 * public API (analyzeRecurrence / loadRecurrence / recordFor) on BOTH modules and asserts BYTE-IDENTICAL
 * JSON. Covers: empty/malformed ledgers, the sort (attempts desc → severity → id), the verdict ladder
 * (NONE / FROZEN_LOOP / RECURRENCE / NO_RECURRENCE), summary + topRecurring slicing, the fail-closed store.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/incident-recurrence-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "incident-recurrence.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "incident-recurrence.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT incident-recurrence — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/incident-recurrence.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/incident-recurrence.js emitted by build:runtime");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.analyzeRecurrence === "function" && typeof js.loadRecurrence === "function" && typeof js.recordFor === "function", "JS exports analyze+load+recordFor");
check(typeof ts.analyzeRecurrence === "function" && typeof ts.loadRecurrence === "function" && typeof ts.recordFor === "function", "compiled TS exports analyze+load+recordFor");

const inc = (o: any) => Object.assign({ id: "x", attempts: 1, status: "OPEN", severity: "ERROR", createdAt: "t0", updatedAt: "t0" }, o);

const LEDGERS: Array<[string, any]> = [
  ["null", null],
  ["empty-obj", {}],
  ["empty-incidents", { incidents: {} }],
  ["malformed-incidents", { incidents: "nope" }],
  ["incident-missing-id", { incidents: { a: { attempts: 3 } } }],
  ["single-no-recurrence", { incidents: { a: inc({ id: "a" }) } }],
  ["single-recurring", { incidents: { a: inc({ id: "a", attempts: 4 }) } }],
  ["frozen-loop", { incidents: { a: inc({ id: "a", attempts: 6, status: "FROZEN", maxAttempts: 5 }) } }],
  ["string-attempts", { incidents: { a: inc({ id: "a", attempts: "3" }) } }],
  ["spanned-updates", { incidents: { a: inc({ id: "a", attempts: 2, createdAt: "t0", updatedAt: "t9" }) } }],
  ["sort-by-attempts", { incidents: {
    a: inc({ id: "a", attempts: 2, severity: "ERROR" }),
    b: inc({ id: "b", attempts: 5, severity: "ERROR" }),
    c: inc({ id: "c", attempts: 5, severity: "CRITICAL" }),
  } }],
  ["tie-by-id", { incidents: {
    z: inc({ id: "z", attempts: 3, severity: "ERROR" }),
    a: inc({ id: "a", attempts: 3, severity: "ERROR" }),
    m: inc({ id: "m", attempts: 3, severity: "WARN" }),
  } }],
  ["top-slicing>3", { incidents: {
    a: inc({ id: "a", attempts: 9 }), b: inc({ id: "b", attempts: 8 }),
    c: inc({ id: "c", attempts: 7 }), d: inc({ id: "d", attempts: 6 }),
  } }],
];

for (const [label, ledger] of LEDGERS) {
  check(JSON.stringify(js.analyzeRecurrence(ledger)) === JSON.stringify(ts.analyzeRecurrence(ledger)), `analyzeRecurrence "${label}" byte-identical`);
}

// loadRecurrence with an INJECTED fake store (hermetic — no real autonomy-store).
const fakeStore = (payload: any) => ({ read: (_k: string, _d: any) => payload });
for (const [label, ledger] of LEDGERS) {
  const store = fakeStore(ledger);
  check(JSON.stringify(js.loadRecurrence({ store })) === JSON.stringify(ts.loadRecurrence({ store })), `loadRecurrence(store="${label}") byte-identical`);
}
// fail-closed: a store whose read throws ⇒ NONE on both.
const throwingStore = { read: () => { throw new Error("boom"); } };
check(JSON.stringify(js.loadRecurrence({ store: throwingStore })) === JSON.stringify(ts.loadRecurrence({ store: throwingStore })), "loadRecurrence(throwing store) fail-closed identical");
check(js.loadRecurrence({ store: throwingStore }).verdict === "NONE", "fail-closed verdict is NONE");

// recordFor parity.
{
  const analysis = js.analyzeRecurrence({ incidents: { a: inc({ id: "a", attempts: 3 }), b: inc({ id: "b", attempts: 2 }) } });
  const tAnalysis = ts.analyzeRecurrence({ incidents: { a: inc({ id: "a", attempts: 3 }), b: inc({ id: "b", attempts: 2 }) } });
  for (const id of ["a", "b", "missing", "", null as any, 42 as any]) {
    check(JSON.stringify(js.recordFor(analysis, id)) === JSON.stringify(ts.recordFor(tAnalysis, id)), `recordFor(${JSON.stringify(id)}) byte-identical`);
  }
  check(JSON.stringify(js.recordFor(null, "a")) === JSON.stringify(ts.recordFor(null, "a")), "recordFor(null analysis) identical");
}

console.log(failures === 0 ? "ALL PASS — LOT incident-recurrence EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
