#!/usr/bin/env node
/*
 * LOT local-fixers — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/local-fixers.ts →
 * runtime/dist/core/local-fixers.js (LEAF, self-contained). Each scenario calls the SAME public API on
 * BOTH modules and asserts BYTE-IDENTICAL outputs (JSON/string, zero normalisation), covering every
 * fixer, the run() chain + unknown-fixer throw, the applyFixers WRITE side effect + idempotency, and
 * names(). No meaningful difference normalised.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/local-fixers-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "local-fixers.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "local-fixers.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}
function thrown(fn: () => unknown): string { try { fn(); return "<no throw>"; } catch (e: any) { return String(e && e.message || e); } }

console.log("LOT local-fixers — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/local-fixers.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/local-fixers.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const fn of ["stripTrailingWhitespace", "ensureFinalNewline", "collapseBlankLines", "removeUnusedNamedImports", "run", "applyFixers", "names"]) {
  check(typeof js[fn] === "function" && typeof ts[fn] === "function", `both export ${fn}`);
}

// Per-fixer parity (normal + edge).
const strInputs = [
  "a   \nb\t\t\n", "no trailing", "trailing spaces   ", "line\n\n\n\n\nnext", "", "already\n",
  "missing newline", "x\n\n\n", 'import { a, b, c } from "m";', 'import {a} from "m"',
];
for (const s of strInputs) {
  for (const f of ["stripTrailingWhitespace", "ensureFinalNewline", "collapseBlankLines"]) {
    check(js[f](s) === ts[f](s), `${f}(${JSON.stringify(s).slice(0, 24)}): identical`);
  }
}
// removeUnusedNamedImports (2-arg, line-drop + whole-line removal).
{
  const src = 'import { a, b, c } from "m";\nkeep();\nimport { only } from "n";';
  check(js.removeUnusedNamedImports(src, ["b"]) === ts.removeUnusedNamedImports(src, ["b"]), "removeUnusedNamedImports drop one: identical");
  check(js.removeUnusedNamedImports(src, ["a", "b", "c"]) === ts.removeUnusedNamedImports(src, ["a", "b", "c"]), "removeUnusedNamedImports drop-all removes line: identical");
  check(js.removeUnusedNamedImports(src, []) === ts.removeUnusedNamedImports(src, []), "removeUnusedNamedImports empty list no-op: identical");
}

// run() chain + unknown-fixer throw.
{
  const s = "a  \n\n\n\nb   ";
  check(js.run(s, ["stripTrailingWhitespace", "collapseBlankLines", "ensureFinalNewline"]) === ts.run(s, ["stripTrailingWhitespace", "collapseBlankLines", "ensureFinalNewline"]), "run(chain) identical");
  check(thrown(() => js.run(s, ["nope"])) === thrown(() => ts.run(s, ["nope"])) && thrown(() => js.run(s, ["nope"])).includes("unknown fixer"), "run(unknown) same throw message");
}

// applyFixers WRITE side effect + idempotency, compared on separate temp files.
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lfx-"));
  const content = "a   \n\n\n\n\nb\t\n";
  const fj = path.join(dir, "j.txt"); fs.writeFileSync(fj, content);
  const ft = path.join(dir, "t.txt"); fs.writeFileSync(ft, content);
  const names = ["stripTrailingWhitespace", "collapseBlankLines", "ensureFinalNewline"];
  const rj1 = js.applyFixers(fj, names), rt1 = ts.applyFixers(ft, names);
  check(rj1.changed === true && rt1.changed === true, "applyFixers first pass: changed=true (both)");
  check(fs.readFileSync(fj, "utf8") === fs.readFileSync(ft, "utf8"), "applyFixers wrote IDENTICAL content JS≡TS");
  const rj2 = js.applyFixers(fj, names), rt2 = ts.applyFixers(ft, names);
  check(rj2.changed === false && rt2.changed === false, "applyFixers idempotent: second pass changed=false (both)");
  fs.rmSync(dir, { recursive: true, force: true });
}

// names() parity.
check(JSON.stringify(js.names()) === JSON.stringify(ts.names()), "names() identical fixer list");

console.log(failures === 0 ? "ALL PASS — LOT local-fixers EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
