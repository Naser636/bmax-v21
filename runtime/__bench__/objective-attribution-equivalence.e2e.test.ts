#!/usr/bin/env node
/*
 * LOT objective-attribution — EQUIVALENCE (historical .js vs compiled .ts).
 *
 * Offline, deterministic, PURE: build:runtime compiles runtime/core/objective-attribution.ts →
 * runtime/dist/core/objective-attribution.js; build-dist-closure co-locates its dep (capability-probes.js
 * + its transitive closure — all clean, no dynamic/external require) in dist/core. attributeObjectives is
 * a pure function of its inputs with INJECTED evidence/probe functions, so it is fully hermetic ⇒
 * BYTE-IDENTICAL. No normalisation needed.
 *
 * Run:  node_modules/.bin/tsx runtime/__bench__/objective-attribution-equivalence.e2e.test.ts
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const JS_MOD = path.join(REPO, "runtime", "core", "objective-attribution.js");
const TS_MOD = path.join(REPO, "runtime", "dist", "core", "objective-attribution.js");

let failures = 0;
function check(cond: boolean, label: string): void {
  if (cond) console.log(`  PASS ${label}`);
  else {
    failures++;
    console.log(`  FAIL ${label}`);
  }
}
const EQ = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

console.log("LOT objective-attribution — EQUIVALENCE (historical .js vs compiled .ts)");
execFileSync("npm", ["run", "build:runtime"], { cwd: REPO, stdio: ["ignore", "pipe", "ignore"] });
check(fs.existsSync(JS_MOD), "prerequisite: historical runtime/core/objective-attribution.js present (untouched)");
check(fs.existsSync(TS_MOD), "prerequisite: compiled runtime/dist/core/objective-attribution.js emitted");
check(fs.existsSync(path.join(REPO, "runtime", "dist", "core", "capability-probes.js")), "prerequisite: dep capability-probes.js co-located in dist by build-dist-closure");

delete require.cache[require.resolve(JS_MOD)];
delete require.cache[require.resolve(TS_MOD)];
const js = require(JS_MOD) as any;
const ts = require(TS_MOD) as any;
for (const x of ["attributeObjectives", "VERDICT", "OBSERVED"]) check(typeof js[x] !== "undefined" && typeof ts[x] !== "undefined", `both export ${x}`);
check(EQ(js.VERDICT, ts.VERDICT) && EQ(js.OBSERVED, ts.OBSERVED) && Object.isFrozen(ts.VERDICT) && Object.isFrozen(ts.OBSERVED), "VERDICT + OBSERVED byte-identical + frozen");

// Injected hermetic probe functions (never touch the real registry).
const evidenceProbe = (p: any) => typeof p === "string" && p.startsWith("present/"); // "present/*" ⇒ non-empty
const known = (name: any) => name === "known-proof";
const run = (name: any) => (name === "known-proof" ? { ok: true, detail: "ok" } : { ok: false, detail: "nope" });

const PLAN = { mission: "M1", objectives: [{ id: "o1" }, { id: "o2" }, { id: "o3" }] };
const PATCH = {
  patches: [
    { objectiveId: "o1", done_when: ["x"], proof: "known-proof" },
    { objectiveId: "o2", done_when: [] },
    { objectiveId: "o3", done_when: [], proof: "unregistered-proof" },
    { objectiveId: "oFail", done_when: [] },
    { objectiveId: "oDup", done_when: [] },
    { done_when: [] }, // no objectiveId ⇒ UNMATCHED
    { objectiveId: "oApplied", done_when: [] },
    { objectiveId: "oAppliedRefused", done_when: [] },
    { objectiveId: "oMissing", done_when: [] },
  ],
};
const EXEC = {
  executed: [
    { objectiveId: "o1", status: "EXECUTED", evidence: "present/o1.json" }, // EVIDENCED
    { objectiveId: "o2", status: "EXECUTED", evidence: "absent/o2.json" }, // EXECUTED no usable evidence ⇒ RECORDED
    { objectiveId: "o3", status: "RECORDED" }, // RECORDED-NO-EVIDENCE
    { objectiveId: "oFail", status: "FAILED" }, // FAILED
    { objectiveId: "oDup", status: "EXECUTED", evidence: "present/a" }, { objectiveId: "oDup", status: "EXECUTED" }, // INCONSISTENT (2)
    { objectiveId: "oApplied", status: "APPLIED", files: [{ target: "present/w1" }, { target: "present/w2" }] }, // EVIDENCED (targets present)
    { objectiveId: "oAppliedRefused", status: "APPLIED", files: [{ target: "present/w3" }], admission: [{ enforced: true, decision: "DENY" }] }, // RECORDED (enforced refusal)
    // oMissing: no execution entry ⇒ UNMATCHED
  ],
};

const resJ = js.attributeObjectives(PLAN, PATCH, EXEC, evidenceProbe, run, known, {});
const resT = ts.attributeObjectives(PLAN, PATCH, EXEC, evidenceProbe, run, known, {});
check(EQ(resJ, resT), "attributeObjectives full matrix BYTE-IDENTICAL JS≡TS");

// Spot-check each verdict + the summary + the declared-proof observation.
const byId = (r: any, id: any) => r.objectives.find((o: any) => o.objectiveId === id);
check(byId(resJ, "o1").verdict === "EVIDENCED" && byId(resJ, "o1").declaredProof.observed === "PROBE-PASSED", "o1 EVIDENCED + known proof PASSED");
check(byId(resJ, "o2").verdict === "RECORDED-NO-EVIDENCE", "o2 EXECUTED-no-usable-evidence ⇒ RECORDED-NO-EVIDENCE");
check(byId(resJ, "o3").verdict === "RECORDED-NO-EVIDENCE" && byId(resJ, "o3").declaredProof.observed === "PROBE-MISSING", "o3 RECORDED + unregistered proof MISSING");
check(byId(resJ, "oFail").verdict === "FAILED", "oFail FAILED");
check(byId(resJ, "oDup").verdict === "INCONSISTENT", "oDup INCONSISTENT (ambiguous join)");
check(byId(resJ, "oApplied").verdict === "EVIDENCED" && byId(resJ, "oApplied").evidence === "present/w1; present/w2", "oApplied APPLIED+targets-present ⇒ EVIDENCED");
check(byId(resJ, "oAppliedRefused").verdict === "RECORDED-NO-EVIDENCE", "oAppliedRefused enforced-DENY ⇒ RECORDED (never autonomous)");
check(byId(resJ, "oMissing").verdict === "UNMATCHED", "oMissing ⇒ UNMATCHED (no execution entry)");
check(resJ.objectives.find((o: any) => o.objectiveId === null).verdict === "UNMATCHED", "patch w/o objectiveId ⇒ UNMATCHED");
check(resJ.summary.doneWhenEvaluated === false && resJ.summary.evidenced === 2 && resJ.summary.unmatched === 2 && resJ.summary.inconsistent === 1 && resJ.summary.failed === 1, "summary tallies correct; done_when NEVER evaluated");

// plan/patch count mismatch ⇒ warning.
check(resJ.summary.warnings.length === 1 && /objectives \(3\) != patch-plan patches \(9\)/.test(resJ.summary.warnings[0]), "plan vs patch count mismatch ⇒ honest warning");

// default (no injected probe) path: probe defaults to ()=>false, run/known default to capability-probes.
const d2J = js.attributeObjectives(null, { patches: [{ objectiveId: "o1", done_when: [] }] }, { executed: [{ objectiveId: "o1", status: "EXECUTED", evidence: "x" }] }, undefined, undefined, undefined, {});
const d2T = ts.attributeObjectives(null, { patches: [{ objectiveId: "o1", done_when: [] }] }, { executed: [{ objectiveId: "o1", status: "EXECUTED", evidence: "x" }] }, undefined, undefined, undefined, {});
check(EQ(d2J, d2T) && d2J.objectives[0].verdict === "RECORDED-NO-EVIDENCE", "default evidenceProbe ⇒ false ⇒ EXECUTED-but-unevidenced RECORDED (both)");

// empty inputs ⇒ empty attribution.
check(EQ(js.attributeObjectives(null, null, null, evidenceProbe), ts.attributeObjectives(null, null, null, evidenceProbe)), "null inputs ⇒ empty attribution BYTE-IDENTICAL");

console.log(failures === 0 ? "ALL PASS — LOT objective-attribution EQUIVALENCE" : `FAILURES: ${failures}`);
process.exit(failures === 0 ? 0 : 1);
