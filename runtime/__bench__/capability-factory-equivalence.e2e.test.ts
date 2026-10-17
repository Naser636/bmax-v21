#!/usr/bin/env node
/*
 * LOT capability-factory — EQUIVALENCE (historical runtime/core/capability-factory.js vs compiled .ts).
 *
 * Offline, deterministic, hermetic: build:runtime compiles the .ts → runtime/dist/core. capability-factory
 * writes a generated module + a catalog under runtime/generated/autonomy (cwd-relative via autonomy-store),
 * so the bench chdirs into a FRESH temp cwd per create() (separate for JS and TS) to isolate state — NO real
 * autonomy store touched. Each scenario calls the SAME public API (slug / create / exists / list) on BOTH
 * modules and asserts BYTE-IDENTICAL results (the create() RETURN carries a relative path + no timestamp, so
 * it is deterministic; the registeredAt timestamp lives only in the catalog, which is not compared).
 *
 * KEY (the V71 dynamic-require fix): create() self-checks the GENERATED module by loading it via the
 * sanctioned legacyRequire form. The compiled TS runs from runtime/dist/core; this bench proves its
 * create() returns contractOk:true — i.e. the sanctioned dynamic load works in the compiled runtime — and
 * the generated module CONTENT is byte-identical to the JS port's.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/capability-factory-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "capability-factory.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "capability-factory.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`); else { failures++; console.log(`  FAIL ${label}`); }
}

console.log("LOT capability-factory — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/capability-factory.js present");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/capability-factory.js emitted");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
check(["create", "exists", "list", "slug"].every((k) => typeof js[k] === "function"), "JS exports create/exists/list/slug");
check(["create", "exists", "list", "slug"].every((k) => typeof ts[k] === "function"), "compiled TS exports create/exists/list/slug");

// slug — pure, byte-identical.
for (const n of ["Build CSV→JSON", "  weird__Name!!  ", "déjà vu", "", "ALLCAPS", "a/b\\c"]) {
  check(js.slug(n) === ts.slug(n), `slug("${n}") identical ("${js.slug(n)}")`);
}

const genRoot = path.join(REPO, "runtime", "generated");
fs.mkdirSync(genRoot, { recursive: true });
function tmpCwd(): string { return fs.mkdtempSync(path.join(genRoot, "cf-bench-")); }

// create() in an ISOLATED temp cwd (chdir), on each port separately. Compare the deterministic return +
// the generated module file CONTENT. Proves the sanctioned dynamic self-check works on BOTH ports.
function runCreate(mod: any, name: string, spec: any): { ret: any; content: string } {
  const prev = process.cwd();
  const cwd = tmpCwd();
  try {
    process.chdir(cwd);
    const ret = mod.create(name, spec);
    const content = fs.readFileSync(path.join(cwd, ret.file), "utf8");
    const existsTrue = mod.exists(name) === true && mod.exists("no-such-cap-" + name) === false;
    return { ret, content, existsTrue } as any;
  } finally { process.chdir(prev); }
}

for (const [name, spec] of [
  ["CSV to JSON converter", { goal: "convert csv to json" }],
  ["Quote builder", {}],
  ["déjà-vu cap", { goal: "" }],
] as Array<[string, any]>) {
  const j = runCreate(js, name, spec) as any;
  const t = runCreate(ts, name, spec) as any;
  check(JSON.stringify(j.ret) === JSON.stringify(t.ret), `create("${name}") return byte-identical (${j.ret.slug}, contractOk=${j.ret.contractOk})`);
  check(j.content === t.content, `create("${name}") GENERATED module content byte-identical`);
  check(j.ret.contractOk === true && t.ret.contractOk === true, `create("${name}") contract self-check PASSED on both (sanctioned dynamic load works in compiled TS)`);
  check(j.existsTrue && t.existsTrue, `exists("${name}") true on both after create`);
}

console.log(failures === 0 ? "ALL PASS — LOT capability-factory EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
