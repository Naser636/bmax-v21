#!/usr/bin/env node
/*
 * LOT world-model — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE (no clock/random): build:runtime compiles runtime/core/world-model.ts →
 * runtime/dist/core/world-model.js; build-dist-closure co-locates its dep (state-transition.js — a TS
 * port) in dist/core. All functions are pure (model in → model out) ⇒ BYTE-IDENTICAL. load/save use a
 * caller-supplied file path, exercised against a temp file. No normalisation needed.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/world-model-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "world-model.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "world-model.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT world-model — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/world-model.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/world-model.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "state-transition.js")), "prerequisite: dep state-transition.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["ITEM_KINDS", "EPISTEMIC_STATUS", "DECISION", "WORLD_MODEL_CONTRACT", "emptyModel", "read", "put", "transition", "snapshot", "load", "save"]) {
  check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
}
for (const c of ["ITEM_KINDS", "EPISTEMIC_STATUS", "DECISION", "WORLD_MODEL_CONTRACT"]) check(EQ(js[c], ts[c]) && Object.isFrozen(ts[c]), `${c} byte-identical + frozen`);

// put — new item v1 / reject dup / reject bad kind / bad status / missing id.
const pJ = js.put(js.emptyModel(), "f1", { kind: "fact", status: "OBSERVED", value: 42, provenance: "p" });
const pT = ts.put(ts.emptyModel(), "f1", { kind: "fact", status: "OBSERVED", value: 42, provenance: "p" });
check(EQ(pJ, pT) && pJ.ok === true && pJ.item.version === 1 && pJ.item.kind === "fact" && pJ.item.value === 42, "put(new) ⇒ v1 item BYTE-IDENTICAL");
check(EQ(js.put(pJ.model, "f1", { kind: "fact", status: "OBSERVED" }), ts.put(pT.model, "f1", { kind: "fact", status: "OBSERVED" })) && js.put(pJ.model, "f1", { kind: "fact", status: "OBSERVED" }).decision === "REJECTED", "put(dup id) ⇒ REJECTED BYTE-IDENTICAL");
for (const [label, spec] of [["bad kind", { kind: "nope", status: "OBSERVED" }], ["bad status", { kind: "fact", status: "WAT" }]] as Array<[string, any]>) {
  check(EQ(js.put(js.emptyModel(), "x", spec), ts.put(ts.emptyModel(), "x", spec)), `put(${label}) ⇒ REJECTED BYTE-IDENTICAL`);
}
check(EQ(js.put(js.emptyModel(), "", { kind: "fact", status: "OBSERVED" }), ts.put(ts.emptyModel(), "", { kind: "fact", status: "OBSERVED" })), "put(no id) ⇒ REJECTED BYTE-IDENTICAL");

// transition — OK (status move), CONFLICT (stale), REJECTED (unknown item / bad toStatus / no-real-change).
const tJ = js.transition(pJ.model, "f1", { toStatus: "PROVEN", expectedPreviousVersion: 1, value: 42 });
const tT = ts.transition(pT.model, "f1", { toStatus: "PROVEN", expectedPreviousVersion: 1, value: 42 });
check(EQ(tJ, tT) && tJ.ok === true && tJ.item.version === 2 && tJ.item.status === "PROVEN" && tJ.item.provenance === "p", "transition OK ⇒ v2 PROVEN (provenance preserved) BYTE-IDENTICAL");
check(EQ(js.transition(pJ.model, "f1", { toStatus: "PROVEN", expectedPreviousVersion: 0, value: 1 }), ts.transition(pT.model, "f1", { toStatus: "PROVEN", expectedPreviousVersion: 0, value: 1 })) && js.transition(pJ.model, "f1", { toStatus: "PROVEN", expectedPreviousVersion: 0, value: 1 }).decision === "CONFLICT", "transition(stale) ⇒ CONFLICT BYTE-IDENTICAL");
check(EQ(js.transition(pJ.model, "unknown", { toStatus: "PROVEN", expectedPreviousVersion: 0 }), ts.transition(pT.model, "unknown", { toStatus: "PROVEN", expectedPreviousVersion: 0 })), "transition(unknown item) ⇒ REJECTED BYTE-IDENTICAL");
check(EQ(js.transition(pJ.model, "f1", { toStatus: "BADSTATUS", expectedPreviousVersion: 1 }), ts.transition(pT.model, "f1", { toStatus: "BADSTATUS", expectedPreviousVersion: 1 })), "transition(bad toStatus) ⇒ REJECTED BYTE-IDENTICAL");
// no-real-change: same status + same value ⇒ REJECTED.
check(EQ(js.transition(pJ.model, "f1", { toStatus: "OBSERVED", expectedPreviousVersion: 1, value: 42 }), ts.transition(pT.model, "f1", { toStatus: "OBSERVED", expectedPreviousVersion: 1, value: 42 })) && js.transition(pJ.model, "f1", { toStatus: "OBSERVED", expectedPreviousVersion: 1, value: 42 }).decision === "REJECTED", "transition(no real change) ⇒ REJECTED BYTE-IDENTICAL");

// snapshot — counts by status/kind.
let mJ = js.emptyModel(); mJ = js.put(mJ, "a", { kind: "fact", status: "OBSERVED" }).model; mJ = js.put(mJ, "b", { kind: "risk", status: "HYPOTHESIS" }).model;
let mT = ts.emptyModel(); mT = ts.put(mT, "a", { kind: "fact", status: "OBSERVED" }).model; mT = ts.put(mT, "b", { kind: "risk", status: "HYPOTHESIS" }).model;
check(EQ(js.snapshot(mJ), ts.snapshot(mT)) && js.snapshot(mJ).total === 2, "snapshot counts BYTE-IDENTICAL (total 2, byStatus/byKind)");

// load/save round-trip via a caller-supplied temp file.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wmodel-"));
try {
  const fJ = path.join(tmp, "j.json"); js.save(fJ, tJ.model);
  const fT = path.join(tmp, "t.json"); ts.save(fT, tT.model);
  check(fs.readFileSync(fJ, "utf8") === fs.readFileSync(fT, "utf8"), "save() on-disk content BYTE-IDENTICAL");
  check(EQ(js.load(fJ), ts.load(fT)) && js.load(fJ).items.f1.version === 2, "load() round-trips saved model (both)");
  check(EQ(js.load(path.join(tmp, "absent.json")), js.emptyModel()), "load(absent) ⇒ emptyModel (fail-closed)");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(failures === 0 ? "ALL PASS — LOT world-model EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
