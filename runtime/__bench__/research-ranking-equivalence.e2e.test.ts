#!/usr/bin/env node
/*
 * LOT research-ranking — EQUIVALENCE (historical runtime/core/research-ranking.js vs compiled .ts).
 *
 * Offline, deterministic, PURE (no I/O): build:runtime compiles runtime/core/research-ranking.ts →
 * runtime/dist/core/research-ranking.js (a LEAF — self-contained). Each scenario calls the SAME public
 * API (rank / composite / DEFAULT_WEIGHTS) on BOTH modules and asserts BYTE-IDENTICAL outputs (JSON,
 * zero normalisation) PLUS identical fail-closed throw MESSAGES — no meaningful difference normalised.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/research-ranking-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "research-ranking.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "research-ranking.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}
function thrownMessage(fn: () => unknown): string {
  try { fn(); return "<no throw>"; } catch (e: any) { return String(e && e.message || e); }
}

console.log("LOT research-ranking — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/research-ranking.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/research-ranking.js emitted by build:runtime");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.rank === "function" && typeof js.composite === "function" && !!js.DEFAULT_WEIGHTS, "JS exports rank+composite+DEFAULT_WEIGHTS");
check(typeof ts.rank === "function" && typeof ts.composite === "function" && !!ts.DEFAULT_WEIGHTS, "compiled TS exports rank+composite+DEFAULT_WEIGHTS");

const S = (a: number, b: number, c: number, d: number, e: number) =>
  ({ incomePotential: a, demandGrowth: b, startupCostInverse: c, timeToRevenueInverse: d, skillAlignment: e });

// DEFAULT_WEIGHTS value byte-identical.
check(JSON.stringify(js.DEFAULT_WEIGHTS) === JSON.stringify(ts.DEFAULT_WEIGHTS), "DEFAULT_WEIGHTS byte-identical");

// composite direct.
{
  const sc = S(1, 1, 1, 1, 1);
  check(js.composite(sc, js.DEFAULT_WEIGHTS) === ts.composite(sc, ts.DEFAULT_WEIGHTS), "composite(all=1) identical");
  check(js.composite(S(0.8, 0.6, 0.4, 0.2, 0.9), js.DEFAULT_WEIGHTS) === ts.composite(S(0.8, 0.6, 0.4, 0.2, 0.9), ts.DEFAULT_WEIGHTS), "composite(mixed) identical");
}

// rank normal: distinct scores ⇒ descending order + 1-based ranks.
{
  const items = [
    { name: "beta", provenance_ref: "p2", scores: S(0.5, 0.5, 0.5, 0.5, 0.5) },
    { name: "alpha", provenance_ref: "p1", scores: S(0.9, 0.9, 0.9, 0.9, 0.9) },
    { name: "gamma", provenance_ref: "p3", scores: S(0.1, 0.1, 0.1, 0.1, 0.1) },
  ];
  const j = js.rank(items), t = ts.rank(JSON.parse(JSON.stringify(items)));
  check(JSON.stringify(j) === JSON.stringify(t), "rank(distinct) byte-identical JS≡TS");
  check(j[0].name === "alpha" && j[0].rank === 1 && j[2].name === "gamma" && j[2].rank === 3, "rank order desc + 1-based ranks");
}
// rank tiebreak: equal scores ⇒ name asc.
{
  const items = [
    { name: "zeta", provenance_ref: "p", scores: S(0.5, 0.5, 0.5, 0.5, 0.5) },
    { name: "aaa", provenance_ref: "p", scores: S(0.5, 0.5, 0.5, 0.5, 0.5) },
  ];
  const j = js.rank(items), t = ts.rank(JSON.parse(JSON.stringify(items)));
  check(JSON.stringify(j) === JSON.stringify(t), "rank(tie) byte-identical JS≡TS");
  check(j[0].name === "aaa" && j[1].name === "zeta", "tie broken by name asc");
}
// rank custom weights.
{
  const items = [{ name: "x", provenance_ref: "p", scores: S(1, 0, 0, 0, 0) }];
  const opts = { weights: { incomePotential: 1, demandGrowth: 0, startupCostInverse: 0, timeToRevenueInverse: 0, skillAlignment: 0 } };
  check(JSON.stringify(js.rank(items, opts)) === JSON.stringify(ts.rank(JSON.parse(JSON.stringify(items)), opts)), "rank(custom weights) byte-identical");
}

// Error parity (fail-closed throw MESSAGES identical).
const E: Array<[string, (m: any) => unknown]> = [
  ["non-array items", (m: any) => m.rank("nope")],
  ["non-object item", (m: any) => m.rank([42])],
  ["missing provenance_ref", (m: any) => m.rank([{ name: "n", scores: S(1, 1, 1, 1, 1) }])],
  ["missing dimension", (m: any) => m.rank([{ name: "n", provenance_ref: "p", scores: { incomePotential: 1 } }])],
];
for (const [label, call] of E) {
  const jm = thrownMessage(() => call(js));
  const tm = thrownMessage(() => call(ts));
  check(jm === tm && jm !== "<no throw>", `error "${label}": same throw message JS≡TS ("${jm.slice(0, 48)}…")`);
}

console.log(failures === 0 ? "ALL PASS — LOT research-ranking EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
