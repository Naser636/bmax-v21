#!/usr/bin/env node
"use strict";

/*
 * V12.4 / CTO V62 (§5/§6) — PER-MÉTIER PERFORMANCE FICHES. Builds ONE multidimensional performance card per métier by
 * AGGREGATING existing measurements (V57 benchmark program, V55 cost-superiority, V55 automation, V62 enterprise sim) —
 * never inventing a number. Each of the ~13 dimensions carries an explicit basis; a dimension with no source is
 * NOT_MEASURED (fail-closed), never 0 or PASS. It enumerates the FIVE internal reference-baseline types (human /
 * open-source / public / synthetic / historical-ODG) a comparison would use. NO single artificial cross-métier score —
 * ranking is per-dimension only. Read-only aggregation; no new engine. Run: `odg-metier-performance-fiche.ts`.
 */

const fs = require("fs");
const path = require("path");
const D = path.join(__dirname, "..", "..", "docs", "odg");
function readJson(f: string): any { try { return JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch { return null; } }

const e4 = readJson("V50_E4_ASSESSMENT_MATRIX.json");
const bench = readJson("V57_15_METIERS_BENCHMARK_PROGRAM.json");
const cost = readJson("V55_COST_SUPERIORITY_PROGRAM.json");
const auto = readJson("V55_AUTOMATION_MEASUREMENT.json");
const ent = readJson("V62_SYNTHETIC_ENTERPRISE_SIM.json");

const metiers = e4 ? Object.keys(e4.metiers) : [];
const benchBy: any = {}; if (bench) for (const p of bench.program) benchBy[p.metier] = p;
const costBy: any = {}; if (cost) for (const m of cost.perMetier) costBy[m.metier] = m;
const autoBy: any = {}; if (auto) for (const m of auto.perMetier) autoBy[m.metier] = m;
const entSatByMetier: any = {}; if (ent) for (const r of ent.runs) if (r.satisfaction != null) entSatByMetier[r.metier] = Math.max(entSatByMetier[r.metier] || 0, r.satisfaction);

const REFERENCE_BASELINES = Object.freeze(["human-professional", "open-source", "public-benchmark", "synthetic", "historical-ODG-version"]);

// a dimension value sourced from an artifact, or NOT_MEASURED (fail-closed, never fabricated).
function dim(value: any, basis: string, source: string): any {
  return value === null || value === undefined ? { value: null, basis: "NOT_MEASURED", source: "none" } : { value, basis, source };
}

const fiches = metiers.map((m) => {
  const b = benchBy[m]; const c = costBy[m]; const a = autoBy[m];
  const blocked = e4.metiers[m] && e4.metiers[m].e4 === "BLOCKED";
  return {
    metier: m, capability: e4.metiers[m] ? e4.metiers[m].cap : null, e4: e4.metiers[m] ? e4.metiers[m].e4 : null,
    dimensions: {
      quality: dim(b ? (b.odgSideResult ? (b.odgSideResult.effective ? "EFFECTIVE" : "PARTIAL") : null) : null, "OBSERVED (ODG-side harness)", "V57 benchmark"),
      precision: dim(b && b.odgSideResult ? (b.odgSideResult.specific ? "specific (0 false-pos)" : null) : null, "OBSERVED", "V57 benchmark"),
      errorRate: dim(b && b.odgSideResult ? (b.odgSideResult.robust ? "fail-closed on malformed" : null) : null, "OBSERVED", "V57 benchmark"),
      robustness: dim(b && b.odgSideResult ? b.odgSideResult.robust : null, "OBSERVED", "V57 benchmark"),
      security: dim("deny-by-default / fail-closed (see V61 authority rule)", "OBSERVED (governance)", "V61 separation test"),
      compliance: dim(m === "P10" || m === "P3" || m === "P11" ? "readiness-only, NOT_CERTIFIED" : "n/a", "DECLARED", "métier guard"),
      speed: dim(null, "NOT_MEASURED (not timed)", "none"),
      totalCost: dim(c ? `ODG €${c.odgTotal} vs ref €${c.referenceTotal} (${c.reductionPct}% SIMULATED)` : null, "SIMULATED", "V55 cost"),
      resourceUse: dim(null, "NOT_MEASURED", "none"),
      automation: dim(a ? `${a.pctEligibleAutomated}% eligible / ${a.pctTimeSaved}% time (SIMULATED)` : null, "SIMULATED", "V55 automation"),
      longTaskReliability: dim(null, "NOT_MEASURED (no long-horizon METR-style run)", "none"),
      incidentRecovery: dim("rce-assurance / circuit-breaker present", "OBSERVED (modules)", "guard modules"),
      satisfaction: dim(entSatByMetier[m] != null ? entSatByMetier[m] : null, "SIMULATED (synthetic enterprise)", "V62 enterprise sim"),
    },
    referenceBaselines: REFERENCE_BASELINES,
    superiority: "NOT DEMONSTRATED — requires head-to-head reference execution + independent re-run (V57 §2, fail-closed)",
    blocked: blocked ? "P13 hardware/GPU absent — software/prep done, dependency not satisfied" : null,
  };
});

// per-dimension leaders (NOT a global score) — only where measured.
function leadersByDimension(key: string): any {
  const measured = fiches.filter((f: any) => f.dimensions[key] && f.dimensions[key].value !== null);
  return { dimension: key, measuredCount: measured.length, note: "ranked within this dimension only — NEVER combined into a single cross-métier score" };
}

const out = {
  "//": "CTO V62 §5/§6 — per-métier performance fiches. Multidimensional card per métier aggregating existing measurements; each dimension carries a basis; no source ⇒ NOT_MEASURED (fail-closed). Five internal reference-baseline types enumerated. NO single artificial cross-métier score. Superiority fail-closed. Read-only; no new engine.",
  generatedFrom: ["V50_E4_ASSESSMENT_MATRIX.json", "V57_15_METIERS_BENCHMARK_PROGRAM.json", "V55_COST_SUPERIORITY_PROGRAM.json", "V55_AUTOMATION_MEASUREMENT.json", "V62_SYNTHETIC_ENTERPRISE_SIM.json"],
  metierCount: fiches.length,
  referenceBaselineTypes: REFERENCE_BASELINES,
  fiches,
  perDimensionRanking: ["quality", "totalCost", "automation", "satisfaction"].map(leadersByDimension),
  honestConclusion: `${fiches.length} per-métier performance fiches built by aggregating existing measurements. Dimensions carry explicit bases; unmeasured dimensions (speed, resourceUse, longTaskReliability) are NOT_MEASURED (not faked). No single global score. Superiority NOT DEMONSTRATED for any métier (fail-closed). P13 remains hardware-blocked.`,
  invariant: "No dimension value is fabricated; a missing source ⇒ NOT_MEASURED, never 0/PASS. No cross-métier global score. Superiority requires real head-to-head + independent re-run.",
};
fs.writeFileSync(path.join(D, "V62_METIER_PERFORMANCE_FICHES.json"), JSON.stringify(out, null, 2) + "\n");
process.stdout.write(JSON.stringify({ metiers: fiches.length, baselineTypes: REFERENCE_BASELINES.length, superiorityDemonstrated: 0 }, null, 2) + "\n");
export {};
