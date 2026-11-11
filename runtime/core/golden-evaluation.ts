#!/usr/bin/env node
"use strict";

/*
 * golden-evaluation (mission M2, Phase 5) — PURE, deterministic Golden Evaluation Set harness with SHADOW MODE and
 * REGRESSION DETECTION. It composes benchmark-baseline (B1) for scoring + the reproducibility digest — no scoring/digest
 * logic is duplicated. It stamps provenance (system/version/metric/digest) on every evaluation. No I/O, no clock, no
 * network, no randomness.
 *
 *  - evaluate(goldenSet, solver, opts)          → { result (B1 baseline), provenance }  — score a candidate on the set.
 *  - shadowCompare(goldenSet, candidate, reference, opts) → SHADOW MODE: run BOTH on the set WITHOUT acting on the
 *      candidate's outputs; report per-case agreement + divergences + where the candidate regresses vs the reference.
 *      `acted:false` is structural — shadow mode never applies the candidate's decision.
 *  - detectRegression(current, baseline)        → { verdict: REGRESSION|STABLE|IMPROVEMENT, regressed[], improved[], ... }
 *      comparing per-case pass vectors (ids that went pass→fail are regressions).
 * A golden case MUST carry an `expected`; a set with a case missing `expected` is rejected (fail-closed).
 */

const BB = require("./benchmark-baseline.js");

function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
function validSet(set: any): boolean { return Array.isArray(set) && set.every((c) => c && isStr(c.id) && Object.prototype.hasOwnProperty.call(c, "expected")); }
function passMap(result: any): Record<string, boolean> { const m: Record<string, boolean> = {}; (result.perCase || []).forEach((p: any) => { m[p.id] = !!p.pass; }); return m; }

function evaluate(goldenSet: any, solver: any, opts?: any): any {
  if (!validSet(goldenSet)) return Object.freeze({ fatal: "INVALID_GOLDEN_SET", provenance: Object.freeze({}) });
  const result = BB.runBaseline(goldenSet, solver, opts);
  const o = opts && typeof opts === "object" ? opts : {};
  const provenance = Object.freeze({ system: (o.meta && o.meta.system) || "unspecified", version: (o.meta && o.meta.version != null) ? String(o.meta.version) : "unspecified", metric: result.meta ? result.meta.metric : "exact-match pass rate", digest: result.digest, cases: result.total, externalComparison: "NOT_MEASURED" });
  return Object.freeze({ result, provenance });
}

function shadowCompare(goldenSet: any, candidate: any, reference: any, opts?: any): any {
  if (!validSet(goldenSet)) return Object.freeze({ fatal: "INVALID_GOLDEN_SET", acted: false });
  if (typeof candidate !== "function" || typeof reference !== "function") return Object.freeze({ fatal: "INVALID_SOLVER", acted: false });
  const o = opts && typeof opts === "object" ? opts : {};
  const match = typeof o.match === "function" ? o.match : BB.deepEq;
  const perCase = goldenSet.slice().sort((a: any, b: any) => String(a.id).localeCompare(String(b.id))).map((c: any) => {
    let candOut: any, refOut: any, candErr: string | undefined, refErr: string | undefined;
    try { candOut = candidate(c.input); } catch (e: any) { candErr = String((e && e.message) || e); }
    try { refOut = reference(c.input); } catch (e: any) { refErr = String((e && e.message) || e); }
    const candPass = !candErr && !!match(candOut, c.expected);
    const refPass = !refErr && !!match(refOut, c.expected);
    const agree = !candErr && !refErr && !!match(candOut, refOut);
    return Object.freeze({ id: c.id, candidatePass: candPass, referencePass: refPass, agree, candidateError: candErr, referenceError: refErr });
  });
  const n = perCase.length || 1;
  const divergences = perCase.filter((p: any) => !p.agree).map((p: any) => p.id);
  const regressionsVsReference = perCase.filter((p: any) => p.referencePass && !p.candidatePass).map((p: any) => p.id);
  const improvementsVsReference = perCase.filter((p: any) => !p.referencePass && p.candidatePass).map((p: any) => p.id);
  return Object.freeze({
    acted: false,                                        // SHADOW: candidate outputs are observed, never applied
    perCase: Object.freeze(perCase),
    agreementRate: Math.round((perCase.filter((p: any) => p.agree).length / n) * 10000) / 10000,
    candidatePassRate: Math.round((perCase.filter((p: any) => p.candidatePass).length / n) * 10000) / 10000,
    referencePassRate: Math.round((perCase.filter((p: any) => p.referencePass).length / n) * 10000) / 10000,
    divergences: Object.freeze(divergences),
    regressionsVsReference: Object.freeze(regressionsVsReference),
    improvementsVsReference: Object.freeze(improvementsVsReference),
    safeToPromote: perCase.length > 0 && regressionsVsReference.length === 0 && perCase.every((p: any) => !p.candidateError),
  });
}

function detectRegression(current: any, baseline: any): any {
  if (!current || !baseline || !Array.isArray(current.perCase) || !Array.isArray(baseline.perCase)) return Object.freeze({ verdict: "INDETERMINATE", reason: "missing perCase" });
  const cur = passMap(current), base = passMap(baseline);
  const ids = Array.from(new Set(Object.keys(cur).concat(Object.keys(base)))).sort();
  const regressed = ids.filter((id) => base[id] === true && cur[id] !== true);
  const improved = ids.filter((id) => base[id] !== true && cur[id] === true);
  const newCases = ids.filter((id) => !(id in base));
  const droppedCases = ids.filter((id) => !(id in cur));
  const passRateDelta = Math.round(((current.passRate || 0) - (baseline.passRate || 0)) * 10000) / 10000;
  const verdict = regressed.length > 0 ? "REGRESSION" : (improved.length > 0 ? "IMPROVEMENT" : "STABLE");
  return Object.freeze({ verdict, regressed: Object.freeze(regressed), improved: Object.freeze(improved), newCases: Object.freeze(newCases), droppedCases: Object.freeze(droppedCases), passRateDelta, sameDigest: !!current.digest && current.digest === baseline.digest });
}

module.exports = { evaluate, shadowCompare, detectRegression, validSet };
export {};
