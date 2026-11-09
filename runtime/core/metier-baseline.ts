#!/usr/bin/env node
"use strict";

/*
 * V5 PHASE 2 / M-CH2-01 (15 trades — per-métier baseline + gap inventory). PURE, deterministic, READ-ONLY. It does NOT
 * rewrite any métier's internal business logic (explicitly EXCLUDED by the directive) — it ROLLS UP the existing
 * multidimensional métier benchmark (metier-benchmark-multidim: DETECTION / SPECIFICITY / ROBUSTNESS per métier) into a
 * per-métier baseline over the full roster P1..P15, and inventories the GAPS honestly: a métier the benchmark does not
 * cover is NOT_BENCHMARKED (a GAP — never counted as passing), and a benchmarked métier that fails any dimension (e.g.
 * a block-everything guard failing SPECIFICITY) is a GAP, not a pass. Fail-closed: absence of evidence is a gap, never
 * an implicit success. It composes the existing benchmark (no new benchmark engine, §4 anti-gas-factory); it measures
 * and reports and grants no authority. Dual export.
 */

function isObj(v: any): boolean { return v !== null && typeof v === "object" && !Array.isArray(v); }
function arr(v: any): any[] { return Array.isArray(v) ? v : []; }

const ROSTER_15 = Object.freeze(["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11", "P12", "P13", "P14", "P15"]);

/**
 * baseline({ multidim, expectedMetiers }) -> { perMetier, coverage, effectiveCount, gaps, summary }.
 * multidim: the output of metier-benchmark-multidim.runMultidim() (has .results[{metier,detected,specific,robust,effective,reproducible}]).
 * Every roster métier gets a record; one absent from the benchmark is NOT_BENCHMARKED (a gap). Fail-closed.
 */
function baseline(input: any): any {
  const o = isObj(input) ? input : {};
  const roster = arr(o.expectedMetiers).length > 0 ? arr(o.expectedMetiers).map(String) : ROSTER_15.slice();
  const results = isObj(o.multidim) ? arr(o.multidim.results) : [];
  const byMetier: Record<string, any> = {};
  for (const r of results) if (isObj(r) && r.metier !== undefined) byMetier[String(r.metier)] = r;

  const perMetier: any[] = []; const gaps: any[] = []; let effectiveCount = 0; let benchmarked = 0;
  for (const m of roster) {
    const r = byMetier[m];
    if (!r) {
      perMetier.push(Object.freeze({ metier: m, benchmarked: false, maturity: "L0_L1", effective: false, gap: "NOT_BENCHMARKED" }));
      gaps.push(Object.freeze({ metier: m, gap: "NOT_BENCHMARKED", detail: "no reproducible multidimensional benchmark covers this métier — baseline gap (fail-closed: never counted as passing)" }));
      continue;
    }
    benchmarked++;
    const dimGaps: string[] = [];
    if (r.detected !== true) dimGaps.push("DETECTION");
    if (r.specific !== true) dimGaps.push("SPECIFICITY");
    if (r.robust !== true) dimGaps.push("ROBUSTNESS");
    if (r.reproducible !== true) dimGaps.push("REPRODUCIBILITY");
    const effective = r.effective === true && dimGaps.length === 0;
    if (effective) effectiveCount++;
    // honest maturity: an effective + reproducible benchmark ⇒ L3_VALIDATED signal for that guard; otherwise capped.
    const maturity = effective ? "L3_VALIDATED" : (r.detected === true ? "L2_INTEGRATED" : "L1_PROTOTYPE");
    perMetier.push(Object.freeze({ metier: m, benchmarked: true, maturity, detection: r.detected === true, specificity: r.specific === true, robustness: r.robust === true, reproducible: r.reproducible === true, effective, dimGaps: Object.freeze(dimGaps) }));
    if (dimGaps.length > 0) gaps.push(Object.freeze({ metier: m, gap: "DIMENSION_FAIL", detail: `fails ${dimGaps.join(", ")} — not effective (a planted-case detection alone is not superiority)` }));
  }

  return Object.freeze({
    perMetier: Object.freeze(perMetier),
    coverage: Object.freeze({ benchmarked, roster: roster.length, rate: roster.length > 0 ? Number((benchmarked / roster.length).toFixed(4)) : 0 }),
    effectiveCount, gaps: Object.freeze(gaps),
    summary: Object.freeze({ roster: roster.length, benchmarked, effective: effectiveCount, gaps: gaps.length, notBenchmarked: roster.length - benchmarked }),
    note: `${effectiveCount}/${roster.length} métiers have a reproducible+effective multidimensional baseline; ${gaps.length} gap(s) (incl. ${roster.length - benchmarked} NOT_BENCHMARKED) — read-only, no métier internal logic modified`,
  });
}

const METIER_BASELINE_CONTRACT = Object.freeze({
  id: "V5-METIER-BASELINE",
  source: "ODG Master program PHASE-2 M-CH2-01 — 15 trades per-métier baseline + gap inventory",
  roster: ROSTER_15,
  reuses: Object.freeze(["metier-benchmark-multidim.runMultidim (DETECTION/SPECIFICITY/ROBUSTNESS) — composes, builds no new benchmark (anti-gas-factory)", "honest maturity scale (capability-map)"]),
  notAuthority: "a read-only per-métier baseline + gap rollup; it rewrites no métier internal business logic and grants no authority",
  invariants: Object.freeze([
    "every roster métier P1..P15 gets a baseline record; one not covered by the benchmark is NOT_BENCHMARKED — a GAP (never counted as passing)",
    "a benchmarked métier that fails any dimension (DETECTION/SPECIFICITY/ROBUSTNESS/REPRODUCIBILITY) is a GAP, not a pass (a block-everything guard fails SPECIFICITY)",
    "effective = DETECTION ∧ SPECIFICITY ∧ no dimension gap; a planted-case detection alone is not superiority",
    "honest maturity: L3_VALIDATED only for an effective+reproducible benchmark; otherwise capped (L2/L1); absence of evidence is a gap, never implicit success",
    "READ-ONLY: it does NOT modify any métier's internal business logic (directive exclusion); pure/deterministic; no clock/random/network; composes the existing benchmark (no new engine)",
  ]),
});

module.exports = { ROSTER_15, baseline, METIER_BASELINE_CONTRACT };

if (require.main === module) {
  const M = require("./metier-benchmark-multidim");
  const b = baseline({ multidim: M.runMultidim() });
  process.stdout.write(JSON.stringify({ ...METIER_BASELINE_CONTRACT, demo: b.summary, gaps: b.gaps.map((g: any) => `${g.metier}:${g.gap}`) }, null, 2) + "\n");
}

export {};
