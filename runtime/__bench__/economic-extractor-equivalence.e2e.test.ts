#!/usr/bin/env node
/*
 * LOT economic-extractor — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE (no fs/network/clock): build:runtime compiles
 * runtime/core/economic-extractor.ts → runtime/dist/core/economic-extractor.js; build-dist-closure
 * co-locates its dep (economic-unit.js — a TS port) in dist/core. Every function is pure ⇒ BYTE-IDENTICAL.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/economic-extractor-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "economic-extractor.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "economic-extractor.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function both(jsFn: () => any, tsFn: () => any): boolean {
  const run = (f: () => any) => {
    try {
      return { ok: true, value: f() };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  };
  return EQ(run(jsFn), run(tsFn));
}

console.log("LOT economic-extractor — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/economic-extractor.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/economic-extractor.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "economic-unit.js")), "prerequisite: dep economic-unit.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["extract", "jsonPointer", "decimalToMinor"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);

// jsonPointer.
const DOC = { data: { amount: "19.99", nested: { "a/b": 1, "c~d": 2 } }, n: 5 };
for (const [label, ptr] of [["/data/amount", "/data/amount"], ["root ''", ""], ["escaped ~1", "/data/nested/a~1b"], ["escaped ~0", "/data/nested/c~0d"], ["missing", "/nope/x"], ["scalar n", "/n"]] as Array<[string, string]>) {
  check(EQ(js.jsonPointer(DOC, ptr), ts.jsonPointer(DOC, ptr)), `jsonPointer ${label} BYTE-IDENTICAL`);
}
check(both(() => js.jsonPointer(DOC, "bad"), () => ts.jsonPointer(DOC, "bad")), "jsonPointer(no leading /) ⇒ throws identical");

// decimalToMinor.
for (const [raw, scale] of [["19.99", 2], ["19.9", 2], ["19", 2], ["-5.5", 2], ["19.999", 2], ["abc", 2], ["12.3", 0], ["1000000000000000000", 2]] as Array<[string, number]>) {
  check(EQ(js.decimalToMinor(raw, scale), ts.decimalToMinor(raw, scale)), `decimalToMinor(${raw},${scale}) BYTE-IDENTICAL`);
}

// extract — json/regex, OBSERVED/UNKNOWN, throws.
const CASES: Array<[string, any, any]> = [
  ["json OBSERVED + quantity", JSON.stringify({ price: "19.99" }), { type: "json", pointer: "/price", unit: "EUR", kind: "ASSET", scale: 2 }],
  ["json raw-only (no unit)", JSON.stringify({ price: "19.99" }), { type: "json", pointer: "/price" }],
  ["json pointer non-scalar ⇒ UNKNOWN", JSON.stringify({ o: { x: 1 } }), { type: "json", pointer: "/o" }],
  ["json body invalid ⇒ UNKNOWN", "{nope", { type: "json", pointer: "/x" }],
  ["json excess precision ⇒ UNKNOWN", JSON.stringify({ p: "19.999" }), { type: "json", pointer: "/p", unit: "EUR", kind: "ASSET", scale: 2 }],
  ["regex OBSERVED", "Total: 42.50 EUR", { type: "regex", pattern: "Total: ([0-9.]+)", group: 1, unit: "EUR", kind: "ASSET", scale: 2 }],
  ["regex no match ⇒ UNKNOWN", "nothing here", { type: "regex", pattern: "([0-9]+)" }],
  ["regex group absent ⇒ UNKNOWN", "x", { type: "regex", pattern: "x", group: 5 }],
];
for (const [label, body, rule] of CASES) {
  check(EQ(js.extract(body, rule), ts.extract(body, rule)), `extract ${label} BYTE-IDENTICAL`);
}
check(both(() => js.extract("{}", null), () => ts.extract("{}", null)), "extract(null rule) ⇒ throws identical");
check(both(() => js.extract("{}", { type: "nope" }), () => ts.extract("{}", { type: "nope" })), "extract(bad type) ⇒ throws identical");
check(both(() => js.extract("x", { type: "regex", pattern: "(" }), () => ts.extract("x", { type: "regex", pattern: "(" })), "extract(invalid regex) ⇒ throws identical");

// Spot-check the OBSERVED shape.
const o = js.extract(JSON.stringify({ price: "19.99" }), { type: "json", pointer: "/price", unit: "EUR", kind: "ASSET", scale: 2 });
check(o.status === "OBSERVED" && o.raw === "19.99" && o.quantity && o.quantity.minor === 1999 && o.quantity.scale === 2, "extract OBSERVED: exact minor 1999 scale 2");

console.log(failures === 0 ? "ALL PASS — LOT economic-extractor EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
