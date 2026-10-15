#!/usr/bin/env node
/*
 * LOT economic-unit — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE (no I/O, no clock): build:runtime compiles runtime/core/economic-unit.ts
 * → runtime/dist/core/economic-unit.js (LEAF, deps=0). Asserts all exports BYTE-IDENTICAL, frozen
 * constants frozen, exact integer arithmetic, same-unit enforcement (throws + exact message), format,
 * registry, costMeasurement + valueComponents. No normalisation needed (pure).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/economic-unit-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "economic-unit.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "economic-unit.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Run fn on both; compare {ok,value|error} so throws and returns both compare identically. */
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

console.log("LOT economic-unit — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/economic-unit.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/economic-unit.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
const EXPORTS = ["KIND", "BASIS", "ECONOMIC_CONTRACT", "emptyRegistry", "declareUnit", "hasUnit", "getUnit", "quantity", "isQuantity", "add", "sub", "compare", "gte", "isZero", "format", "costMeasurement", "valueComponents"];
for (const x of EXPORTS) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
for (const c of ["KIND", "BASIS", "ECONOMIC_CONTRACT"]) check(EQ(js[c], ts[c]) && Object.isFrozen(ts[c]), `${c} byte-identical + frozen`);

// quantity + arithmetic (exact).
const q = (m: any, lib: any, u = "EUR", k = lib.KIND.ASSET, s = 2) => lib.quantity(u, k, m, s);
check(EQ(js.quantity("EUR", js.KIND.ASSET, 150, 2), ts.quantity("EUR", ts.KIND.ASSET, 150, 2)) && Object.isFrozen(ts.quantity("EUR", ts.KIND.ASSET, 150, 2)), "quantity frozen + identical");
check(EQ(js.add(q(150, js), q(2550, js, "EUR", js.KIND.ASSET, 3)), ts.add(q(150, ts), q(2550, ts, "EUR", ts.KIND.ASSET, 3))), "add aligns scales exactly (2 vs 3) BYTE-IDENTICAL");
check(EQ(js.sub(q(500, js), q(150, js)), ts.sub(q(500, js), q(150, js))), "sub exact BYTE-IDENTICAL");
check(js.compare(q(150, js), q(500, js)) === ts.compare(q(150, ts), q(500, ts)) && js.compare(q(150, js), q(500, js)) === -1, "compare identical (-1)");
check(js.gte(q(500, js), q(500, js)) === ts.gte(q(500, ts), q(500, ts)), "gte identical");
check(js.isZero(q(0, js)) === ts.isZero(q(0, ts)) && js.isZero(q(0, js)) === true, "isZero identical");

// same-unit enforcement + error messages.
check(both(() => js.add(q(1, js, "EUR", js.KIND.ASSET), q(1, js, "USD", js.KIND.ASSET)), () => ts.add(q(1, ts, "EUR", ts.KIND.ASSET), q(1, ts, "USD", ts.KIND.ASSET))), "add unit mismatch ⇒ throws identical message");
check(both(() => js.quantity("EUR", js.KIND.ASSET, 1.5, 2), () => ts.quantity("EUR", ts.KIND.ASSET, 1.5, 2)), "quantity float minor ⇒ throws identical");
check(both(() => js.quantity("", js.KIND.ASSET, 1, 2), () => ts.quantity("", ts.KIND.ASSET, 1, 2)), "quantity empty unit ⇒ throws identical");

// format (exact decimal).
for (const [m, s] of [[150, 2], [5, 2], [-1234, 3], [7, 0], [1000, 2]] as Array<[number, number]>) {
  check(js.format(js.quantity("EUR", js.KIND.ASSET, m, s)) === ts.format(ts.quantity("EUR", ts.KIND.ASSET, m, s)), `format(${m},scale${s}) identical`);
}
check(both(() => js.format({ not: "q" }), () => ts.format({ not: "q" })), "format(non-quantity) ⇒ throws identical");

// registry.
const rJ = js.declareUnit(js.declareUnit(js.emptyRegistry(), "token", { kind: js.KIND.COST_UNIT, scale: 0 }), "EUR", { kind: js.KIND.ASSET, scale: 2, label: "Euro" });
const rT = ts.declareUnit(ts.declareUnit(ts.emptyRegistry(), "token", { kind: ts.KIND.COST_UNIT, scale: 0 }), "EUR", { kind: ts.KIND.ASSET, scale: 2, label: "Euro" });
check(EQ(rJ, rT) && Object.isFrozen(rT) && Object.isFrozen(rT.units), "declareUnit registry byte-identical + frozen");
check(js.hasUnit(rJ, "EUR") === ts.hasUnit(rT, "EUR") && EQ(js.getUnit(rJ, "token"), ts.getUnit(rT, "token")) && js.getUnit(rJ, "x") === null, "hasUnit/getUnit identical");
check(both(() => js.declareUnit(js.emptyRegistry(), "x", { kind: "WAT", scale: 0 }), () => ts.declareUnit(ts.emptyRegistry(), "x", { kind: "WAT", scale: 0 })), "declareUnit bad kind ⇒ throws identical");

// costMeasurement + valueComponents.
check(EQ(js.costMeasurement(q(100, js), js.BASIS.ESTIMATED, { provider: "p" }), ts.costMeasurement(q(100, ts), ts.BASIS.ESTIMATED, { provider: "p" })), "costMeasurement byte-identical");
check(EQ(js.valueComponents(q(1000, js), [q(100, js), q(50, js)]), ts.valueComponents(q(1000, ts), [q(100, ts), q(50, ts)])), "valueComponents (gross/fees/net derived) byte-identical");

console.log(failures === 0 ? "ALL PASS — LOT economic-unit EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
