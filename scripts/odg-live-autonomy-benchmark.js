/*
 * ODG LIVE AUTONOMY-MEASURABILITY BENCHMARK v1 — JavaScript port (byte-equivalent pure core to the canonical
 * scripts/odg-live-autonomy-benchmark.ts). See the .ts header for the full rationale.
 *
 * Closes the §X.9 open item: measures reproducibly, over a FIXED representative set of REAL missions, how many
 * are now autonomy-MEASURABLE after CM-5 stamped per-objective authorization. Reuses the real measurer and an
 * independent oracle; no fabricated percentage; no network/provider.
 */
"use strict";
const path = require("path");
const crypto = require("crypto");
const measure = require(path.resolve(__dirname, "../runtime/core/autonomy-measure.js"));
const objAuth = require(path.resolve(__dirname, "../runtime/core/objective-authorization.js"));

const BENCHMARK_VERSION = "1.0";

const MISSION_SET = Object.freeze([
  "CLEAN_RUNTIME_WORKSPACE",
  "UNIFY_RUNTIME_EXECUTION",
  "PROVIDER_ENABLED_SMOKE_V1",
  "AUDIT_THE_RUNTIME_STATE",
  "DEPLOY_BMAX_DASHBOARD_PROD_V1",
  "M0001",
]);

const isObj = (o) => o && typeof o === "object";
const objectivesOf = (plan) =>
  (isObj(plan) && Array.isArray(plan.objectives) && plan.objectives) ||
  (isObj(plan) && isObj(plan.plan) && Array.isArray(plan.plan.objectives) && plan.plan.objectives) || [];

function classifyPlan(objectives) {
  const objs = Array.isArray(objectives) ? objectives : [];
  const elig = measure.eligibilityFromObjectives(objs);
  const auth = objs.map((o) => o && o.authorization).filter(Boolean);
  const eligible = auth.filter((a) => a.eligible === true && a.authorized === true && a.excluded !== true).length;
  const excluded = auth.filter((a) => a.excluded === true).length;
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

function oracleCheck(objectives) {
  const objs = Array.isArray(objectives) ? objectives : [];
  const conflicts = [];
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

function aggregate(results) {
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

function provenance(results) {
  const canon = (Array.isArray(results) ? results : []).map((r) => [r.mission, r.classify]);
  return crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex").slice(0, 16);
}

function rowFor(mission, objectives) {
  return { mission, classify: classifyPlan(objectives), oracle: oracleCheck(objectives) };
}

function runLive(missionIds, opts) {
  const o = isObj(opts) ? opts : {};
  const fs = o.fs || require("fs");
  const spawnSync = o.spawnSync || require("child_process").spawnSync;
  const ROOT = o.root || path.resolve(__dirname, "..");
  const PLAN = path.join(ROOT, "runtime/generated/mission-plan.json");
  const TSX = path.join(ROOT, "node_modules/.bin/tsx");
  const LOADER = path.join(ROOT, "runtime/core/mission-loader.ts");
  const snap = fs.existsSync(PLAN) ? fs.readFileSync(PLAN) : null;
  const rows = [];
  try {
    for (const id of missionIds) {
      const r = spawnSync(TSX, [LOADER, id], { cwd: ROOT, encoding: "utf8" });
      let objectives = [];
      if (fs.existsSync(PLAN)) { try { objectives = objectivesOf(JSON.parse(fs.readFileSync(PLAN, "utf8"))); } catch { objectives = []; } }
      rows.push(Object.assign(rowFor(id, objectives), { loaderExit: r.status }));
    }
  } finally {
    if (snap !== null) fs.writeFileSync(PLAN, snap);
  }
  return { benchmarkVersion: BENCHMARK_VERSION, missionSet: missionIds, rows, summary: aggregate(rows), provenance: provenance(rows) };
}

if (require.main === module) {
  const report = runLive(MISSION_SET, {});
  const fs = require("fs");
  try { fs.writeFileSync(path.resolve(__dirname, "../runtime/generated/live-autonomy-benchmark.json"), JSON.stringify(report, null, 2)); } catch { /* generated dir optional */ }
  process.stdout.write(`odg-live-autonomy-benchmark v${report.benchmarkVersion} (provenance ${report.provenance})\n`);
  for (const r of report.rows) {
    process.stdout.write(`  ${r.mission}: measurable=${r.classify.measurable} objectives=${r.classify.objectives} eligible=${r.classify.eligible} excluded=${r.classify.excluded} undeclared=${r.classify.undeclared} antiInflationOk=${r.oracle.antiInflationOk}\n`);
  }
  const s = report.summary;
  process.stdout.write(`SUMMARY: measurable ${s.measurable}/${s.total} · eligibleObjectives=${s.eligibleObjectives} · excludedObjectives=${s.excludedObjectives} · antiInflationOk=${s.antiInflationOk}\n`);
  process.exit(s.antiInflationOk ? 0 : 1);
}

module.exports = { classifyPlan, oracleCheck, aggregate, provenance, rowFor, runLive, objectivesOf, MISSION_SET, BENCHMARK_VERSION };
