#!/usr/bin/env node
/**
 * k-eval — V43: a SEALED, versioned K-category (software-assurance) evaluation. Runs the REAL assurance-pilot-runner
 * against a frozen corpus of SYNTHETIC repositories with documented seeded defects, scored by an INDEPENDENT evaluator
 * (area-set comparison vs a ground-truth manifest — NOT the pilot's own acceptance flag). Reuses capability-taxonomy's
 * computeVerifiedSuccessRate and evidence-provenance for stable case hashes.
 *
 * HONESTY (mandate): the corpus is SMALL and SYNTHETIC — it measures the pipeline on seeded K cases, NOT general IT
 * capability or real-client performance. Ground truth is kept separate from what the pilot sees. Positive + negative
 * controls + a misleading case guard against inflation. The before/after is measured on the SAME frozen cases via a
 * pipeline toggle (opts.detectUndeclaredAi) — the denominator never changes. Pure/deterministic.
 */
"use strict";

const RUNNER = require("./assurance-pilot-runner.js");
const PROV = require("./evidence-provenance.js");
const TAX = require("./capability-taxonomy.js");

const BENCHMARK_VERSION = "k-eval/1.0.0";

// Frozen corpus. `repo` is fed to the pilot; `expectedAreas` is GROUND TRUTH (evaluator-only). All SYNTHETIC.
const CORPUS: readonly any[] = Object.freeze([
  { id: "K1-clean", kind: "negative-control", repo: { project: "k1", dependencies: [{ name: "left-pad", version: "2.0.0", license: "MIT", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} }, expectedAreas: [], note: "clean repo — must produce NO findings" },
  { id: "K2-outdated", kind: "positive", repo: { project: "k2", dependencies: [{ name: "lodash", version: "4.0.0", license: "MIT", outdated: true }], tests: { total: 10, passing: 10 }, aiActivities: {} }, expectedAreas: ["dependency"], note: "outdated dependency" },
  { id: "K3-unknown-license", kind: "positive", repo: { project: "k3", dependencies: [{ name: "mystery", version: "1.0.0", license: "UNKNOWN", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} }, expectedAreas: ["license"], note: "unknown/non-permissive license" },
  { id: "K4-declared-ai", kind: "positive", repo: { project: "k4", dependencies: [{ name: "left-pad", version: "2.0.0", license: "MIT", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: { generatesSyntheticContent: true } }, expectedAreas: ["ai-act"], note: "declared synthetic-content AI — Art.50(2)" },
  { id: "K5-low-coverage", kind: "positive", repo: { project: "k5", dependencies: [{ name: "left-pad", version: "2.0.0", license: "MIT", outdated: false }], tests: { total: 10, passing: 5 }, aiActivities: {} }, expectedAreas: ["reliability"], note: "coverage below threshold" },
  { id: "K6-misleading", kind: "negative-control", repo: { project: "k6", dependencies: [{ name: "malware-scanner", version: "3.0.0", license: "MIT", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} }, expectedAreas: [], note: "scary NAME but clean — pilot must NOT flag on name" },
  { id: "K7-undeclared-ai-dep", kind: "positive", repo: { project: "k7", dependencies: [{ name: "openai", version: "4.0.0", license: "MIT", outdated: false }], tests: { total: 10, passing: 10 }, aiActivities: {} }, expectedAreas: ["ai-act"], note: "AI dependency present, NO declared activity — Art.50 applicability (undeclared-AI blind spot)" },
]);

function areaSet(findings: any[]): string[] { return [...new Set((findings || []).map((f: any) => f.area))].sort(); }
function setEq(a: string[], b: string[]): boolean { return a.length === b.length && a.every((x, i) => x === b[i]); }

/** evaluateCase(c, opts): run the REAL pilot, independently compare detected AREAS vs ground truth. */
function evaluateCase(c: any, opts: any = {}): any {
  const started = typeof opts.at === "string" ? opts.at : "";
  const r = RUNNER.runPilot(c.repo, { at: started, detectUndeclaredAi: opts.detectUndeclaredAi });
  if (!r.ok) return { id: c.id, status: "BLOCKED", verified: false, detail: r.code };
  const detected = areaSet(r.findings);
  const expected = [...c.expectedAreas].sort();
  const falsePositives = detected.filter((a) => !expected.includes(a));
  const falseNegatives = expected.filter((a) => !detected.includes(a));
  const verified = setEq(detected, expected);   // independent: area-set match vs ground truth, NOT pilot acceptance
  return { id: c.id, kind: c.kind, status: "RUN", expected, detected, falsePositives, falseNegatives, verified, repoHash: PROV.contentDigest(c.repo) };
}

/** evaluate(opts): run the whole sealed corpus; compute VERIFIED_SUCCESS_RATE via the frozen capability-taxonomy protocol. */
function evaluate(opts: any = {}): any {
  const perCase = CORPUS.map((c) => evaluateCase(c, opts));
  const results = perCase.map((pc) => ({ eligible: true, attempted: pc.status === "RUN", independentlyVerified: pc.verified === true, falseSuccess: false }));
  const rate = TAX.computeVerifiedSuccessRate(results);
  return { benchmarkVersion: BENCHMARK_VERSION, detectUndeclaredAi: opts.detectUndeclaredAi !== false, perCase, rate };
}

/** runBeforeAfter(opts): measure the SAME sealed corpus with the V43 fix OFF (baseline) and ON (after). */
function runBeforeAfter(opts: any = {}): any {
  const baseline = evaluate({ ...opts, detectUndeclaredAi: false });
  const after = evaluate({ ...opts, detectUndeclaredAi: true });
  const diffCases = CORPUS.map((c) => c.id).filter((id) => {
    const b = baseline.perCase.find((p: any) => p.id === id), a = after.perCase.find((p: any) => p.id === id);
    return b.verified !== a.verified;
  });
  return {
    benchmarkVersion: BENCHMARK_VERSION,
    corpusSize: CORPUS.length,
    baseline: baseline.rate, after: after.rate,
    improved: (after.rate.verifiedSuccessRate || 0) > (baseline.rate.verifiedSuccessRate || 0),
    changedCases: diffCases,
    note: "SAME sealed cases, denominator unchanged; only the pipeline toggle differs. SMALL SYNTHETIC corpus — measures seeded-K detection, NOT general IT capability or real-client performance.",
  };
}

/** corpusManifest(): the sealed ground-truth manifest (case ids, kinds, expected areas, stable repo hashes). */
function corpusManifest(): any {
  return { benchmarkVersion: BENCHMARK_VERSION, cases: CORPUS.map((c) => ({ id: c.id, kind: c.kind, expectedAreas: c.expectedAreas, repoHash: PROV.contentDigest(c.repo), note: c.note })), synthetic: true };
}

export { BENCHMARK_VERSION, CORPUS, evaluateCase, evaluate, runBeforeAfter, corpusManifest };
module.exports = { BENCHMARK_VERSION, CORPUS, evaluateCase, evaluate, runBeforeAfter, corpusManifest };

if (require.main === module) {
  process.stdout.write(JSON.stringify(runBeforeAfter(), null, 2) + "\n");
}
