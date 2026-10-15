#!/usr/bin/env node
/*
 * LOT decision-rules — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/decision-rules.ts →
 * runtime/dist/core/decision-rules.js (LEAF, self-contained). Asserts the RULES table and match()
 * are BYTE-IDENTICAL (JSON) across representative rule hits, the word-boundary safety (substring never
 * matches), fixers passthrough, and the miss ⇒ null behaviour. No meaningful difference normalised.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/decision-rules-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "decision-rules.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "decision-rules.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT decision-rules — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/decision-rules.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/decision-rules.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(typeof js.match === "function" && Array.isArray(js.RULES), "JS exports match + RULES");
check(typeof ts.match === "function" && Array.isArray(ts.RULES), "compiled TS exports match + RULES");

// RULES table byte-identical (order + contents).
check(JSON.stringify(js.RULES) === JSON.stringify(ts.RULES), "RULES table BYTE-IDENTICAL JS≡TS");

const GOALS = [
  "diagnose the runtime",
  "integrate branch feature into main",
  "merge branch X",
  "run a git status",
  "run a bash command",
  "external research on markets",
  "research acquisition task",
  "edit file src/x.ts",
  "inspect the repository state",
  "état du dépôt",
  "audit the carnet",
  "is the state honest",
  "converge the runtime",
  "fix unused imports",
  "strip trailing whitespace",
  "format the file",       // local-fixers + 3 fixers
  "lint the file",
  "run the tests",
  "resume from checkpoint",
  "build recovery",
  "typescript errors",
  "the latest release",    // WORD-BOUNDARY: must NOT match 'test' (substring in 'latest')
  "open the profile",      // must NOT match 'file' (substring in 'profile')
  "completely unrelated zzz gibberish",  // miss ⇒ null
];
for (const g of GOALS) {
  const j = js.match(g), t = ts.match(g);
  check(JSON.stringify(j) === JSON.stringify(t), `match(${JSON.stringify(g).slice(0, 34)}): identical (cap=${j ? j.capability : "null"})`);
}
// Explicit safety spot-checks on the JS reference (equal to TS by byte-identity above).
check(js.match("the latest release") === null || (js.match("the latest release") && js.match("the latest release").capability !== "local-test-gate"), "word-boundary: 'latest' does not trigger the 'test' rule");
check(JSON.stringify(js.match("format the file").fixers) === JSON.stringify(["stripTrailingWhitespace", "collapseBlankLines", "ensureFinalNewline"]), "'format' carries the 3 fixers");
check(js.match("completely unrelated zzz gibberish") === null, "a miss returns null");

console.log(failures === 0 ? "ALL PASS — LOT decision-rules EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
