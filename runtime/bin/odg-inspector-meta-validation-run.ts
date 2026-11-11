#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V85 §6 — INSPECTOR META-VALIDATION RUN. Applies inspector-meta-validation to the REAL canonical inspectors
 * — evidence-qualifier (V82) and evaluator-independence (§36/§49) — with a battery of SEEDED defects (ground-truth
 * DEFECTIVE) and clean controls (CLEAN), and measures whether each inspector actually CATCHES the seeded defects
 * (detection / false-negative rate). Two CONTROL inspectors (a blind one that always passes, a trigger-happy one that
 * always flags) prove the meta-validator discriminates: the blind one must score INEFFECTIVE (misses every defect), the
 * trigger-happy one must score INEFFECTIVE (false alarms on every clean case). Reuses the live modules; writes
 * docs/odg/V85_INSPECTOR_META_VALIDATION.json. Run: `odg-inspector-meta-validation-run.ts`.
 */

const path = require("path");
const fs = require("fs");
const MV = require("../core/inspector-meta-validation.js");
const Q = require("../core/evidence-qualifier.js");
const IND = require("../core/evaluator-independence.js");
const D = path.join(__dirname, "..", "..", "docs", "odg");

// ---- INSPECTOR 1: evidence-qualifier (V82). Seeded defects it MUST catch (status !== "VALID") vs a genuinely-valid control.
const qOpts = (content: string | null, markers: string[], gate: string[] = []) => ({
  exists: () => content !== null, read: () => content, expectMarkers: markers, gateSuites: gate,
});
const qualifierCases = [
  // SEEDED DEFECTS — a lenient/broken qualifier would wrongly call these VALID.
  { id: "def:empty-but-present", label: "DEFECTIVE", input: ["x.json", qOpts("   ", ["M"])], detects: (v: any) => v.status !== "VALID" },
  { id: "def:wrong-content", label: "DEFECTIVE", input: ["x.json", qOpts('{"other":1}', ["M"])], detects: (v: any) => v.status !== "VALID" },
  { id: "def:missing-marker", label: "DEFECTIVE", input: ["x.json", qOpts('{"M":1}', ["M", "N"])], detects: (v: any) => v.status !== "VALID" },
  { id: "def:test-not-gate-wired", label: "DEFECTIVE", input: ["a/x.test.ts", qOpts("check", ["check"], ["other.test.ts"])], detects: (v: any) => v.status !== "VALID" },
  { id: "def:absent-pointer", label: "DEFECTIVE", input: ["x.json", qOpts(null, ["M"])], detects: (v: any) => v.status !== "VALID" },
  // CLEAN CONTROLS — a correct qualifier passes these (VALID); flagging them would be a false alarm.
  { id: "clean:json-all-markers", label: "CLEAN", input: ["x.json", qOpts('{"M":1,"N":2}', ["M", "N"])], detects: (v: any) => v.status !== "VALID" },
  { id: "clean:test-gate-wired", label: "CLEAN", input: ["a/x.test.ts", qOpts("check", ["check"], ["b/x.test.ts"])], detects: (v: any) => v.status !== "VALID" },
];
const qualifierInspector = (input: any) => Q.qualify(input[0], input[1]);

// ---- INSPECTOR 2: evaluator-independence (§36/§49). Seeded defects: compromised actor sets it MUST flag (verdict COMPROMISED).
const indCases = [
  // SEEDED DEFECTS.
  { id: "def:self-certification", label: "DEFECTIVE", input: { builder: { id: "A" }, verifier: { id: "A" } }, detects: (v: any) => v.verdict === "COMPROMISED" },
  { id: "def:shared-model", label: "DEFECTIVE", input: { builder: { id: "A", model: "m1" }, verifier: { id: "B", model: "m1" } }, detects: (v: any) => v.verdict === "COMPROMISED" },
  { id: "def:shared-data", label: "DEFECTIVE", input: { builder: { id: "A", data: "d1" }, verifier: { id: "B", data: "d1" } }, detects: (v: any) => v.verdict === "COMPROMISED" },
  { id: "def:shared-evidence-access", label: "DEFECTIVE", input: { builder: { id: "A", evidenceAccess: "e1" }, verifier: { id: "B", evidenceAccess: "e1" } }, detects: (v: any) => v.verdict === "COMPROMISED" },
  // CLEAN CONTROL — genuinely independent actors (no shared critical dimension) ⇒ INDEPENDENT; flagging = false alarm.
  { id: "clean:independent", label: "CLEAN", input: { builder: { id: "A", model: "m1", data: "d1" }, verifier: { id: "B", model: "m2", data: "d2" } }, detects: (v: any) => v.verdict === "COMPROMISED" },
];
const indInspector = (input: any) => IND.auditIndependence(input);

