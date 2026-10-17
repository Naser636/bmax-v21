#!/usr/bin/env node
/*
 * LOT learning-chain — EQUIVALENCE (historical runtime/core/learning-chain.js vs compiled .ts).
 *
 * Offline, deterministic, PURE (no I/O): build:runtime compiles runtime/core/learning-chain.ts →
 * runtime/dist/core/learning-chain.js (a LEAF — self-contained, no deps). Each scenario calls the SAME
 * public API (STATES / EVIDENCE / classifyLearningState / summarizeChain) on BOTH modules and asserts
 * BYTE-IDENTICAL outputs (JSON, zero normalisation). Covers: the ordered chain constant, every evidence
 * predicate, the CONTIGUITY rule (a gap caps the chain; later evidence is `ahead`), the NO-FABRICATED-EFFECT
 * rule (bare bool / equal baseline==after / delta===0 is NOT effective), reason strings and byState counts.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/learning-chain-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "learning-chain.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "learning-chain.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT learning-chain — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/learning-chain.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/learning-chain.js emitted by build:runtime");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.classifyLearningState === "function" && typeof js.summarizeChain === "function" && Array.isArray(js.STATES) && !!js.EVIDENCE, "JS exports STATES+EVIDENCE+classify+summarize");
check(typeof ts.classifyLearningState === "function" && typeof ts.summarizeChain === "function" && Array.isArray(ts.STATES) && !!ts.EVIDENCE, "compiled TS exports STATES+EVIDENCE+classify+summarize");

// STATES constant byte-identical.
check(JSON.stringify(js.STATES) === JSON.stringify(ts.STATES), "STATES ordered chain byte-identical");

// Representative learning records spanning the whole classification surface.
const RECORDS: Array<[string, any]> = [
  ["empty/untracked", {}],
  ["non-object", 42],
  ["null", null],
  ["captured-string", { captured: "learned X" }],
  ["captured-obj-description", { captured: { description: "d" } }],
  ["captured-obj-cause", { captured: { cause: "c" } }],
  ["captured-empty-obj", { captured: {} }],
  ["captured-blank-string", { captured: "   " }],
  ["persisted-only-no-captured(gap)", { persisted: "mem.md" }],
  ["captured+persisted", { captured: "x", persisted: { ref: "r" } }],
  ["captured+persisted+discoverable", { captured: "x", persisted: "p", discoverable: { links: ["l1"] } }],
  ["reused-present-but-gapped", { captured: "x", reused: { count: 3 } }],
  ["full-to-reused", { captured: "x", persisted: "p", discoverable: "d", reused: { consumers: ["a"] } }],
  ["reused-count-zero", { captured: "x", persisted: "p", discoverable: "d", reused: { count: 0 } }],
  ["effective-bare-bool", { captured: "x", persisted: "p", discoverable: "d", reused: { count: 1 }, effective: true }],
  ["effective-delta-zero", { captured: "x", persisted: "p", discoverable: "d", reused: { count: 1 }, effective: { delta: 0 } }],
  ["effective-delta-nonzero", { captured: "x", persisted: "p", discoverable: "d", reused: { count: 1 }, effective: { delta: 2 } }],
  ["effective-equal-measurement", { captured: "x", persisted: "p", discoverable: "d", reused: { count: 1 }, effective: { baseline: 5, after: 5 } }],
  ["effective-changed-measurement", { captured: "x", persisted: "p", discoverable: "d", reused: { count: 1 }, effective: { baseline: 5, after: 9 } }],
  ["effective-but-reused-gap", { captured: "x", persisted: "p", discoverable: "d", effective: { delta: 2 } }],
  ["with-id", { id: "L-1", captured: "x", persisted: "p" }],
];

for (const [label, rec] of RECORDS) {
  const j = js.classifyLearningState(rec);
  const t = ts.classifyLearningState(rec);
  check(JSON.stringify(j) === JSON.stringify(t), `classifyLearningState "${label}" byte-identical`);
}

// Each evidence predicate directly (boolean parity).
for (const s of js.STATES) {
  for (const [label, rec] of RECORDS) {
    const r = (rec !== null && typeof rec === "object" && !Array.isArray(rec)) ? rec : {};
    check(js.EVIDENCE[s](r) === ts.EVIDENCE[s](r), `EVIDENCE.${s}("${label}") boolean parity`);
  }
}

// summarizeChain over the whole corpus + edge inputs.
for (const [label, corpus] of [
  ["full-corpus", RECORDS.map((x) => x[1])],
  ["empty", []],
  ["non-array", "nope"],
  ["mixed-with-ids", [{ id: "a", captured: "x" }, { id: "b", captured: "x", persisted: "p", discoverable: "d", reused: { count: 1 }, effective: { delta: 1 } }, {}]],
] as Array<[string, any]>) {
  check(JSON.stringify(js.summarizeChain(corpus)) === JSON.stringify(ts.summarizeChain(corpus)), `summarizeChain "${label}" byte-identical`);
}

console.log(failures === 0 ? "ALL PASS — LOT learning-chain EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
