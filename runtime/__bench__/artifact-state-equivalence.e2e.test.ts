#!/usr/bin/env node
/*
 * LOT artifact-state — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic: build:runtime compiles runtime/core/artifact-state.ts →
 * runtime/dist/core/artifact-state.js; build-dist-closure co-locates its dep (state-transition.js — a TS
 * port) in dist/core. Pure core (sha256 deterministic; no clock/randomness) ⇒ BYTE-IDENTICAL. load/save
 * use a caller-supplied file path, exercised against a temp file.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/artifact-state-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "artifact-state.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "artifact-state.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT artifact-state — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/artifact-state.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/artifact-state.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "state-transition.js")), "prerequisite: dep state-transition.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["DECISION", "ARTIFACT_STATE_CONTRACT", "hashContent", "canonicalId", "emptyModel", "read", "currentVersion", "transition", "snapshot", "load", "save"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
for (const c of ["DECISION", "ARTIFACT_STATE_CONTRACT"]) check(EQ(js[c], ts[c]) && Object.isFrozen(ts[c]), `${c} byte-identical + frozen`);

// hashContent — deterministic.
check(js.hashContent("hello") === ts.hashContent("hello") && js.hashContent("hello").length === 64, "hashContent sha256 identical (64 hex)");
check(js.hashContent(123) === ts.hashContent(123), "hashContent coerces non-string identically");

// canonicalId.
for (const t of ["src/a.ts", "src/./a.ts", "src/b/../a.ts", "a/", "/abs/x", "..", "../escape", "", "x\\y"]) {
  check(js.canonicalId(t) === ts.canonicalId(t), `canonicalId(${JSON.stringify(t)}) = ${JSON.stringify(js.canonicalId(t))} identical`);
}

// transition — OK / CONFLICT / REJECTED, provenance preservation, version increment.
const m0 = js.emptyModel();
const okJ = js.transition(m0, "src/a.ts", { expectedPreviousVersion: 0, content: "v1", provenance: "P" });
const okT = ts.transition(ts.emptyModel(), "src/a.ts", { expectedPreviousVersion: 0, content: "v1", provenance: "P" });
check(EQ(okJ, okT) && okJ.ok === true && okJ.artifact.version === 1 && okJ.artifact.contentHash === js.hashContent("v1"), "transition OK: version 0→1 + contentHash(content) BYTE-IDENTICAL");
check(okJ.artifact.provenance === "P", "transition OK: provenance stored");

// second transition from version 1 (CAS satisfied) preserves provenance when omitted.
const ok2J = js.transition(okJ.model, "src/a.ts", { expectedPreviousVersion: 1, content: "v2" });
const ok2T = ts.transition(okT.model, "src/a.ts", { expectedPreviousVersion: 1, content: "v2" });
check(EQ(ok2J, ok2T) && ok2J.artifact.version === 2 && ok2J.artifact.provenance === "P", "transition OK #2: version→2, provenance preserved when omitted");

// CONFLICT (stale expectedPreviousVersion).
const confJ = js.transition(okJ.model, "src/a.ts", { expectedPreviousVersion: 0, content: "x" });
const confT = ts.transition(okT.model, "src/a.ts", { expectedPreviousVersion: 0, content: "x" });
check(EQ(confJ, confT) && confJ.decision === "CONFLICT" && confJ.ok === false, "transition CONFLICT (stale version) BYTE-IDENTICAL, zero change");

// REJECTED variants.
for (const [label, target, change] of [
  ["bad id (absolute)", "/abs", { expectedPreviousVersion: 0, content: "x" }],
  ["missing expectedPreviousVersion", "src/a.ts", { content: "x" }],
  ["no content/hash", "src/a.ts", { expectedPreviousVersion: 0 }],
] as Array<[string, any, any]>) {
  check(EQ(js.transition(m0, target, change), ts.transition(m0, target, change)), `transition REJECTED (${label}) BYTE-IDENTICAL`);
}

// currentVersion / read / snapshot.
check(js.currentVersion(okJ.model, "src/a.ts") === 1 && ts.currentVersion(okT.model, "src/a.ts") === 1, "currentVersion tracked = 1");
check(js.currentVersion(m0, "unknown") === 0 && ts.currentVersion(m0, "unknown") === 0, "currentVersion untracked = 0");
check(EQ(js.snapshot(okJ.model), ts.snapshot(okT.model)) && js.snapshot(okJ.model).total === 1, "snapshot total identical");

// load/save round-trip via a caller-supplied temp file.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "astate-"));
try {
  const fJ = path.join(tmp, "j.json");
  js.save(fJ, okJ.model);
  const fT = path.join(tmp, "t.json");
  ts.save(fT, okT.model);
  check(fs.readFileSync(fJ, "utf8") === fs.readFileSync(fT, "utf8"), "save() on-disk content BYTE-IDENTICAL");
  check(EQ(js.load(fJ), ts.load(fT)) && js.load(fJ).artifacts["src/a.ts"].version === 1, "load() round-trips saved model (both)");
  check(EQ(js.load(path.join(tmp, "absent.json")), js.emptyModel()), "load(absent) ⇒ emptyModel (fail-closed)");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? "ALL PASS — LOT artifact-state EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
