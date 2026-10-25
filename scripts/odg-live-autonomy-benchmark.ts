/*
 * ODG LIVE AUTONOMY-MEASURABILITY BENCHMARK v1 — TypeScript canonical (dual-ported with the byte-equivalent
 * scripts/odg-live-autonomy-benchmark.js; pure core is identical).
 *
 * Purpose (closes the §X.9 open item): §X.9 found the LIVE autonomy score NOT_MEASURABLE because real
 * mission-plan objectives carried no per-objective `authorization` declaration. CM-5 (objective-authorization
 * + mission-loader stamping, on main) now stamps them. This benchmark MEASURES, reproducibly and over a FIXED
 * representative set of REAL missions, how many are now autonomy-MEASURABLE — the honest before/after of CM-5.
 *
 * It does NOT fabricate an autonomy percentage and it does NOT run paid providers or the network. It REUSES
 * the real measurer (runtime/core/autonomy-measure.eligibilityFromObjectives) and an INDEPENDENT oracle
 * (runtime/core/objective-authorization.declareAuthorization) to catch inflation — it never re-implements
 * eligibility. Pure core (classifyPlan/oracleCheck/aggregate/provenance) is deterministic and unit-tested
 * with fixtures; the CLI live driver generates real plans via the mission-loader (snapshot/restore of the
 * shared runtime/generated/mission-plan.json).
 */
"use strict";
const path = require("path");
const crypto = require("crypto");
const measure = require(path.resolve(__dirname, "../runtime/core/autonomy-measure.js"));
const objAuth = require(path.resolve(__dirname, "../runtime/core/objective-authorization.js"));

const BENCHMARK_VERSION = "1.0";

// Frozen, representative real-mission set spanning the governance classes (ids exist in runtime/missions/ +
// ROADMAP.json). The set is part of the reproducible contract — changing it changes the provenance.
const MISSION_SET: string[] = Object.freeze([
  "CLEAN_RUNTIME_WORKSPACE",        // scoped-engineering  (expected measurable)
  "UNIFY_RUNTIME_EXECUTION",        // scoped-engineering
  "PROVIDER_ENABLED_SMOKE_V1",      // engineering/provider
  "AUDIT_THE_RUNTIME_STATE",        // ambiguous read intent (may stay fail-closed undeclared)
  "DEPLOY_BMAX_DASHBOARD_PROD_V1",  // reserved / human-gated production (must NOT inflate eligible)
  "M0001",                          // framework baseline
]) as any;

const isObj = (o: any): boolean => o && typeof o === "object";
const objectivesOf = (plan: any): any[] =>
  (isObj(plan) && Array.isArray(plan.objectives) && plan.objectives) ||
  (isObj(plan) && isObj(plan.plan) && Array.isArray(plan.plan.objectives) && plan.plan.objectives) || [];

// PURE: classify one plan's objectives for autonomy-measurability (reuses the real measurer).
function classifyPlan(objectives: any[]): any {
  const objs = Array.isArray(objectives) ? objectives : [];
  const elig = measure.eligibilityFromObjectives(objs);
  const auth = objs.map((o) => o && o.authorization).filter(Boolean);
  const eligible = auth.filter((a: any) => a.eligible === true && a.authorized === true && a.excluded !== true).length;
  const excluded = auth.filter((a: any) => a.excluded === true).length;
  return {
    objectives: objs.length,
    stamped: auth.length,
    undeclared: objs.length - auth.length,
    eligible,
    excluded,
    measurable: elig.complete === true,
    missing: Array.isArray(elig.missing) ? elig.missing : [],
  };
}

// PURE: independent oracle — re-derive exclusions from declareAuthorization and flag INFLATION (an objective
// the oracle marks reserved/excluded that is nonetheless stamped eligible+authorized). Never raises eligible.
function oracleCheck(objectives: any[]): any {
  const objs = Array.isArray(objectives) ? objectives : [];
  const conflicts: any[] = [];
  let checked = 0;
  for (const o of objs) {
    checked += 1;
    const oracle = objAuth.declareAuthorization(o);
    const stamp = o && o.authorization;
    if (oracle && oracle.excluded === true && stamp && stamp.eligible === true && stamp.excluded !== true) {
      conflicts.push({ id: (o && (o.id || o.goal)) || null, reason: `oracle-excluded (${oracle.reason}) but stamped eligible` });
    }
  }
  return { checked, conflicts, antiInflationOk: conflicts.length === 0 };
}

