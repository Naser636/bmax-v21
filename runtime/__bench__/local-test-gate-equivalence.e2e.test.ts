#!/usr/bin/env node
/*
 * LOT local-test-gate — EQUIVALENCE (historical runtime/core/local-test-gate.js vs compiled .ts).
 *
 * Offline, deterministic. build:runtime compiles runtime/core/local-test-gate.ts →
 * runtime/dist/core/local-test-gate.js. local-test-gate is a LEAF (no internal ./requires), so the
 * compiled module is self-contained and can be required directly — no dist-closure relocation.
 *
 * Each scenario calls the SAME public API (runTests / gate) with the SAME deterministic fixtures on
 * BOTH the historical .js and the compiled .ts, and asserts the returned objects are BYTE-IDENTICAL
 * (JSON, zero normalisation) plus the hand-derived ok/detail/status. Both engines spawn the same
 * `node` on the same fixture files, so every field (code, error, file) is identical by construction.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/local-test-gate-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "local-test-gate.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "local-test-gate.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else { failures++; console.log(`  FAIL ${label}`); }
}

const cleanup: string[] = [];
function fixtures(): { pass: string; fail: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ltg-bench-"));
  cleanup.push(dir);
  const pass = path.join(dir, "pass.js");
  const fail = path.join(dir, "fail.js");
  fs.writeFileSync(pass, "process.exit(0);\n");
  fs.writeFileSync(fail, 'throw new Error("boom");\n');
  return { pass, fail };
}

console.log("LOT local-test-gate — EQUIVALENCE (historical .js vs compiled .ts)");
try {
  execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
  check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/local-test-gate.js present (untouched)");
  check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/local-test-gate.js emitted by build:runtime");

  // Fresh require of each module (bust any cache between the two).
  delete require.cache[require.resolve(JS_MOD)];
  delete require.cache[require.resolve(TS_MOD)];
  const js = require(JS_MOD) as { runTests: Function; gate: Function };
  const ts = require(TS_MOD) as { runTests: Function; gate: Function };
  check(typeof js.runTests === "function" && typeof js.gate === "function", "JS module exports runTests + gate");
  check(typeof ts.runTests === "function" && typeof ts.gate === "function", "compiled TS module exports runTests + gate");

  const { pass, fail } = fixtures();

  // S1 — gate(passing single file, STRING input): ok:true, green detail.
  {
    const j = js.gate(pass), t = ts.gate(pass);
    check(JSON.stringify(j) === JSON.stringify(t), "S1 gate(pass) byte-identical JS≡TS");
    check(j.ok === true && /1 local test file\(s\) green/.test(j.detail), "S1 gate(pass): ok=true, green detail");
  }
  // S2 — gate([pass, fail]): ok:false, '1/2 ... failed'.
  {
    const j = js.gate([pass, fail]), t = ts.gate([pass, fail]);
    check(JSON.stringify(j) === JSON.stringify(t), "S2 gate([pass,fail]) byte-identical JS≡TS");
    check(j.ok === false && /1\/2 local test file\(s\) failed/.test(j.detail), "S2 gate([pass,fail]): ok=false, 1/2 failed");
  }
  // S3 — runTests([pass, fail]): full result objects byte-identical (code, error, ordering).
  {
    const j = js.runTests([pass, fail]), t = ts.runTests([pass, fail]);
    check(JSON.stringify(j) === JSON.stringify(t), "S3 runTests([pass,fail]) byte-identical JS≡TS (code/error/ordering)");
    check(j.total === 2 && j.failed === 1 && j.ok === false, "S3 runTests: total=2 failed=1 ok=false");
    const ff = j.results.find((x: any) => x.file === fail);
    check(ff && ff.code !== 0 && typeof ff.error === "string", "S3 failing file carries non-zero code + string error");
    const pf = j.results.find((x: any) => x.file === pass);
    check(pf && pf.code === 0 && pf.ok === true && pf.error === null, "S3 passing file: code 0, ok true, error null");
  }
  // S4 — edge: empty list ⇒ ok:true (vacuous), 0 total.
  {
    const j = js.runTests([]), t = ts.runTests([]);
    check(JSON.stringify(j) === JSON.stringify(t), "S4 runTests([]) byte-identical JS≡TS");
    check(j.ok === true && j.total === 0 && j.failed === 0, "S4 empty list ⇒ ok=true, total=0");
  }
} finally {
  for (const d of cleanup) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } }
}

console.log(failures === 0 ? "ALL PASS — LOT local-test-gate EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
