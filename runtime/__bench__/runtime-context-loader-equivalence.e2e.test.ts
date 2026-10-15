#!/usr/bin/env node
/*
 * LOT runtime-context-loader — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/runtime-context-loader.ts →
 * runtime/dist/core/runtime-context-loader.js (LEAF, deps=0). loadRuntimeContext reads the
 * CWD-relative runtime/generated/runtime-context.json, so a seeded temp cwd makes the deterministic
 * branches fully reproducible ⇒ BYTE-IDENTICAL:
 *   - valid cached context ⇒ returns the parsed object (no spawn),
 *   - present-but-invalid context ⇒ throws "Invalid RuntimeContext." (same message).
 * The cache-MISS branch spawns the external project-context-engine (non-deterministic, heavy); it is
 * a verbatim source port and is deliberately NOT exercised here to keep the bench deterministic —
 * both the .js and .ts contain byte-identical spawn logic (verified by the source diff in review).
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/runtime-context-loader-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "runtime-context-loader.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "runtime-context-loader.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Capture a thrown message or the returned value, so JS and TS outcomes compare identically. */
function outcome(fn: () => any): { ok: boolean; value?: any; error?: string } {
  try {
    return { ok: true, value: fn() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

console.log("LOT runtime-context-loader — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/runtime-context-loader.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/runtime-context-loader.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.loadRuntimeContext === "function" && typeof ts.loadRuntimeContext === "function", "both export loadRuntimeContext");

function seed(context: unknown): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "rcl-"));
  const f = path.join(d, "runtime", "generated", "runtime-context.json");
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(context));
  return d;
}

const origCwd = process.cwd();
const temps: string[] = [];
try {
  const VALID = { project: { files: 123, directories: 45 }, extra: { a: 1 } };
  const dJ = seed(VALID); temps.push(dJ); process.chdir(dJ);
  const oJ = outcome(() => js.loadRuntimeContext());
  process.chdir(origCwd);
  const dT = seed(VALID); temps.push(dT); process.chdir(dT);
  const oT = outcome(() => ts.loadRuntimeContext());
  process.chdir(origCwd);
  check(EQ(oJ, oT) && oJ.ok === true && EQ(oJ.value, VALID), "valid cached context ⇒ returns parsed object BYTE-IDENTICAL (no spawn)");

  // present-but-invalid (missing project) ⇒ throw "Invalid RuntimeContext."
  for (const [label, bad] of [["missing project", {}], ["files not a number", { project: { files: "x", directories: 1 } }], ["directories missing", { project: { files: 1 } }]] as Array<[string, unknown]>) {
    const bJ = seed(bad); temps.push(bJ); process.chdir(bJ);
    const eJ = outcome(() => js.loadRuntimeContext());
    process.chdir(origCwd);
    const bT = seed(bad); temps.push(bT); process.chdir(bT);
    const eT = outcome(() => ts.loadRuntimeContext());
    process.chdir(origCwd);
    check(EQ(eJ, eT) && eJ.ok === false && eJ.error === "Invalid RuntimeContext.", `invalid (${label}) ⇒ throws "Invalid RuntimeContext." BYTE-IDENTICAL`);
  }
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

console.log(failures === 0 ? "ALL PASS — LOT runtime-context-loader EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
