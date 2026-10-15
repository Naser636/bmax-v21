#!/usr/bin/env node
/*
 * LOT scope-observer — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/scope-observer.ts →
 * runtime/dist/core/scope-observer.js (LEAF, self-contained). Exercises all 7 exports via their
 * injectable/pure seams (deterministic, no repo mutation) PLUS the real cwd-relative git functions
 * (both run from repo root ⇒ identical), and configEq over a temp JSON file. BYTE-IDENTICAL comparison.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/scope-observer-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "scope-observer.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "scope-observer.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT scope-observer — EQUIVALENCE (historical .js vs compiled .ts)");
process.chdir(REPO); // git functions resolve cwd-relative; run both from the repo root.
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/scope-observer.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/scope-observer.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const fn of ["gitChangedPaths", "changedPathsInScope", "trackedFilesInScope", "artifactNonEmpty", "scopeClean", "fileCount", "configEq"]) {
  check(typeof js[fn] === "function" && typeof ts[fn] === "function", `both export ${fn}`);
}

// changedPathsInScope / scopeClean with INJECTED changed paths (deterministic).
{
  const auth = ["runtime/core/**", "src/tests/"];
  const changed = ["runtime/core/x.ts", "docs/y.md", "src/tests/z.test.ts", "other/w.js"];
  check(EQ(js.changedPathsInScope(auth, changed), ts.changedPathsInScope(auth, changed)), "changedPathsInScope(injected) identical");
  check(EQ(js.scopeClean(auth, changed), ts.scopeClean(auth, changed)), "scopeClean(out-of-scope) identical");
  check(EQ(js.scopeClean(auth, ["runtime/core/x.ts"]), ts.scopeClean(auth, ["runtime/core/x.ts"])), "scopeClean(all-in-scope) identical");
  check(EQ(js.scopeClean(auth, []), ts.scopeClean(auth, [])), "scopeClean(empty) identical");
}
// artifactNonEmpty with INJECTED statFn (present/empty/absent).
{
  const present = () => ({ size: 42 });
  const empty = () => ({ size: 0 });
  const absent = () => { throw new Error("nope"); };
  check(EQ(js.artifactNonEmpty("a.json", present), ts.artifactNonEmpty("a.json", present)), "artifactNonEmpty(present) identical");
  check(EQ(js.artifactNonEmpty("a.json", empty), ts.artifactNonEmpty("a.json", empty)), "artifactNonEmpty(empty) identical");
  check(EQ(js.artifactNonEmpty("a.json", absent), ts.artifactNonEmpty("a.json", absent)), "artifactNonEmpty(absent) identical");
  check(EQ(js.artifactNonEmpty("", present), ts.artifactNonEmpty("", present)), "artifactNonEmpty(no path) identical");
}
// fileCount with INJECTED trackedProvider (count omitted / exact / mismatch / invalid).
{
  const two = () => ["a", "b"];
  check(EQ(js.fileCount("p", undefined, two), ts.fileCount("p", undefined, two)), "fileCount(≥1) identical");
  check(EQ(js.fileCount("p", 2, two), ts.fileCount("p", 2, two)), "fileCount(exact match) identical");
  check(EQ(js.fileCount("p", 5, two), ts.fileCount("p", 5, two)), "fileCount(mismatch) identical");
  check(EQ(js.fileCount("p", -1, two), ts.fileCount("p", -1, two)), "fileCount(invalid count) identical");
  check(EQ(js.fileCount("", 1, two), ts.fileCount("", 1, two)), "fileCount(no path) identical");
}
// configEq over a temp JSON file (strict, no coercion, default-deny).
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "so-cfg-"));
  const cfg = path.join(dir, "c.json");
  fs.writeFileSync(cfg, JSON.stringify({ a: { b: 1 }, flag: true, list: [1, 2] }));
  for (const [k, v] of [["a.b", 1], ["a.b", "1"], ["flag", true], ["missing", 1], ["list", [1, 2]]] as any) {
    check(EQ(js.configEq(cfg, k, v), ts.configEq(cfg, k, v)), `configEq(${k}=${JSON.stringify(v)}) identical`);
  }
  check(EQ(js.configEq("/no/such.json", "a", 1), ts.configEq("/no/such.json", "a", 1)), "configEq(absent file) identical");
  check(js.configEq(cfg, "a.b", "1").ok === false, "configEq strict: 1 !== \"1\" (no coercion)");
  fs.rmSync(dir, { recursive: true, force: true });
}
// Real cwd-relative git functions (both from repo root ⇒ identical).
check(EQ(js.gitChangedPaths(), ts.gitChangedPaths()), "gitChangedPaths() identical (real git, same cwd)");
check(EQ(js.trackedFilesInScope(["runtime/core/scope-observer.js"]), ts.trackedFilesInScope(["runtime/core/scope-observer.js"])), "trackedFilesInScope(real git) identical");

console.log(failures === 0 ? "ALL PASS — LOT scope-observer EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
