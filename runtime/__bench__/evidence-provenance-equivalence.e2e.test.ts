#!/usr/bin/env node
/*
 * LOT evidence-provenance — EQUIVALENCE (historical .js vs compiled .ts). Offline, PURE (no network/money;
 * the git read is INJECTED via opts.spawn ⇒ zero subprocess). build:runtime compiles the .ts → dist
 * (deps=0). Both modules are driven with IDENTICAL inputs and compared BYTE-IDENTICAL — proving the
 * attributable, tamper-evident provenance stamp (content digest + source binding, fail-closed) is preserved.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/evidence-provenance-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "evidence-provenance.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "evidence-provenance.js");
let failures = 0;
const check = (c: boolean, l: string) => { if (c) console.log(`  PASS ${l}`); else { failures++; console.log(`  FAIL ${l}`); } };
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT evidence-provenance — EQUIVALENCE");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD) && fs.existsSync(TS_MOD), "prerequisite: .js present + dist .ts emitted");
delete require.cache[require.resolve(JS_MOD)]; delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any; const ts = require(TS_MOD) as any;
for (const x of ["SCHEMA", "contentDigest", "resolveSourceRevision", "stampProvenance", "verifyProvenance"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(js.SCHEMA === ts.SCHEMA, "SCHEMA identical");

const spawnDirty = (cmd: any, args: any) => {
  if (cmd === "git" && args[0] === "rev-parse") return { status: 0, stdout: "abc123def456\n" };
  if (cmd === "git" && args[0] === "status") return { status: 0, stdout: " M file.ts\n" };
  return { status: 1, stdout: "" };
};
const spawnNoRepo = () => ({ status: 128, stdout: "", stderr: "not a git repository" });
const payload = { a: 1, b: ["x", "y"], verdict: "VERIFIED" };

// contentDigest — equal, and excludes the provenance field
check(js.contentDigest(payload) === ts.contentDigest(payload), "contentDigest byte-identical");
check(js.contentDigest({ ...payload, provenance: { x: 1 } }) === ts.contentDigest(payload), "contentDigest excludes provenance identically");
// resolveSourceRevision — injected dirty + fail-closed
check(EQ(js.resolveSourceRevision({ spawn: spawnDirty }), ts.resolveSourceRevision({ spawn: spawnDirty })), "resolveSourceRevision (dirty, injected) byte-identical");
check(EQ(js.resolveSourceRevision({ spawn: spawnNoRepo }), ts.resolveSourceRevision({ spawn: spawnNoRepo })), "resolveSourceRevision (no repo, fail-closed) byte-identical");
check(js.resolveSourceRevision({ spawn: spawnNoRepo }).available === false, "fail-closed ⇒ available:false (both)");
// stampProvenance — additive, with injected revision for determinism
const rev = { commit: "deadbeef", treeDirty: false, available: true };
check(EQ(js.stampProvenance(payload, { revision: rev, runId: "R1" }), ts.stampProvenance(payload, { revision: rev, runId: "R1" })), "stampProvenance byte-identical (additive + fields)");
check(EQ(js.stampProvenance("scalar", { revision: rev }), ts.stampProvenance("scalar", { revision: rev })), "stampProvenance (scalar wrap) byte-identical");
// verifyProvenance — ok + tamper detection
const stamped = js.stampProvenance(payload, { revision: rev });
check(EQ(js.verifyProvenance(stamped), ts.verifyProvenance(stamped)), "verifyProvenance (intact) byte-identical");
const tampered = JSON.parse(JSON.stringify(stamped)); tampered.a = 999;
check(EQ(js.verifyProvenance(tampered), ts.verifyProvenance(tampered)) && js.verifyProvenance(tampered).ok === false, "verifyProvenance (tampered) byte-identical + detects mutation");

console.log(failures === 0 ? "ALL PASS — LOT evidence-provenance EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
