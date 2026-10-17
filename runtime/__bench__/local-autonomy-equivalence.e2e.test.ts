#!/usr/bin/env node
/*
 * LOT local-autonomy — EQUIVALENCE (historical runtime/core/local-autonomy.js vs compiled .ts).
 *
 * Offline, deterministic, hermetic: build:runtime compiles the .ts → runtime/dist/core. local-autonomy is a
 * thin facade over synth(P5)/router(P8)/learning(P6)/factory(P10); its only state (patch-memory, metrics,
 * generated capabilities) is cwd-relative, so the bench chdirs into a FRESH empty temp cwd per call (separate
 * for JS and TS) — NO shared/real state. Each scenario calls handle()/complete() on BOTH modules and asserts
 * BYTE-IDENTICAL JSON.
 *
 * KEY (the V71 transitive-unblock): the manufacture path calls capability-factory.create(), whose contract
 * self-check uses the sanctioned dynamic legacyRequire. This bench drives that path through the COMPILED TS
 * local-autonomy + capability-factory and asserts byte-identical results — proving the whole P10 chain works
 * in the compiled runtime.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/local-autonomy-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "local-autonomy.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "local-autonomy.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT local-autonomy — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/local-autonomy.js present");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/local-autonomy.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.handle === "function" && typeof js.complete === "function", "JS exports handle+complete");
check(typeof ts.handle === "function" && typeof ts.complete === "function", "compiled TS exports handle+complete");

const genRoot = path.join(REPO, "runtime", "generated");
fs.mkdirSync(genRoot, { recursive: true });
function tmpCwd(): string { return fs.mkdtempSync(path.join(genRoot, "la-bench-")); }

// Run a call in an ISOLATED fresh temp cwd (empty state ⇒ deterministic routing).
function iso<T>(fn: () => T): T {
  const prev = process.cwd();
  const cwd = tmpCwd();
  try { process.chdir(cwd); return fn(); } finally { process.chdir(prev); }
}

const REQUESTS = [
  "build a CSV to JSON converter",
  "corriger le bug de connexion",
  "write documentation for the API",
];

// handle() without manufacture — full result byte-identical.
for (const req of REQUESTS) {
  const j = iso(() => js.handle(req, { manufactureIfMissing: false }));
  const t = iso(() => ts.handle(req, { manufactureIfMissing: false }));
  check(JSON.stringify(j) === JSON.stringify(t), `handle("${req.slice(0, 28)}") byte-identical`);
}

// handle() WITH manufacture (drives capability-factory.create + its sanctioned dynamic self-check).
for (const req of REQUESTS) {
  const j = iso(() => js.handle(req, { manufactureIfMissing: true, rootCause: "no-local-cap" }));
  const t = iso(() => ts.handle(req, { manufactureIfMissing: true, rootCause: "no-local-cap" }));
  check(JSON.stringify(j) === JSON.stringify(t), `handle("${req.slice(0, 28)}", manufacture) byte-identical`);
  if (j.manufactured) check(j.manufactured.contractOk === true && t.manufactured && t.manufactured.contractOk === true,
    `handle(manufacture) ⇒ capability-factory self-check PASSED on both (P10 chain works in compiled TS)`);
}

// complete() with a fixed mission report.
for (const [label, report] of [
  ["applied engineering", { mission: "M1", status: "DONE", objectives: [{ id: "o1", goal: "g", applied: true }] }],
  ["empty", {}],
] as Array<[string, any]>) {
  const j = iso(() => js.complete(report));
  const t = iso(() => ts.complete(report));
  check(JSON.stringify(j) === JSON.stringify(t), `complete("${label}") byte-identical`);
}

console.log(failures === 0 ? "ALL PASS — LOT local-autonomy EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