// ---- CONTROL INSPECTORS — prove the meta-validator discriminates. Reuse the qualifier battery.
const blindInspector = () => ({ status: "VALID", verdict: "INDEPENDENT" });              // always passes ⇒ must miss every defect
const triggerHappyInspector = () => ({ status: "INSUFFICIENT", verdict: "COMPROMISED" }); // always flags ⇒ must false-alarm every clean case

const report = MV.metaValidateMany([
  { name: "evidence-qualifier (V82)", inspector: qualifierInspector, cases: qualifierCases },
  { name: "evaluator-independence (§36/§49)", inspector: indInspector, cases: indCases },
  { name: "CONTROL:blind-always-pass", inspector: blindInspector, cases: qualifierCases },
  { name: "CONTROL:trigger-happy-always-flag", inspector: triggerHappyInspector, cases: qualifierCases },
]);

const real = report.results.filter((r: any) => !/^CONTROL:/.test(r.name));
const blind = report.results.find((r: any) => r.name === "CONTROL:blind-always-pass");
const trigger = report.results.find((r: any) => r.name === "CONTROL:trigger-happy-always-flag");

const out = {
  "//": "CTO V85 §6 — meta-validation of the inspectors themselves. Each real inspector is scored against a battery of SEEDED defects (ground-truth DEFECTIVE) + clean controls; detectionRate = seeded defects caught. Fail-closed: an inspector that misses a seeded defect (false negative) is INEFFECTIVE even if every clean case passes. Two control inspectors prove the harness discriminates. Reuses inspector-meta-validation + the live evidence-qualifier/evaluator-independence; no new engine.",
  realInspectors: real.map((r: any) => ({ name: r.name, effective: r.effective, detectionRate: r.detectionRate, falseNegativeRate: r.falseNegativeRate, falsePositiveRate: r.falsePositiveRate, confusion: r.confusion, missed: r.missed, falseAlarms: r.falseAlarms })),
  realAllEffective: real.length > 0 && real.every((r: any) => r.effective === true),
  controls: {
    blindAlwaysPass: { effective: blind.effective, detectionRate: blind.detectionRate, missed: blind.missed.length, note: "must be INEFFECTIVE — misses every seeded defect (proves clean-only green ≠ proof)" },
    triggerHappyAlwaysFlag: { effective: trigger.effective, falsePositiveRate: trigger.falsePositiveRate, falseAlarms: trigger.falseAlarms.length, note: "must be INEFFECTIVE — false-alarms every clean case (detection without discrimination ≠ proof)" },
  },
  discriminates: real.every((r: any) => r.effective) && blind.effective === false && trigger.effective === false,
  weakestInspector: report.weakest,
  honestConclusion: `${real.filter((r: any) => r.effective).length}/${real.length} real inspectors are EFFECTIVE (catch 100% of seeded defects, 0 false alarms). The blind control is ${blind.effective ? "WRONGLY effective" : "correctly INEFFECTIVE"} and the trigger-happy control is ${trigger.effective ? "WRONGLY effective" : "correctly INEFFECTIVE"} — the meta-validator discriminates between a real inspector and a useless one. A green inspector that cannot catch a known defect is now provably rejected.`,
  invariant: "the inspector is the system-under-test; a missed seeded defect (false negative) ⇒ INEFFECTIVE; no false alarms; fail-closed on empty/defect-free batteries; a green suite that misses a known defect proves nothing.",
};
fs.writeFileSync(path.join(D, "V85_INSPECTOR_META_VALIDATION.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ realAllEffective: out.realAllEffective, discriminates: out.discriminates, blindEffective: blind.effective, triggerEffective: trigger.effective, weakest: out.weakestInspector }, null, 2) + "\n");
export {};
