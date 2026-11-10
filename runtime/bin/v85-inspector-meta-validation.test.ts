#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V85 §6/§15 — inspector meta-validation test. Proves the meta-validator treats the INSPECTOR as the
 * system-under-test and is itself adversarially sound: a blind inspector (always passes) scores INEFFECTIVE because it
 * MISSES seeded defects (false negatives); a trigger-happy inspector (always flags) scores INEFFECTIVE because it raises
 * false alarms; a perfect inspector scores EFFECTIVE; fail-closed on empty / defect-free batteries; a crash counts as
 * flagged; and the REAL canonical inspectors (evidence-qualifier, evaluator-independence) catch 100% of their seeded
 * defects with 0 false alarms. Live module + artifact.
 */

const path = require("path");
const fs = require("fs");
const MV = require("../core/inspector-meta-validation.js");
const ART = path.join(__dirname, "..", "..", "docs", "odg", "V85_INSPECTOR_META_VALIDATION.json");

let failures = 0;
function check(name: string, cond: boolean): void { process.stdout.write(`${cond ? "ok" : "NOT OK"} - ${name}\n`); if (!cond) failures++; }

// a 2-defect / 2-clean labelled battery; flagged ⟺ verdict !== "OK".
const battery = [
  { id: "d1", label: "DEFECTIVE", input: "bad", detects: (v: any) => v !== "OK" },
  { id: "d2", label: "DEFECTIVE", input: "bad", detects: (v: any) => v !== "OK" },
  { id: "c1", label: "CLEAN", input: "good", detects: (v: any) => v !== "OK" },
  { id: "c2", label: "CLEAN", input: "good", detects: (v: any) => v !== "OK" },
];

function main(): void {
  // perfect inspector: flags the two defects, passes the two cleans.
  const perfect = MV.metaValidate({ inspector: (x: string) => (x === "bad" ? "FLAG" : "OK"), cases: battery });
  check("perfect inspector ⇒ EFFECTIVE (detectionRate 1.0, 0 false alarms)", perfect.effective === true && perfect.detectionRate === 1 && perfect.confusion.FP === 0);

  // blind inspector: always "OK" ⇒ misses BOTH defects ⇒ INEFFECTIVE (the clean cases being green proves nothing).
  const blind = MV.metaValidate({ inspector: () => "OK", cases: battery });
  check("blind inspector (always pass) ⇒ INEFFECTIVE despite 2 green clean cases", blind.effective === false && blind.confusion.FN === 2 && blind.confusion.TN === 2 && blind.falseNegativeRate === 1);
  check("blind inspector: the missed defects are named", blind.missed.includes("d1") && blind.missed.includes("d2"));

  // trigger-happy inspector: always "FLAG" ⇒ catches defects but false-alarms both cleans ⇒ INEFFECTIVE.
  const trigger = MV.metaValidate({ inspector: () => "FLAG", cases: battery });
  check("trigger-happy inspector ⇒ INEFFECTIVE (false alarms on clean cases)", trigger.effective === false && trigger.confusion.FP === 2 && trigger.falsePositiveRate === 1);

  // crash counts as flagged (a throw is a detection signal, never a silent pass).
  const crash = MV.metaValidate({ inspector: () => { throw new Error("boom"); }, cases: battery });
  check("inspector that throws ⇒ counts as flagged (TP on defects, FP on cleans)", crash.confusion.TP === 2 && crash.confusion.FP === 2);

  // fail-closed: empty battery / no seeded defect / no inspector ⇒ INVALID (not a pass).
  check("empty battery ⇒ INVALID (nothing measured is not a pass)", MV.metaValidate({ inspector: () => "OK", cases: [] }).valid === false);
  check("defect-free battery ⇒ INVALID (unproven against a known defect)", MV.metaValidate({ inspector: () => "OK", cases: [{ id: "c", label: "CLEAN", input: "good", detects: (v: any) => v !== "OK" }] }).valid === false);
  check("no inspector ⇒ INVALID (fail-closed)", MV.metaValidate({ cases: battery }).valid === false);

  // minDetection: a partial detector (catches 1/2) with the default 1.0 threshold is INEFFECTIVE.
  const partial = MV.metaValidate({ inspector: (x: string) => x, cases: [
    { id: "d1", label: "DEFECTIVE", input: "FLAG", detects: (v: any) => v !== "OK" },
    { id: "d2", label: "DEFECTIVE", input: "OK", detects: (v: any) => v !== "OK" },
  ] });
  check("partial detector (1/2 defects) ⇒ INEFFECTIVE at default threshold 1.0", partial.effective === false && partial.detectionRate === 0.5);

  // metaValidateMany: weakest = lowest detection.
  const many = MV.metaValidateMany([
    { name: "good", inspector: (x: string) => (x === "bad" ? "F" : "OK"), cases: battery },
    { name: "bad", inspector: () => "OK", cases: battery },
  ]);
  check("metaValidateMany: allEffective=false, weakest='bad'", many.allEffective === false && many.weakest === "bad");

  check("contract: inspector is the system-under-test; false-negative = dangerous failure", /system-under-test/i.test(JSON.stringify(MV.INSPECTOR_META_VALIDATION_CONTRACT.invariants)));

  // artifact — the REAL canonical inspectors.
  let m: any = null; try { m = JSON.parse(fs.readFileSync(ART, "utf8")); } catch { /* null */ }
  check("artifact exists", !!m);
  if (m) {
    check("real inspectors ALL effective (100% seeded-defect detection, 0 false alarms)", m.realAllEffective === true && m.realInspectors.every((r: any) => r.detectionRate === 1 && r.falsePositiveRate === 0));
    check("evidence-qualifier + evaluator-independence both measured", m.realInspectors.some((r: any) => /evidence-qualifier/.test(r.name)) && m.realInspectors.some((r: any) => /evaluator-independence/.test(r.name)));
    check("meta-validator DISCRIMINATES: blind & trigger-happy controls both INEFFECTIVE", m.discriminates === true && m.controls.blindAlwaysPass.effective === false && m.controls.triggerHappyAlwaysFlag.effective === false);
    check("invariant: green suite that misses a known defect proves nothing", /proves nothing/i.test(m.invariant));
  }

  process.stdout.write(`\n${failures === 0 ? "ALL PASS — V85 inspector meta-validation (inspectors are the SUT; blind=INEFFECTIVE; real inspectors catch seeded defects; discriminates)" : failures + " FAIL"}\n`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
export {};