// PURE: aggregate per-mission classifications into the reproducible report body.
function aggregate(results: any[]): any {
  const rows = Array.isArray(results) ? results : [];
  const measurable = rows.filter((r) => r.classify && r.classify.measurable).length;
  const anyConflict = rows.some((r) => r.oracle && r.oracle.antiInflationOk === false);
  return {
    total: rows.length,
    measurable,
    notMeasurable: rows.length - measurable,
    eligibleObjectives: rows.reduce((n, r) => n + ((r.classify && r.classify.eligible) || 0), 0),
    excludedObjectives: rows.reduce((n, r) => n + ((r.classify && r.classify.excluded) || 0), 0),
    antiInflationOk: !anyConflict,
  };
}

// PURE: content-addressed provenance over the ordered (mission,objectives-authorization) inputs.
function provenance(results: any[]): string {
  const canon = (Array.isArray(results) ? results : []).map((r) => [r.mission, r.classify]);
  return crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex").slice(0, 16);
}

// Build one report row from a mission id + its generated plan's objectives.
function rowFor(mission: string, objectives: any[]): any {
  return { mission, classify: classifyPlan(objectives), oracle: oracleCheck(objectives) };
}

// LIVE driver (CLI only): generate a real plan per mission via the mission-loader, snapshotting/restoring the
// shared runtime/generated/mission-plan.json so the benchmark is non-destructive. Injectable for tests.
function runLive(missionIds: string[], opts: any): any {
  const o = isObj(opts) ? opts : {};
  const fs = o.fs || require("fs");
  const spawnSync = o.spawnSync || require("child_process").spawnSync;
  const ROOT = o.root || path.resolve(__dirname, "..");
  const PLAN = path.join(ROOT, "runtime/generated/mission-plan.json");
  const TSX = path.join(ROOT, "node_modules/.bin/tsx");
  const LOADER = path.join(ROOT, "runtime/core/mission-loader.ts");
  const snap = fs.existsSync(PLAN) ? fs.readFileSync(PLAN) : null;
  const rows: any[] = [];
  try {
    for (const id of missionIds) {
      const r = spawnSync(TSX, [LOADER, id], { cwd: ROOT, encoding: "utf8" });
      let objectives: any[] = [];
      if (fs.existsSync(PLAN)) { try { objectives = objectivesOf(JSON.parse(fs.readFileSync(PLAN, "utf8"))); } catch { objectives = []; } }
      rows.push(Object.assign(rowFor(id, objectives), { loaderExit: r.status }));
    }
  } finally {
    if (snap !== null) fs.writeFileSync(PLAN, snap); // restore — non-destructive
  }
  return { benchmarkVersion: BENCHMARK_VERSION, missionSet: missionIds, rows, summary: aggregate(rows), provenance: provenance(rows) };
}

if (require.main === module) {
  const report = runLive(MISSION_SET as any, {});
  const fs = require("fs");
  try { fs.writeFileSync(path.resolve(__dirname, "../runtime/generated/live-autonomy-benchmark.json"), JSON.stringify(report, null, 2)); } catch { /* generated dir optional */ }
  process.stdout.write(`odg-live-autonomy-benchmark v${report.benchmarkVersion} (provenance ${report.provenance})\n`);
  for (const r of report.rows) {
    process.stdout.write(`  ${r.mission}: measurable=${r.classify.measurable} objectives=${r.classify.objectives} eligible=${r.classify.eligible} excluded=${r.classify.excluded} undeclared=${r.classify.undeclared} antiInflationOk=${r.oracle.antiInflationOk}\n`);
  }
  const s = report.summary;
  process.stdout.write(`SUMMARY: measurable ${s.measurable}/${s.total} · eligibleObjectives=${s.eligibleObjectives} · excludedObjectives=${s.excludedObjectives} · antiInflationOk=${s.antiInflationOk}\n`);
  process.exit(s.antiInflationOk ? 0 : 1); // fail-closed if the oracle caught inflation
}

module.exports = { classifyPlan, oracleCheck, aggregate, provenance, rowFor, runLive, objectivesOf, MISSION_SET, BENCHMARK_VERSION };
export {};
