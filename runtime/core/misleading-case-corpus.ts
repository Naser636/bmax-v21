#!/usr/bin/env node
/**
 * misleading-case-corpus — an ADDITIVE, sealed, synthetic corpus of adversarial MISLEADING cases and
 * NEGATIVE CONTROLS (Hendrickson/Bach experiment-design) plus an evaluator-agnostic false-success-resistance
 * scorer. Grows the misleading / negative-control ratio available to harden false-success resistance without
 * touching k-eval's own sealed CORPUS (CAPABILITY_GAP_REGISTER_V1.md G-07, P3; D02/D05).
 *
 * Cases use the SAME repo shape as k-eval so an injected evaluator (default: k-eval.evaluateCase) can score
 * them. Each case carries GROUND TRUTH `expectedAreas` (evaluator-only). The "traps":
 *   - NAME traps: a scary-named but clean dependency — an evaluator fooled by the NAME produces a false
 *     positive (expectedAreas []).
 *   - HIDDEN-issue traps: a repo that looks clean but hides a real issue among benign entries — an evaluator
 *     fooled by only checking the head produces a false NEGATIVE.
 *   - ILLUSION traps: superficially-reassuring signals (e.g. 100% pass rate over a trivially tiny test total).
 *
 * HONESTY: the corpus is SYNTHETIC and sealed (contentDigest). The headline metric is false-SUCCESS RATE —
 * the fraction of misleading/negative-control cases where the evaluator's detected-area set does NOT equal the
 * ground truth (i.e. it was FOOLED). Target 0. It measures the evaluator's RESISTANCE, never general
 * capability, and never fabricates a score. Evaluator-agnostic (injected), so it does not couple to any one
 * harness's thresholds.
 *
 * PURE (no fs/net/clock). ADDITIVE (modifies no other module). NO new primitive. Dual export (ESM + CJS).
 */
"use strict";

const PROV: any = require("./evidence-provenance.js");

const SCHEMA = "odg.misleading-case-corpus.v1";

