#!/usr/bin/env node
/*
 * LOT specification-loader — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/specification-loader.ts →
 * runtime/dist/core/specification-loader.js (LEAF, deps=0). loadSpecification reads the CWD-relative
 * path runtime/specifications/<mission>.md, so a seeded temp cwd makes both the found and
 * missing branches fully deterministic ⇒ BYTE-IDENTICAL.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/specification-loader-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "specification-loader.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "specification-loader.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT specification-loader — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/specification-loader.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/specification-loader.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.loadSpecification === "function" && typeof ts.loadSpecification === "function", "both export loadSpecification");

const origCwd = process.cwd();
let tmp = "";
try {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "specload-"));
  const specDir = path.join(tmp, "runtime", "specifications");
  fs.mkdirSync(specDir, { recursive: true });
  const BODY = "# MISSION_ALPHA\n\nSome spec body\nwith lines.\n";
  fs.writeFileSync(path.join(specDir, "MISSION_ALPHA.md"), BODY);
  process.chdir(tmp);

  const jf = js.loadSpecification("MISSION_ALPHA");
  const tf = ts.loadSpecification("MISSION_ALPHA");
  check(EQ(jf, tf), "loadSpecification(found) BYTE-IDENTICAL JS≡TS");
  check(jf.found === true && jf.content === BODY && jf.path === path.join("runtime", "specifications", "MISSION_ALPHA.md"), "found branch: {found:true, cwd-relative path, exact content}");

  const jm = js.loadSpecification("NOPE_MISSING");
  const tm = ts.loadSpecification("NOPE_MISSING");
  check(EQ(jm, tm), "loadSpecification(missing) BYTE-IDENTICAL JS≡TS");
  check(jm.found === false && jm.content === null && jm.path === path.join("runtime", "specifications", "NOPE_MISSING.md"), "missing branch: {found:false, path, content:null}");
} finally {
  process.chdir(origCwd);
  if (tmp) {
    try {
      fs.rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

console.log(failures === 0 ? "ALL PASS — LOT specification-loader EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
