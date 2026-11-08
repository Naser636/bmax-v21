#!/usr/bin/env node
"use strict";

/*
 * SÉRIE 14 (P4 excellence) — DISTRIBUTION DRIFT (Population Stability Index). PURE, deterministic. World reference:
 * data/feature drift is the dominant silent failure of data+ML pipelines; the industry-standard detector is the
 * Population Stability Index (PSI) over binned distributions — PSI < 0.1 no drift, 0.1–0.25 moderate, > 0.25
 * significant (standard FinOps/credit-risk/ML-monitoring thresholds). ODG's P4 reference checked quality (nulls/
 * types/ranges/dups) + lineage + schema-compat but had NO distributional-drift detector. This adds PSI, fail-closed
 * (unseen categories / empty reference ⇒ treated as drift, never silently ignored). Complements P4; no new engine.
 * Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }
function round(n: number): number { return Number(n.toFixed(4)); }

/** binCounts(values, bins) -> { bin: count } for categorical or pre-binned values. */
function counts(values: any): Record<string, number> {
  const c: Record<string, number> = {};
  for (const v of arr(values)) { const k = String(v); c[k] = (c[k] || 0) + 1; }
  return c;
}

/** psi(reference, current) -> { psi, drift, perBin }. Fail-closed: a bin present in current but absent in reference
 * (new/unseen category) contributes a capped large term so drift is never hidden; empty reference ⇒ DRIFT. */
function psi(reference: any, current: any): any {
  const refC = counts(reference); const curC = counts(current);
  const refN = Object.values(refC).reduce((a, b) => a + b, 0);
  const curN = Object.values(curC).reduce((a, b) => a + b, 0);
  if (refN === 0 || curN === 0) return Object.freeze({ psi: Infinity, drift: "SIGNIFICANT", bins: 0, note: "empty reference or current ⇒ fail-closed SIGNIFICANT drift" });
  const bins = new Set([...Object.keys(refC), ...Object.keys(curC)]);
  const eps = 1e-6; let total = 0; const perBin: any[] = [];
  for (const b of bins) {
    const r = (refC[b] || 0) / refN; const k = (curC[b] || 0) / curN;
    const rr = Math.max(r, eps); const kk = Math.max(k, eps);   // smoothing so unseen bins contribute (never log(0))
    const term = (kk - rr) * Math.log(kk / rr);
    total += term; perBin.push({ bin: b, ref: round(r), cur: round(k), term: round(term), unseenInRef: !(b in refC) });
  }
  const val = round(total);
  const drift = val > 0.25 ? "SIGNIFICANT" : (val >= 0.1 ? "MODERATE" : "NONE");
  return Object.freeze({ psi: val, drift, bins: bins.size, perBin: Object.freeze(perBin), note: "PSI<0.1 none, 0.1–0.25 moderate, >0.25 significant; unseen categories contribute (fail-closed)" });
}

/** assessDrift(reference, current, opts) -> adds a pass/fail gate. Fail-closed: SIGNIFICANT ⇒ not acceptable. */
function assessDrift(reference: any, current: any, opts?: any): any {
  const o = isObj(opts) ? opts : {};
  const r = psi(reference, current);
  const maxDrift = isObj(o) && o.allowModerate === true ? "MODERATE" : "NONE";
  const acceptable = r.drift === "NONE" || (maxDrift === "MODERATE" && r.drift !== "SIGNIFICANT");
  return Object.freeze({ ...r, acceptable, gate: acceptable ? "PASS" : "FAIL" });
}

const P4_DRIFT_CONTRACT = Object.freeze({
  id: "V124-P4-DISTRIBUTION-DRIFT",
  source: "SÉRIE 14 P4 — Population Stability Index drift detection (ML-monitoring / credit-risk standard)",
  thresholds: Object.freeze({ none: "<0.1", moderate: "0.1–0.25", significant: ">0.25" }),
  complements: "profession-p4-data-reference (adds distributional drift, not a replacement)",
  notAuthority: "a pure drift metric over binned distributions; it trains nothing and reads no live data",
  invariants: Object.freeze([
    "PSI over binned distributions; <0.1 none, 0.1–0.25 moderate, >0.25 significant",
    "a category present in current but absent in reference contributes to drift (fail-closed, never hidden)",
    "empty reference or current ⇒ SIGNIFICANT drift (fail-closed); gate FAILs on SIGNIFICANT by default",
    "complements the P4 data reference; no new engine",
  ]),
});

module.exports = { counts, psi, assessDrift, P4_DRIFT_CONTRACT };

if (require.main === module) { process.stdout.write(JSON.stringify({ ...P4_DRIFT_CONTRACT, demo: assessDrift(["a", "a", "b", "b", "c"], ["a", "b", "b", "c", "c"]) }, null, 2) + "\n"); }

export {};