// Sealed synthetic adversarial corpus (k-eval repo shape). kind ∈ {misleading, negative-control}.
const CORPUS: readonly any[] = Object.freeze([
  { id: "M1-scary-name-clean", kind: "negative-control", repo: { project: "m1", dependencies: [{ name: "backdoor-utils", version: "2.0.0", license: "MIT", outdated: false }], tests: { total: 20, passing: 20 }, aiActivities: {} }, expectedAreas: [], note: "scary NAME but MIT+current — an evaluator must NOT flag on the name" },
  { id: "M2-malware-named-clean", kind: "negative-control", repo: { project: "m2", dependencies: [{ name: "malware-scanner", version: "3.0.0", license: "Apache-2.0", outdated: false }], tests: { total: 15, passing: 15 }, aiActivities: {} }, expectedAreas: [], note: "security-sounding name, clean — name is not evidence" },
  { id: "M3-hidden-unknown-license", kind: "misleading", repo: { project: "m3", dependencies: [{ name: "left-pad", version: "2.0.0", license: "MIT", outdated: false }, { name: "ok-dep", version: "1.0.0", license: "MIT", outdated: false }, { name: "mystery", version: "1.0.0", license: "UNKNOWN", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} }, expectedAreas: ["license"], note: "two benign deps THEN an UNKNOWN-license dep — an evaluator that only checks the head is fooled (false negative)" },
  { id: "M4-hidden-outdated", kind: "misleading", repo: { project: "m4", dependencies: [{ name: "a", version: "1", license: "MIT", outdated: false }, { name: "b", version: "1", license: "MIT", outdated: false }, { name: "c", version: "1", license: "MIT", outdated: true }], tests: { total: 10, passing: 10 }, aiActivities: {} }, expectedAreas: ["dependency"], note: "outdated dep hidden at the tail" },
  { id: "M5-tiny-total-100pct", kind: "misleading", repo: { project: "m5", dependencies: [{ name: "left-pad", version: "2.0.0", license: "MIT", outdated: false }], tests: { total: 2, passing: 2 }, aiActivities: {} }, expectedAreas: ["reliability"], note: "100% pass rate but a trivially tiny total — a pass-RATE-only evaluator is fooled into 'clean'" },
  { id: "M6-high-coverage-clean", kind: "negative-control", repo: { project: "m6", dependencies: [{ name: "left-pad", version: "2.0.0", license: "MIT", outdated: false }], tests: { total: 200, passing: 200 }, aiActivities: {} }, expectedAreas: [], note: "genuinely clean with strong coverage — must produce NO findings (no false positive)" },
  { id: "M7-undeclared-ai-dep", kind: "misleading", repo: { project: "m7", dependencies: [{ name: "openai", version: "4.0.0", license: "MIT", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} }, expectedAreas: ["ai-act"], note: "AI dependency present with NO declared activity — the undeclared-AI blind spot" },
  { id: "M8-permissive-looking-ok", kind: "negative-control", repo: { project: "m8", dependencies: [{ name: "dual", version: "1.0.0", license: "MIT OR Apache-2.0", outdated: false }], tests: { total: 12, passing: 12 }, aiActivities: {} }, expectedAreas: [], note: "dual permissive license — clean; must NOT be flagged as unknown" },
]);

function setEq(a: string[], b: string[]): boolean { if (a.length !== b.length) return false; const s = new Set(a); return b.every((x) => s.has(x)); }

// ratio of misleading + negative-control cases (the hardening coverage figure).
function ratio(corpus: readonly any[] = CORPUS): any {
  const total = corpus.length;
  const misleading = corpus.filter((c) => c.kind === "misleading").length;
  const negativeControl = corpus.filter((c) => c.kind === "negative-control").length;
  return { total, misleading, negativeControl, adversarial: misleading + negativeControl, adversarialRatio: total > 0 ? Number(((misleading + negativeControl) / total).toFixed(3)) : null };
}

// Score an injected evaluator's false-success RESISTANCE over the corpus.
// evaluateFn(caseObj) MUST return { detected: string[] } (areas it flagged). A case is "fooled" when the
// detected-area set does not equal the ground-truth expectedAreas. falseSuccessRate = fooled / total. Target 0.
function scoreResistance(evaluateFn: any, corpus: readonly any[] = CORPUS): any {
  if (typeof evaluateFn !== "function") return { ok: false, code: "NO_EVALUATOR", reason: "an evaluateFn(case) => {detected:string[]} is required" };
  const per: any[] = [];
  const fooled: any[] = [];
  for (const c of corpus) {
    let detected: string[] = [];
    try { const r = evaluateFn(c); detected = Array.isArray(r && r.detected) ? r.detected.slice() : []; }
    catch (e: any) { detected = ["__EVALUATOR_THREW__"]; }
    const expected = [...c.expectedAreas];
    const resisted = setEq(detected, expected);
    if (!resisted) fooled.push({ id: c.id, kind: c.kind, expected, detected });
    per.push({ id: c.id, kind: c.kind, expected, detected, resisted });
  }
  const total = corpus.length;
  return {
    ok: true,
    schema: SCHEMA,
    total,
    fooled: fooled.length,
    falseSuccessRate: total > 0 ? Number((fooled.length / total).toFixed(3)) : null,
    fooledCases: fooled,
    per,
    note: fooled.length === 0
      ? "Evaluator resisted every misleading case / negative control (false-success rate 0 on this synthetic corpus). This measures RESISTANCE on sealed synthetic cases, NOT general capability."
      : `Evaluator was FOOLED on ${fooled.length}/${total} adversarial cases (false-success rate > 0). See fooledCases.`,
  };
}

// Sealed ground-truth manifest (ids/kinds/expected/stable repo hashes) — synthetic.
function corpusManifest(): any {
  return { schema: SCHEMA, synthetic: true, ratio: ratio(), cases: CORPUS.map((c) => ({ id: c.id, kind: c.kind, expectedAreas: c.expectedAreas, repoHash: PROV.contentDigest(c.repo), note: c.note })) };
}

export { CORPUS, ratio, scoreResistance, corpusManifest, setEq, SCHEMA };
module.exports = { CORPUS, ratio, scoreResistance, corpusManifest, setEq, SCHEMA };

if (require.main === module) {
  const K = require("./k-eval.js");
  // wire the real k-eval evaluator: evaluateCase returns { detected }
  const res = scoreResistance((c: any) => K.evaluateCase(c, {}));
  process.stdout.write(JSON.stringify({ adversarialRatio: ratio().adversarialRatio, falseSuccessRate: res.falseSuccessRate, fooled: res.fooled }, null, 2) + "\n");
}
