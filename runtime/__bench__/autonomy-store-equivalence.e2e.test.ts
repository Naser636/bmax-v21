#!/usr/bin/env node
/*
 * LOT autonomy-store — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/autonomy-store.ts →
 * runtime/dist/core/autonomy-store.js (LEAF, deps=0). The store is CWD-relative
 * (runtime/generated/autonomy/<name>.json), so a seeded temp cwd makes read/write fully
 * deterministic ⇒ BYTE-IDENTICAL. Exercises: DIR constant, file() path, read-missing fallback
 * (both undefined⇒null and provided-fallback), write (mkdir+pretty-JSON+return), round-trip, and
 * read of a corrupt file ⇒ fallback.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/autonomy-store-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "autonomy-store.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "autonomy-store.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT autonomy-store — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/autonomy-store.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/autonomy-store.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["DIR", "file", "read", "write"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
check(js.DIR === ts.DIR && js.DIR === path.join("runtime", "generated", "autonomy"), "DIR constant cwd-relative + identical");
check(js.file("foo") === ts.file("foo") && js.file("foo") === path.join(js.DIR, "foo.json"), "file(name) path identical");

const origCwd = process.cwd();
const temps: string[] = [];
try {
  // read-missing: undefined fallback ⇒ null; provided fallback ⇒ that value.
  const r1 = fs.mkdtempSync(path.join(os.tmpdir(), "astore-")); temps.push(r1); process.chdir(r1);
  check(js.read("absent") === null && ts.read("absent") === null, "read(missing, no fallback) ⇒ null (both)");
  check(EQ(js.read("absent", { a: 1 }), ts.read("absent", { a: 1 })) && EQ(js.read("absent", { a: 1 }), { a: 1 }), "read(missing, fallback) ⇒ fallback (both)");

  // write then read-back; JS and TS over separate seeded cwds must produce identical content + return.
  const payload = { version: 1, items: [{ k: "v", n: 2 }], nested: { z: true } };
  const rJ = fs.mkdtempSync(path.join(os.tmpdir(), "astoreJ-")); temps.push(rJ); process.chdir(rJ);
  const retJ = js.write("db", payload);
  const diskJ = fs.readFileSync(path.join(rJ, "runtime", "generated", "autonomy", "db.json"), "utf8");
  const backJ = js.read("db");
  const rT = fs.mkdtempSync(path.join(os.tmpdir(), "astoreT-")); temps.push(rT); process.chdir(rT);
  const retT = ts.write("db", payload);
  const diskT = fs.readFileSync(path.join(rT, "runtime", "generated", "autonomy", "db.json"), "utf8");
  const backT = ts.read("db");
  check(EQ(retJ, retT) && EQ(retJ, payload), "write() returns the written object (both)");
  check(diskJ === diskT, "write() on-disk content BYTE-IDENTICAL (pretty JSON, 2-space)");
  check(EQ(backJ, backT) && EQ(backJ, payload), "read() after write round-trips (both)");

  // corrupt file ⇒ fallback (parse error path).
  const rC = fs.mkdtempSync(path.join(os.tmpdir(), "astoreC-")); temps.push(rC); process.chdir(rC);
  fs.mkdirSync(path.join(rC, "runtime", "generated", "autonomy"), { recursive: true });
  fs.writeFileSync(path.join(rC, "runtime", "generated", "autonomy", "bad.json"), "{not json");
  check(js.read("bad", "FB") === "FB" && ts.read("bad", "FB") === "FB", "read(corrupt) ⇒ fallback (parse error path, both)");
} finally {
  process.chdir(origCwd);
  for (const d of temps) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
}

console.log(failures === 0 ? "ALL PASS — LOT autonomy-store EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
