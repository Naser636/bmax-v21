#!/usr/bin/env node
/*
 * LOT runtime-paths — EQUIVALENCE (historical runtime/core/runtime-paths.js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/runtime-paths.ts →
 * runtime/dist/core/runtime-paths.js (a LEAF — path builtin only). coreDir/repoRoot take the module
 * __dirname as an ARGUMENT, so both the SOURCE layout (…/runtime/core) and the COMPILED layout
 * (…/runtime/dist/core) are exercised deterministically on BOTH ports and asserted BYTE-IDENTICAL.
 * The KEY correctness property: a dist-layout dirname maps BACK to the canonical runtime/core / repo root
 * (so repo-relative data files + sibling .js executors resolve against the real source tree, never dist).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/runtime-paths-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "runtime-paths.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "runtime-paths.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT runtime-paths — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/runtime-paths.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/runtime-paths.js emitted by build:runtime");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.coreDir === "function" && typeof js.repoRoot === "function", "JS exports coreDir+repoRoot");
check(typeof ts.coreDir === "function" && typeof ts.repoRoot === "function", "compiled TS exports coreDir+repoRoot");

// Representative __dirname values spanning both layouts + edge inputs.
const FAKE_REPO = path.join(path.sep, "x", "y", "bmax");
const SOURCE_CORE = path.join(FAKE_REPO, "runtime", "core");
const DIST_CORE = path.join(FAKE_REPO, "runtime", "dist", "core");
const DIRNAMES: Array<[string, string]> = [
  ["source runtime/core", SOURCE_CORE],
  ["compiled runtime/dist/core", DIST_CORE],
  ["unrelated dir", path.join(path.sep, "tmp", "whatever")],
  ["this bench's own dir", path.dirname(new URL(import.meta.url).pathname)],
];

for (const [label, dir] of DIRNAMES) {
  check(js.coreDir(dir) === ts.coreDir(dir), `coreDir("${label}") byte-identical JS≡TS`);
  check(js.repoRoot(dir) === ts.repoRoot(dir), `repoRoot("${label}") byte-identical JS≡TS`);
}

// KEY correctness: source and dist layouts BOTH resolve to the SAME canonical core dir + repo root.
check(js.coreDir(SOURCE_CORE) === SOURCE_CORE, "coreDir(source) is identity (production JS unchanged)");
check(js.coreDir(DIST_CORE) === SOURCE_CORE, "coreDir(dist) maps BACK to runtime/core (correctness)");
check(js.repoRoot(SOURCE_CORE) === FAKE_REPO && js.repoRoot(DIST_CORE) === FAKE_REPO, "repoRoot(source)==repoRoot(dist)==repo root (correctness)");
check(ts.coreDir(DIST_CORE) === SOURCE_CORE && ts.repoRoot(DIST_CORE) === FAKE_REPO, "compiled TS: dist maps back to source tree + repo root");

console.log(failures === 0 ? "ALL PASS — LOT runtime-paths EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
