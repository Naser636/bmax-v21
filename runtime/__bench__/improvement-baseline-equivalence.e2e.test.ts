#!/usr/bin/env node
/*
 * LOT improvement-baseline — EQUIVALENCE (historical runtime/core/improvement-baseline.js vs compiled .ts).
 *
 * Offline, deterministic, hermetic: build:runtime compiles runtime/core/improvement-baseline.ts →
 * runtime/dist/core/improvement-baseline.js. captureBaseline/measureDelta/directionOf are PURE; the default
 * collectors' only I/O is fully overridden here (we pass INJECTED collectors + injected inventory/recurrence
 * deps — NO real migration-campaign/incident-recurrence read). Each scenario calls the SAME public API on
 * BOTH modules and asserts BYTE-IDENTICAL JSON. Covers: capture with fn/value/undefined/throwing collectors,
 * directionOf sense table, numeric/non-numeric/null signal deltas, summary counts, DEFAULT_SENSE, and the
 * defaultCollectors wiring under injected deps.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/improvement-baseline-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "improvement-baseline.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "improvement-baseline.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT improvement-baseline — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/improvement-baseline.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/improvement-baseline.js emitted by build:runtime");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.captureBaseline === "function" && typeof js.measureDelta === "function" && typeof js.directionOf === "function" && typeof js.defaultCollectors === "function" && !!js.DEFAULT_SENSE, "JS exports full API");
check(typeof ts.captureBaseline === "function" && typeof ts.measureDelta === "function" && typeof ts.directionOf === "function" && typeof ts.defaultCollectors === "function" && !!ts.DEFAULT_SENSE, "compiled TS exports full API");

// MODEL + DEFAULT_SENSE byte-identical.
check(js.MODEL === ts.MODEL, "MODEL identical");
check(JSON.stringify(js.DEFAULT_SENSE) === JSON.stringify(ts.DEFAULT_SENSE), "DEFAULT_SENSE byte-identical");

// captureBaseline: fn, static value, undefined, throwing — on both.
const collectorSets: Array<[string, any]> = [
  ["fns", { a: () => 1, b: () => 2 }],
  ["static-values", { a: 5, b: "s" }],
  ["undefined", { a: undefined, b: () => 3 }],
  ["throwing", { a: () => { throw new Error("x"); }, b: () => 0 }],
  ["not-object", "nope"],
  ["empty", {}],
];
for (const [label, cs] of collectorSets) {
  check(JSON.stringify(js.captureBaseline(cs)) === JSON.stringify(ts.captureBaseline(cs)), `captureBaseline "${label}" byte-identical`);
}

// directionOf sense table.
const dirCases: Array<[string, number, any]> = [
  ["x", 0, {}], ["x", 5, {}], ["x", -5, {}],
  ["debt", 3, { debt: "lower" }], ["debt", -3, { debt: "lower" }],
  ["up", 3, { up: "higher" }], ["up", -3, { up: "higher" }],
  ["z", 2, null], ["z", 2, "nope"],
];
for (const [name, delta, sense] of dirCases) {
  check(js.directionOf(name, delta, sense) === ts.directionOf(name, delta, sense), `directionOf(${name},${delta},${JSON.stringify(sense)}) identical`);
}

// measureDelta: numeric, non-numeric, null, mixed, with DEFAULT_SENSE.
const deltaCases: Array<[string, any, any, any]> = [
  ["numeric-improve", { signals: { a: 1 } }, { signals: { a: 5 } }, undefined],
  ["numeric-regress", { signals: { a: 5 } }, { signals: { a: 1 } }, undefined],
  ["numeric-flat", { signals: { a: 3 } }, { signals: { a: 3 } }, undefined],
  ["debt-signal", { signals: { jsRemaining: 10 } }, { signals: { jsRemaining: 4 } }, js.DEFAULT_SENSE],
  ["null-side", { signals: { a: null } }, { signals: { a: 5 } }, undefined],
  ["both-null", { signals: { a: null } }, { signals: { a: null } }, undefined],
  ["non-numeric-changed", { signals: { a: "x" } }, { signals: { a: "y" } }, undefined],
  ["non-numeric-flat", { signals: { a: "x" } }, { signals: { a: "x" } }, undefined],
  ["raw-signal-maps", { a: 1 }, { a: 2 }, undefined],
  ["disjoint-names", { signals: { a: 1 } }, { signals: { b: 2 } }, undefined],
  ["mixed", { signals: { a: 1, b: "x", c: null, jsRemaining: 9 } }, { signals: { a: 3, b: "y", c: null, jsRemaining: 2 } }, js.DEFAULT_SENSE],
];
for (const [label, before, after, sense] of deltaCases) {
  check(JSON.stringify(js.measureDelta(before, after, sense)) === JSON.stringify(ts.measureDelta(before, after, sense)), `measureDelta "${label}" byte-identical`);
}

// defaultCollectors wired with INJECTED deps (hermetic — no real migration-campaign/incident-recurrence).
{
  const deps = {
    inventory: () => ({ counts: { coreDual: 80, coreJs: 90, blocked: 6 } }),
    recurrence: () => ({ summary: { recurring: 2, frozen: 1 } }),
  };
  const jc = js.defaultCollectors(deps), tc = ts.defaultCollectors(deps);
  check(JSON.stringify(js.captureBaseline(jc)) === JSON.stringify(ts.captureBaseline(tc)), "captureBaseline(defaultCollectors(injected deps)) byte-identical");
  // flat (non-counts) inventory shape branch.
  const deps2 = { inventory: () => ({ coreDual: 1, coreJs: 2, blocked: 3 }), recurrence: () => ({ summary: { recurring: 0, frozen: 0 } }) };
  const jc2 = js.defaultCollectors(deps2), tc2 = ts.defaultCollectors(deps2);
  check(JSON.stringify(js.captureBaseline(jc2)) === JSON.stringify(ts.captureBaseline(tc2)), "captureBaseline(flat-inventory deps) byte-identical");
}

// V70 DEPENDENCY-INVERSION case (the out-of-closure dependency): with NO injected `inventory`, the three
// inventory-derived signals MUST be null (honest unmeasured) on BOTH ports — proving the module no longer
// reaches cross-tree into src/runtime/migration-campaign. Recurrence is injected to keep the bench hermetic
// (no real autonomy-store read); its default sibling path is covered by incident-recurrence's own bench.
{
  const recurrence = () => ({ summary: { recurring: 7, frozen: 2 } });
  const jc = js.defaultCollectors({ recurrence }), tc = ts.defaultCollectors({ recurrence });
  const jb = js.captureBaseline(jc), tb = ts.captureBaseline(tc);
  check(JSON.stringify(jb) === JSON.stringify(tb), "captureBaseline(no inventory injected) byte-identical");
  check(jb.signals.dualPorts === null && jb.signals.jsRemaining === null && jb.signals.hazardBlocked === null, "no-inventory ⇒ inventory signals are null (JS, honest unmeasured)");
  check(tb.signals.dualPorts === null && tb.signals.jsRemaining === null && tb.signals.hazardBlocked === null, "no-inventory ⇒ inventory signals are null (compiled TS, honest unmeasured)");
  check(jb.signals.recurringIncidents === 7 && jb.signals.frozenIncidents === 2, "injected recurrence still flows through");
}

console.log(failures === 0 ? "ALL PASS — LOT improvement-baseline EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
