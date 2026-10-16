#!/usr/bin/env node
/*
 * LOT budget-contract — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/budget-contract.ts →
 * runtime/dist/core/budget-contract.js; build-dist-closure co-locates its sole dep economic-unit.js
 * (already a TS port) in dist/core. resolveBudget is pure (no fs, no time, no network) so every output is
 * BYTE-IDENTICAL with NO normalisation. Covers ABSENT / DECLARED / MALFORMED and the descriptor exports.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/budget-contract-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "budget-contract.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "budget-contract.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT budget-contract — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/budget-contract.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/budget-contract.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "economic-unit.js")), "prerequisite: dep economic-unit.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;

for (const x of ["BUDGET_CONTRACT", "BUCKETS", "resolveBudget"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(EQ(js.BUDGET_CONTRACT, ts.BUDGET_CONTRACT) && Object.isFrozen(ts.BUDGET_CONTRACT), "BUDGET_CONTRACT byte-identical + frozen");
check(EQ(js.BUCKETS, ts.BUCKETS), "BUCKETS byte-identical");

// --- ABSENT (no budget, non-object spec) ---
check(EQ(js.resolveBudget({}), ts.resolveBudget({})) && js.resolveBudget({}).present === false, "resolveBudget(no budget) ⇒ ABSENT {present:false} BYTE-IDENTICAL");
check(EQ(js.resolveBudget(null), ts.resolveBudget(null)), "resolveBudget(null) ⇒ ABSENT BYTE-IDENTICAL");
check(EQ(js.resolveBudget(5), ts.resolveBudget(5)), "resolveBudget(non-object) ⇒ ABSENT BYTE-IDENTICAL");
check(EQ(js.resolveBudget({ budget: null }), ts.resolveBudget({ budget: null })), "resolveBudget(budget:null) ⇒ ABSENT BYTE-IDENTICAL");

// --- MALFORMED ---
check(EQ(js.resolveBudget({ budget: 7 }), ts.resolveBudget({ budget: 7 })) && js.resolveBudget({ budget: 7 }).ok === false, "resolveBudget(budget not object) ⇒ MALFORMED BYTE-IDENTICAL");
check(EQ(js.resolveBudget({ budget: {} }), ts.resolveBudget({ budget: {} })), "resolveBudget(no allocations) ⇒ MALFORMED (non-empty array required) BYTE-IDENTICAL");
check(EQ(js.resolveBudget({ budget: { allocations: [] } }), ts.resolveBudget({ budget: { allocations: [] } })), "resolveBudget(empty allocations) ⇒ MALFORMED BYTE-IDENTICAL");
const badAlloc = { budget: { allocations: [{ bucket: "nope", unit: "", kind: "WRONG", amount: -1, scale: -2 }] } };
check(EQ(js.resolveBudget(badAlloc), ts.resolveBudget(badAlloc)) && js.resolveBudget(badAlloc).errors.length >= 4, "resolveBudget(every field bad) ⇒ MALFORMED, all errors in order BYTE-IDENTICAL");
const E = require(path.join(REPO, "runtime", "core", "economic-unit.js")) as any;
const mixed = { budget: { allocations: [{ bucket: "token", unit: "USD", kind: E.KIND.COST_UNIT, amount: 100, scale: 2 }, { bucket: "bad" }] } };
check(EQ(js.resolveBudget(mixed), ts.resolveBudget(mixed)) && js.resolveBudget(mixed).ok === false, "resolveBudget(one good + one bad) ⇒ MALFORMED (fail-closed, no partial accept) BYTE-IDENTICAL");

// --- DECLARED (well-formed) ---
const good = { budget: { allocations: [
  { bucket: "token", unit: "USD", kind: E.KIND.COST_UNIT, amount: 500, scale: 2 },
  { bucket: "reserve", unit: "credits", kind: E.KIND.ASSET, amount: 10, scale: 0 },
] } };
check(EQ(js.resolveBudget(good), ts.resolveBudget(good)) && js.resolveBudget(good).ok === true, "resolveBudget(well-formed) ⇒ DECLARED, normalized BYTE-IDENTICAL");
check(Object.isFrozen(ts.resolveBudget(good).budget) && Object.isFrozen(ts.resolveBudget(good).budget.allocations), "DECLARED budget + allocations deeply frozen (TS)");
// scale defaulting to 0 when omitted.
const noScale = { budget: { allocations: [{ bucket: "mission", unit: "EUR", kind: E.KIND.COST_UNIT, amount: 1 }] } };
check(EQ(js.resolveBudget(noScale), ts.resolveBudget(noScale)) && js.resolveBudget(noScale).budget.allocations[0].scale === 0, "resolveBudget(scale omitted) ⇒ scale defaults 0 BYTE-IDENTICAL");

console.log(failures === 0 ? "ALL PASS — LOT budget-contract EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
