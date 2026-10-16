#!/usr/bin/env node
/*
 * LOT finance-sim — EQUIVALENCE (historical .js vs compiled .ts). Offline, pure, SIMULATION-ONLY (no network/
 * execution/real-money). build:runtime compiles runtime/core/finance-sim.ts → dist (deps economic-unit +
 * mechanical-acceptance co-located). Serializable results compared byte-identical; the no-look-ahead accessor's
 * throw is checked behaviourally (it carries a function, so it is not JSON-compared).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/finance-sim-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "finance-sim.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "finance-sim.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT finance-sim — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
for (const x of ["CODE", "ingest", "pastView", "decideAt", "runSimulation"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(EQ(js.CODE, ts.CODE), "CODE enum byte-identical");

const bar = (t: number, minor: number) => ({ t, price: { minor, scale: 2 }, source: "fixture" });
const series = [bar(1, 100), bar(2, 110), bar(3, 105), bar(4, 120), bar(5, 130)];
check(EQ(js.ingest(series), ts.ingest(series)) && js.ingest(series).ok === true, "ingest(valid) byte-identical");
check(EQ(js.ingest([]), ts.ingest([])) && js.ingest([]).code === "EMPTY", "ingest EMPTY byte-identical");
check(EQ(js.ingest([{ t: 1, price: { minor: 1, scale: 2 } }]), ts.ingest([{ t: 1, price: { minor: 1, scale: 2 } }])) && js.ingest([{ t: 1, price: { minor: 1, scale: 2 } }]).code === "UNSOURCED", "ingest UNSOURCED byte-identical");
check(EQ(js.ingest([bar(2, 1), bar(1, 1)]), ts.ingest([bar(2, 1), bar(1, 1)])) && js.ingest([bar(2, 1), bar(1, 1)]).code === "NON_MONOTONIC_TIME", "ingest NON_MONOTONIC byte-identical");
check(EQ(js.ingest([{ t: 1, price: { minor: 1.5, scale: 2 }, source: "x" }]), ts.ingest([{ t: 1, price: { minor: 1.5, scale: 2 }, source: "x" }])) && js.ingest([{ t: 1, price: { minor: 1.5, scale: 2 }, source: "x" }]).code === "INVALID_BAR", "ingest INVALID_BAR byte-identical");

const ingJ = js.ingest(series).bars;
check(js.decideAt(ingJ, 3, 3) === ts.decideAt(js.ingest(series).bars, 3, 3), "decideAt deterministic parity");
check(EQ(js.runSimulation(series, { window: 3 }), ts.runSimulation(series, { window: 3 })) && js.runSimulation(series, { window: 3 }).ok === true && js.runSimulation(series, { window: 3 }).executed === false, "runSimulation(valid) byte-identical (SIMULATION, executed:false)");
check(EQ(js.runSimulation(series, { window: 0 }), ts.runSimulation(series, { window: 0 })) && js.runSimulation(series, { window: 0 }).code === "INVALID_PARAMS", "runSimulation INVALID_PARAMS byte-identical");
// determinism + NO look-ahead: positions up to i unchanged when the series is truncated after i.
{
  const full = js.runSimulation(series, { window: 2 }).positions;
  const trunc = js.runSimulation(series.slice(0, 3), { window: 2 }).positions;
  check(EQ(full.slice(0, 3), trunc), "NO look-ahead: truncating after i never changes decisions up to i");
  check(EQ(js.runSimulation(series, { window: 2 }), js.runSimulation(series, { window: 2 })), "determinism: same input ⇒ identical result");
}
// pastView look-ahead throw (behavioural; carries a function so not JSON-compared)
{
  let tj = false, tt = false;
  try { js.pastView([1, 2, 3], 1).at(2); } catch { tj = true; }
  try { ts.pastView([1, 2, 3], 1).at(2); } catch { tt = true; }
  check(tj && tt, "pastView: reading a future index throws LOOK_AHEAD (both)");
}

console.log(failures === 0 ? "ALL PASS — LOT finance-sim EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
