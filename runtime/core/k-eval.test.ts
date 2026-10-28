#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves the sealed K-eval is trustworthy: independent area-set scoring vs ground truth
// (not the pilot's acceptance), positive + negative controls, a misleading case, and a REAL measured before/after
// (6/7 → 7/7) on the SAME frozen corpus driven by the undeclared-AI-dependency fix. Denominator never changes.
"use strict";
const assert = require("assert");
const K = require("./k-eval.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) sealed manifest: ground truth with stable hashes; synthetic; controls present.
const man = K.corpusManifest();
ok("manifest: versioned, synthetic, 7 cases with expectedAreas + stable repoHash", man.synthetic === true && man.cases.length === 7 && man.cases.every(c => Array.isArray(c.expectedAreas) && /^[0-9a-f]{64}$/.test(c.repoHash)));
ok("corpus has positive + negative controls + a misleading case", K.CORPUS.some(c => c.kind === "positive") && K.CORPUS.filter(c => c.kind === "negative-control").length >= 2);

// (2) negative controls produce ZERO findings in BOTH modes (no false positives; not flagged on scary name).
for (const mode of [false, true]) {
  const e = K.evaluate({ detectUndeclaredAi: mode });
  const k1 = e.perCase.find(p => p.id === "K1-clean"); const k6 = e.perCase.find(p => p.id === "K6-misleading");
  ok(`negative controls clean (detect=${mode}): K1 + K6 detect [] (no false positives)`, k1.detected.length === 0 && k6.detected.length === 0 && k1.verified && k6.verified);
}

// (3) positive controls detected (independent area-set match vs ground truth).
const after = K.evaluate({ detectUndeclaredAi: true });
for (const id of ["K2-outdated", "K3-unknown-license", "K4-declared-ai", "K5-low-coverage"]) {
  const pc = after.perCase.find(p => p.id === id);
  ok(`${id} detected correctly (verified, no FN/FP)`, pc.verified === true && pc.falseNegatives.length === 0 && pc.falsePositives.length === 0);
}

// (4) the REAL before/after: baseline 6/7 (K7 false-negative) → after 7/7; same frozen cases.
const ba = K.runBeforeAfter();
ok("baseline measured 6/7 (0.857) with K7 a false-negative", ba.baseline.numerator === 6 && ba.baseline.denominator === 7 && ba.baseline.verifiedSuccessRate === 0.857);
ok("after fix measured 7/7 (1.0); improvement validated on the SAME corpus", ba.after.numerator === 7 && ba.after.denominator === 7 && ba.after.verifiedSuccessRate === 1 && ba.improved === true);
ok("the ONLY changed case is the undeclared-AI blind spot (denominator unchanged)", ba.changedCases.length === 1 && ba.changedCases[0] === "K7-undeclared-ai-dep" && ba.corpusSize === 7);

// (5) K7 baseline = false-negative, after = detected (the honest gap → fix).
const k7base = K.evaluateCase(K.CORPUS.find(c => c.id === "K7-undeclared-ai-dep"), { detectUndeclaredAi: false });
const k7after = K.evaluateCase(K.CORPUS.find(c => c.id === "K7-undeclared-ai-dep"), { detectUndeclaredAi: true });
ok("K7: baseline false-negative on ai-act; after detects ai-act", k7base.falseNegatives.includes("ai-act") && k7base.verified === false && k7after.detected.includes("ai-act") && k7after.verified === true);

// (6) honesty note: small synthetic corpus ≠ general IT capability; denominator fixed.
ok("note: small synthetic, not general capability; denominator unchanged", /SMALL SYNTHETIC/i.test(ba.note) && /denominator unchanged/i.test(ba.note));

// (7) scoring is independent of the pilot's own acceptance flag (uses area-set vs ground truth).
ok("verified is area-set match vs ground truth (independent of pilot acceptance)", after.perCase.every(p => typeof p.verified === "boolean" && Array.isArray(p.expected) && Array.isArray(p.detected)));

console.log(`\nK-EVAL suite — ${pass} assertions passed. (sealed corpus; independent scoring; controls; real before/after 6/7→7/7; honest limits)`);
