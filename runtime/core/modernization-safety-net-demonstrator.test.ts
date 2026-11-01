// @ts-nocheck
// modernization-safety-net-demonstrator — capture→compare→charter composition. Preserved behavior ⇒ ACCEPT
// chartered; a changed output ⇒ BEHAVIOR_CHANGED (REJECT); a coverage gap ⇒ INCOMPLETE (not a pass); a tampered
// baseline ⇒ fail-closed; behavioral-not-correctness honesty; bad input fails closed; determinism holds.
"use strict";
const assert = require("assert");
const D = require("./modernization-safety-net-demonstrator.js");

let n = 0; const ok = (name, cond) => { n++; assert.ok(cond, name); };
const base = [{ input: "a", observedOutput: "1" }, { input: "b", observedOutput: "2" }];

// (1) behavior PRESERVED ⇒ MODERNIZATION_CHECKED, behavioralVerdict BEHAVIOR_PRESERVED, chartered, no gaps.
(() => {
  const r = D.runModernizationCheck({ target: "legacy.ts", baselineSamples: base, newSamples: base });
  ok("preserved: verdict CHECKED", r.ok && r.verdict === D.VERDICT.CHECKED);
  ok("preserved: BEHAVIOR_PRESERVED + preserved true", r.summary.behavioralVerdict === "BEHAVIOR_PRESERVED" && r.summary.preserved === true);
  ok("preserved: chartered true", r.summary.chartered === true);
  ok("preserved: zero gaps", r.summary.gapCount === 0);
})();

// (2) behavior CHANGED ⇒ BEHAVIOR_CHANGED, not preserved, gap reported.
(() => {
  const r = D.runModernizationCheck({ target: "legacy.ts", baselineSamples: base, newSamples: [{ input: "a", observedOutput: "1" }, { input: "b", observedOutput: "DIFFERENT" }] });
  ok("changed: BEHAVIOR_CHANGED, preserved false", r.summary.behavioralVerdict === "BEHAVIOR_CHANGED" && r.summary.preserved === false);
  ok("changed: a change gap is reported", r.gaps.some((g) => /behavior CHANGED/i.test(g)));
})();

// (3) coverage gap (a baseline input not re-sampled) ⇒ INCOMPLETE (NOT a pass).
(() => {
  const r = D.runModernizationCheck({ target: "legacy.ts", baselineSamples: base, newSamples: [{ input: "a", observedOutput: "1" }] });
  ok("gap: INCOMPLETE, not preserved", r.summary.behavioralVerdict === "INCOMPLETE" && r.summary.preserved === false);
  ok("gap: coverage gap reported", r.gaps.some((g) => /coverage gap/i.test(g)));
})();

// (4) KEYED SEAL (happy path): a consistent HMAC key seals + re-verifies the baseline in-process ⇒ still
//     PRESERVED + chartered. (The BASELINE_TAMPERED / wrong-key fail-closed path is unit-tested in
//     characterization-baseline's own suite; the demonstrator captures its baseline internally so a tamper
//     cannot be injected through this entry point — not claimed here.)
(() => {
  const r = D.runModernizationCheck({ target: "legacy.ts", baselineSamples: base, newSamples: base, key: "k1" });
  ok("keyed: still preserved + chartered under a consistent key", r.summary.preserved === true && r.summary.chartered === true);
})();

// (5) no baseline samples ⇒ INCOMPLETE (no safety net), captured false.
(() => {
  const r = D.runModernizationCheck({ target: "legacy.ts", baselineSamples: [], newSamples: base });
  ok("no-baseline: verdict INCOMPLETE, captured false", r.verdict === D.VERDICT.INCOMPLETE && r.summary.captured === false);
})();

// (6) HONESTY: basis is BEHAVIORAL_NOT_CORRECTNESS; note disclaims correctness-oracle.
(() => {
  const r = D.runModernizationCheck({ target: "legacy.ts", baselineSamples: base, newSamples: base });
  ok("honesty: basis BEHAVIORAL_NOT_CORRECTNESS", r.basis === "BEHAVIORAL_NOT_CORRECTNESS");
  ok("honesty: note disclaims correctness oracle", /not a correctness oracle/i.test(r.note));
})();

// (7) grounded only when a ground-truth source is supplied.
(() => {
  const r = D.runModernizationCheck({ target: "legacy.ts", baselineSamples: base, newSamples: base, groundTruth: { source: "golden-suite", independent: true } });
  ok("grounded: true when a source is supplied", r.summary.grounded === true);
  const r2 = D.runModernizationCheck({ target: "legacy.ts", baselineSamples: base, newSamples: base });
  ok("grounded: false when no source (honest, not a pass)", r2.summary.grounded === false);
})();

// (8) FAIL-CLOSED input + determinism.
(() => {
  ok("bad-input null ⇒ INVALID_INPUT", D.runModernizationCheck(null).code === "INVALID_INPUT");
  const a = D.runModernizationCheck({ target: "t", baselineSamples: base, newSamples: base });
  const b = D.runModernizationCheck({ target: "t", baselineSamples: base, newSamples: base });
  ok("determinism: identical sealed baseline across runs", JSON.stringify(a.steps.capture.baseline) === JSON.stringify(b.steps.capture.baseline));
})();

console.log(`modernization-safety-net-demonstrator: ${n} checks passed`);
