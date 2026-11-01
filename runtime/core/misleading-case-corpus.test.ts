#!/usr/bin/env node
// @ts-nocheck — runs under tsx. Proves misleading-case-corpus (G-07): a sealed synthetic adversarial corpus
// (misleading + negative-control, k-eval repo shape) + an evaluator-agnostic false-success-resistance scorer.
// Honest: a PERFECT oracle ⇒ falseSuccessRate 0; a NAME-fooled evaluator ⇒ falseSuccessRate > 0 flagging the
// name-trap negative-controls; a HEAD-only evaluator ⇒ fooled by hidden-issue misleading cases. Measures
// RESISTANCE on synthetic cases, never general capability. Additive; pure.
"use strict";
const assert = require("assert");
const M = require("./misleading-case-corpus.js");
let pass = 0; const ok = (n, c) => { assert.ok(c, n); console.log("  ok -", n); pass++; };

// (1) corpus shape + adversarial ratio.
{
  ok("CORPUS is a non-empty frozen array (k-eval shape)", Array.isArray(M.CORPUS) && M.CORPUS.length >= 8 && Object.isFrozen(M.CORPUS));
  const r = M.ratio();
  ok("every case is misleading or negative-control ⇒ adversarialRatio 1.0", r.adversarial === r.total && r.adversarialRatio === 1 && r.misleading > 0 && r.negativeControl > 0);
}

// (2) a PERFECT oracle (detected == ground-truth expectedAreas) ⇒ falseSuccessRate 0 (resists all).
{
  const oracle = (c) => ({ detected: [...c.expectedAreas] });
  const res = M.scoreResistance(oracle);
  ok("perfect oracle ⇒ falseSuccessRate 0, fooled 0", res.ok && res.falseSuccessRate === 0 && res.fooled === 0 && /RESISTANCE/.test(res.note));
}

// (3) a NAME-fooled evaluator (flags 'dependency' on scary names) ⇒ fooled on the name-trap negative-controls.
{
  const nameFooled = (c) => { const bad = c.repo.dependencies.some((d) => /backdoor|malware/.test(d.name)); return { detected: bad ? ["dependency"] : [...c.expectedAreas] }; };
  const res = M.scoreResistance(nameFooled);
  ok("name-fooled ⇒ falseSuccessRate > 0", res.falseSuccessRate > 0 && res.fooled >= 2);
  ok("the fooled cases are the scary-name negative-controls (false positive: detected dependency, expected [])",
     res.fooledCases.every((f) => f.kind === "negative-control" && f.detected.includes("dependency") && f.expected.length === 0) &&
     res.fooledCases.some((f) => f.id === "M1-scary-name-clean"));
}

// (4) a HEAD-ONLY evaluator (only inspects the first dependency) ⇒ fooled by hidden-issue misleading cases.
{
  const headOnly = (c) => {
    const d0 = c.repo.dependencies[0];
    const det = [];
    if (d0 && d0.license === "UNKNOWN") det.push("license");
    if (d0 && d0.outdated) det.push("dependency");
    // (ignores reliability + ai-act + hidden tail) — deliberately shallow
    return { detected: det };
  };
  const res = M.scoreResistance(headOnly);
  ok("head-only ⇒ fooled by hidden-tail misleading cases (M3 license, M4 outdated) as false negatives",
     res.fooledCases.some((f) => f.id === "M3-hidden-unknown-license" && f.detected.length === 0) &&
     res.fooledCases.some((f) => f.id === "M4-hidden-outdated" && f.detected.length === 0));
}

// (5) scorer is fail-closed on a bad evaluator + resilient to an evaluator that throws.
{
  ok("no evaluator ⇒ NO_EVALUATOR", M.scoreResistance(null).code === "NO_EVALUATOR");
  const thrower = () => { throw new Error("boom"); };
  const res = M.scoreResistance(thrower);
  ok("throwing evaluator ⇒ counted as fooled (detected __EVALUATOR_THREW__), never crashes the scorer",
     res.ok && res.fooled === M.CORPUS.length && res.per.every((p) => p.detected.includes("__EVALUATOR_THREW__")));
}

// (6) manifest seals each case with a stable repo hash; synthetic flagged.
{
  const man = M.corpusManifest();
  ok("manifest: synthetic, per-case repoHash present, ratio echoed", man.synthetic === true && man.cases.length === M.CORPUS.length && man.cases.every((c) => typeof c.repoHash === "string" && c.repoHash.length === 64) && man.ratio.adversarialRatio === 1);
}

// (7) seal integrity (validator-flagged): the corpus is DEEP-frozen — a nested repo field cannot be mutated
// (so a caller cannot shift a repoHash). Under "use strict", writing a frozen nested prop throws.
{
  ok("nested repo field is frozen (deep-freeze seal)", Object.isFrozen(M.CORPUS[0].repo) && Object.isFrozen(M.CORPUS[0].repo.tests));
  ok("mutating a nested frozen field throws (seal holds)", (() => { try { M.CORPUS[0].repo.tests.total = 999; return false; } catch { return true; } })());
  const h1 = M.corpusManifest().cases[0].repoHash;
  const h2 = M.corpusManifest().cases[0].repoHash;
  ok("repoHash stable across calls (unmutated seal)", h1 === h2 && /^[0-9a-f]{64}$/.test(h1));
}

console.log(`\nmisleading-case-corpus: ${pass} assertions passed`);
