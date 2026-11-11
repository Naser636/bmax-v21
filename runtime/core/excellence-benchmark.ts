#!/usr/bin/env node
"use strict";
/* V139 §3 — GLOBAL EXCELLENCE BENCHMARK (evidence-based comparative assessment). PURE, deterministic, fail-closed, and
 * ANTI-FABRICATION: it compares each métier's reproducible ODG baseline (the V137 VALIDATED_LOCAL maturity) against world-
 * class REFERENCES, but a reference is admitted ONLY if it carries a real {source(url), date, nature}; a métier with no
 * researched reference is honestly ASSESSED=false / NOT_YET_RESEARCHED (NEVER a fabricated ranking). It invents no score, no
 * ranking, and no relevance — relevance must be asserted with a cited reference. Establishes the comparative baseline BEFORE
 * any improvement claim. Reuses the métier-qualification maturity vocabulary; no new primitive/registry. */
function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function isStr(v: any): boolean { return typeof v === "string" && v.trim().length > 0; }
// A REAL calendar date (not just the shape): YYYY-MM-DD with month 01-12, day in-range, AND round-trips through Date (so an
// impossible date like 2099-99-99 / 2026-13-99 / 2026-02-30 is REJECTED — a citation-shaped fabrication cannot pass as real).
function isRealIsoDate(s: any): boolean {
  if (typeof s !== "string") return false;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;   // reject rolled-over dates
}
// a reference is REAL only with a cited source url + a REAL ISO date + a nature (STANDARD/GUIDELINE/PAPER/...). Anything else ⇒ rejected.
function admitReference(r: any): any {
  if (!isObj(r) || !isStr(r.source) || !/^https?:\/\//.test(r.source) || !isRealIsoDate(String(r.date)) || !isStr(r.nature) || !isStr(r.capability)) return null;
  return Object.freeze({ source: r.source, date: r.date, nature: r.nature, authority: isStr(r.authority) ? r.authority : "(unspecified)", capability: r.capability, confidence: isStr(r.confidence) ? r.confidence : "MEDIUM" });
}

/** assessMetier(metier, odgBaseline, references) -> frozen comparative assessment. odgBaseline = the V137 maturity string.
 * references = candidate world-class references (each must be real to be admitted). gap is stated ONLY against an admitted
 * reference; with no admitted reference the métier is NOT_YET_RESEARCHED (honest, not a fabricated comparison). */
function assessMetier(metier: any, odgBaseline: any, references: any): any {
  const refs = (Array.isArray(references) ? references : []).map(admitReference).filter(Boolean);
  const assessed = refs.length > 0;
  return Object.freeze({
    metier: isStr(metier) ? metier : (isObj(metier) ? metier.metier : "(unnamed)"),
    odgBaseline: isStr(odgBaseline) ? odgBaseline : "UNKNOWN",
    references: Object.freeze(refs),
    assessed,
    status: assessed ? "BENCHMARKED" : "NOT_YET_RESEARCHED",
    // an improvement opportunity is only declared where a real reference documents a capability to compare against.
    opportunities: Object.freeze(refs.map((r: any) => `compare ODG(${isStr(odgBaseline) ? odgBaseline : "?"}) vs ${r.authority} ${r.nature}: ${r.capability}`)),
    note: assessed ? "comparative baseline established from cited reference(s)" : "no researched reference yet — honestly NOT_YET_RESEARCHED (next radar cycle); no fabricated ranking",
  });
}

/** buildBenchmark(baselines, referencesByMetier) -> frozen matrix + honest coverage summary. */
function buildBenchmark(baselines: any, referencesByMetier: any): any {
  const base = isObj(baselines) ? baselines : {};
  const refsBy = isObj(referencesByMetier) ? referencesByMetier : {};
  const metiers = Object.keys(base).sort();
  const matrix = metiers.map((m) => assessMetier(m, base[m], refsBy[m]));
  const benchmarked = matrix.filter((a) => a.assessed).length;
  return Object.freeze({
    matrix: Object.freeze(matrix),
    coverage: Object.freeze({ metiers: metiers.length, benchmarked, notYetResearched: metiers.length - benchmarked, realReferences: matrix.reduce((n, a) => n + a.references.length, 0) }),
    honesty: "ODG baseline = reproducible V137 VALIDATED_LOCAL maturity (not production). Only cited, dated references are admitted; métiers without a researched reference are NOT_YET_RESEARCHED — NO fabricated ranking, relevance, or score. Benchmark established BEFORE any improvement claim.",
  });
}

const EXCELLENCE_BENCHMARK_CONTRACT = Object.freeze({ id: "V139-EXCELLENCE-BENCHMARK", invariants: Object.freeze(["a reference is admitted only with a real source url + ISO date + nature + capability", "no researched reference ⇒ NOT_YET_RESEARCHED (never a fabricated comparison)", "invents no score/ranking/relevance; relevance requires a cited reference", "ODG baseline is the reproducible V137 maturity (VALIDATED_LOCAL ≠ production)"]) });
module.exports = { admitReference, assessMetier, buildBenchmark, EXCELLENCE_BENCHMARK_CONTRACT };
export {};
