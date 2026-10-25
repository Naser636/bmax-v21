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
const autonomyRate = require(path.resolve(__dirname, "../runtime/core/autonomy-rate.js"));

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

// ================================ EXECUTED-AUTONOMY LAYER (cxxxii→cxxxiii increment) ================================
// Executed autonomy is stricter than measurability: each eligible objective must pair with REAL execution
// evidence from the SAME mission/attempt and only ODG-executed-AND-verified work counts. Wraps the real
// measurer buildAutonomyRate behind an INDEPENDENT oracle that fails CLOSED on a bad pairing.

const ts = (x) => { const n = x ? Date.parse(String(x)) : NaN; return Number.isFinite(n) ? n : null; };

function executedOracle(plan, execution) {
  const p = isObj(plan) ? plan : {};
  const e = isObj(execution) ? execution : {};
  const conflicts = [];
  const pm = typeof p.mission === "string" ? p.mission : null;
  const em = typeof e.mission === "string" ? e.mission : null;
  if (pm && em && pm !== em) conflicts.push({ kind: "CROSS_MISSION", detail: `plan=${pm} exec=${em}` });
  if (!em || !pm) conflicts.push({ kind: "MISSION_UNIDENTIFIED", detail: `plan=${pm} exec=${em}` });
  const objIds = new Set(objectivesOf(p).map((o) => o && o.id).filter(Boolean));
  const exIds = (Array.isArray(e.executed) ? e.executed : []).map((x) => x && (x.objectiveId || x.id)).filter(Boolean);
  const orphan = exIds.filter((id) => !objIds.has(id));
  if (orphan.length) conflicts.push({ kind: "ORPHAN_EVIDENCE", detail: Array.from(new Set(orphan)) });
  const dup = exIds.filter((id, i) => exIds.indexOf(id) !== i);
  if (dup.length) conflicts.push({ kind: "DUPLICATE_EVIDENCE", detail: Array.from(new Set(dup)) });
  const pt = ts(p.generatedAt || p.stampedAt), et = ts(e.generatedAt || e.stampedAt);
  if (pt !== null && et !== null && et < pt) conflicts.push({ kind: "STALE_EVIDENCE", detail: `exec(${et}) older than plan(${pt})` });
  return { ok: conflicts.length === 0, conflicts };
}

function executedRow(mission, plan, execution, opts) {
  const o = isObj(opts) ? opts : {};
  const buildRate = o.buildRate || autonomyRate.buildAutonomyRate;
  const oracle = executedOracle(plan, execution);
  if (!oracle.ok) {
    return { mission, oracle, excluded: true, measurable: false, reason: "oracle: " + oracle.conflicts.map((c) => c.kind).join(",") };
  }
  const rate = buildRate({ planObjectives: objectivesOf(plan), patchExecution: execution, attribution: o.attribution || null, mission });
  const m = (rate && rate.measure) ? rate.measure : rate;
  return { mission, oracle, excluded: false, measurable: m && m.measurable === true, measure: m };
}

function executedBenchmark(pairs, opts) {
  const rows = (Array.isArray(pairs) ? pairs : []).map((p) => executedRow(p.mission, p.plan, p.execution, opts));
  const counted = rows.filter((r) => !r.excluded && r.measurable);
  const denominator = counted.reduce((n, r) => n + ((r.measure && r.measure.denominator) || 0), 0);
  const numerator = counted.reduce((n, r) => n + ((r.measure && r.measure.numerator) || 0), 0);
  const cat = (k) => counted.reduce((n, r) => n + ((r.measure && r.measure.categories && r.measure.categories[k]) || 0), 0);
  return {
    totalPairs: rows.length,
    countedMissions: counted.length,
    excluded: rows.filter((r) => r.excluded).map((r) => ({ mission: r.mission, reason: r.reason })),
    notMeasurable: rows.filter((r) => !r.excluded && !r.measurable).map((r) => r.mission),
    denominator,
    numerator,
    executedAutonomyPercent: denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null,
    categories: {
      ODG_EXECUTED_VERIFIED: cat("ODG_EXECUTED_VERIFIED"),
      ODG_EXECUTED_UNVERIFIED: cat("ODG_EXECUTED_UNVERIFIED"),
      OPERATOR_OR_EXTERNAL: cat("OPERATOR_OR_EXTERNAL"),
      BLOCKED_REFUSED_FAILED: cat("BLOCKED_REFUSED_FAILED"),
      HUMAN_MANDATORY: cat("HUMAN_MANDATORY"),
      NOT_EXECUTED: cat("NOT_EXECUTED"),
    },
    provenance: provenance(rows.map((r) => ({ mission: r.mission, classify: { excluded: r.excluded, measurable: r.measurable, n: r.measure && r.measure.numerator, d: r.measure && r.measure.denominator } }))),
  };
}

function executedLiveFromGenerated(opts) {
  const o = isObj(opts) ? opts : {};
  const fs = o.fs || require("fs");
  const ROOT = o.root || path.resolve(__dirname, "..");
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch { return null; } };
  const plan = read("runtime/generated/mission-plan.json");
  const execution = read("runtime/generated/patch-execution.json");
  if (!plan || !execution) return { totalPairs: 0, countedMissions: 0, excluded: [], notMeasurable: [], denominator: 0, numerator: 0, executedAutonomyPercent: null, categories: {}, note: "no real generated (plan,execution) pair present" };
  const mission = (typeof plan.mission === "string" && plan.mission) || (typeof execution.mission === "string" && execution.mission) || "UNKNOWN";
  return executedBenchmark([{ mission, plan, execution }], o);
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
  process.stdout.write(`SUMMARY (measurability): measurable ${s.measurable}/${s.total} · eligibleObjectives=${s.eligibleObjectives} · excludedObjectives=${s.excludedObjectives} · antiInflationOk=${s.antiInflationOk}\n`);

  const ex = executedLiveFromGenerated({});
  process.stdout.write(`EXECUTED-AUTONOMY (live, real generated pair): countedMissions=${ex.countedMissions}/${ex.totalPairs} denominator=${ex.denominator} numerator=${ex.numerator} executedAutonomyPercent=${ex.executedAutonomyPercent}` +
    (ex.excluded && ex.excluded.length ? ` excluded=${JSON.stringify(ex.excluded)}` : "") +
    (ex.notMeasurable && ex.notMeasurable.length ? ` notMeasurable=${JSON.stringify(ex.notMeasurable)}` : "") +
    (ex.categories ? ` categories=${JSON.stringify(ex.categories)}` : "") + `\n`);
  try { require("fs").writeFileSync(path.resolve(__dirname, "../runtime/generated/executed-autonomy-benchmark.json"), JSON.stringify(ex, null, 2)); } catch { /* generated dir optional */ }

  process.exit(s.antiInflationOk ? 0 : 1);
}

module.exports = { classifyPlan, oracleCheck, aggregate, provenance, rowFor, runLive, objectivesOf, MISSION_SET, BENCHMARK_VERSION, executedOracle, executedRow, executedBenchmark, executedLiveFromGenerated };
