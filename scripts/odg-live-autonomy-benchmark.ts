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
const autonomyRate = require(path.resolve(__dirname, "../runtime/core/autonomy-rate.js"));

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

// ================================ EXECUTED-AUTONOMY LAYER (cxxxii→cxxxiii increment) ================================
// Measurability (above) only proves a mission's eligibility is fully declared. EXECUTED autonomy is stricter:
// each eligible objective must be paired with REAL execution evidence from the SAME mission/attempt and only
// ODG-executed-AND-verified work counts (numerator). This layer wraps the REAL measurer buildAutonomyRate and
// gates it behind an INDEPENDENT oracle that fails CLOSED on a bad pairing — so eligibility alone, orphan
// evidence, a cross-mission artifact, a duplicate or a stale result can NEVER be reported as executed autonomy.

const ts = (x: any): number | null => { const n = x ? Date.parse(String(x)) : NaN; return Number.isFinite(n) ? n : null; };

// INDEPENDENT ORACLE over a (plan, execution) pairing. Pure; returns {ok, conflicts}. ok ⇒ safe to measure.
function executedOracle(plan: any, execution: any): any {
  const p = isObj(plan) ? plan : {};
  const e = isObj(execution) ? execution : {};
  const conflicts: any[] = [];
  const pm = typeof p.mission === "string" ? p.mission : null;
  const em = typeof e.mission === "string" ? e.mission : null;
  if (pm && em && pm !== em) conflicts.push({ kind: "CROSS_MISSION", detail: `plan=${pm} exec=${em}` });
  if (!em || !pm) conflicts.push({ kind: "MISSION_UNIDENTIFIED", detail: `plan=${pm} exec=${em}` });
  const objIds = new Set(objectivesOf(p).map((o: any) => o && o.id).filter(Boolean));
  const exIds = (Array.isArray(e.executed) ? e.executed : []).map((x: any) => x && (x.objectiveId || x.id)).filter(Boolean);
  const orphan = exIds.filter((id: any) => !objIds.has(id));
  if (orphan.length) conflicts.push({ kind: "ORPHAN_EVIDENCE", detail: Array.from(new Set(orphan)) });
  const dup = exIds.filter((id: any, i: number) => exIds.indexOf(id) !== i);
  if (dup.length) conflicts.push({ kind: "DUPLICATE_EVIDENCE", detail: Array.from(new Set(dup)) });
  const pt = ts(p.generatedAt || p.stampedAt), et = ts(e.generatedAt || e.stampedAt);
  if (pt !== null && et !== null && et < pt) conflicts.push({ kind: "STALE_EVIDENCE", detail: `exec(${et}) older than plan(${pt})` });
  return { ok: conflicts.length === 0, conflicts };
}

// Build one executed-autonomy row: oracle gate FIRST (fail-closed exclude), else the real measurer's verdict.
function executedRow(mission: string, plan: any, execution: any, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const buildRate = o.buildRate || autonomyRate.buildAutonomyRate;
  const oracle = executedOracle(plan, execution);
  if (!oracle.ok) {
    return { mission, oracle, excluded: true, measurable: false, reason: "oracle: " + oracle.conflicts.map((c: any) => c.kind).join(",") };
  }
  const rate = buildRate({ planObjectives: objectivesOf(plan), patchExecution: execution, attribution: o.attribution || null, mission });
  const m = (rate && rate.measure) ? rate.measure : rate;
  return { mission, oracle, excluded: false, measurable: m && m.measurable === true, measure: m };
}

// Aggregate executed-autonomy over a set of (mission, plan, execution) pairs. Denominator is JUSTIFIED:
// only oracle-clean AND measurable missions contribute; everything else is published as excluded/notMeasurable
// and NEVER counted. Percent is null (not fabricated) when the justified denominator is 0.
function executedBenchmark(pairs: any[], opts: any): any {
  const rows = (Array.isArray(pairs) ? pairs : []).map((p) => executedRow(p.mission, p.plan, p.execution, opts));
  const counted = rows.filter((r) => !r.excluded && r.measurable);
  const denominator = counted.reduce((n, r) => n + ((r.measure && r.measure.denominator) || 0), 0);
  const numerator = counted.reduce((n, r) => n + ((r.measure && r.measure.numerator) || 0), 0);
  const cat = (k: string) => counted.reduce((n, r) => n + ((r.measure && r.measure.categories && r.measure.categories[k]) || 0), 0);
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

// Read the current REAL generated (plan, execution) pair for the live executed-autonomy data point (read-only).
function executedLiveFromGenerated(opts: any): any {
  const o = isObj(opts) ? opts : {};
  const fs = o.fs || require("fs");
  const ROOT = o.root || path.resolve(__dirname, "..");
  const read = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch { return null; } };
  const plan = read("runtime/generated/mission-plan.json");
  const execution = read("runtime/generated/patch-execution.json");
  if (!plan || !execution) return { totalPairs: 0, countedMissions: 0, excluded: [], notMeasurable: [], denominator: 0, numerator: 0, executedAutonomyPercent: null, categories: {}, note: "no real generated (plan,execution) pair present" };
  const mission = (typeof plan.mission === "string" && plan.mission) || (typeof execution.mission === "string" && execution.mission) || "UNKNOWN";
  return executedBenchmark([{ mission, plan, execution }], o);
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
  process.stdout.write(`SUMMARY (measurability): measurable ${s.measurable}/${s.total} · eligibleObjectives=${s.eligibleObjectives} · excludedObjectives=${s.excludedObjectives} · antiInflationOk=${s.antiInflationOk}\n`);

  // Executed-autonomy live data point over the current real generated (plan, execution) pair (read-only).
  const ex = executedLiveFromGenerated({});
  process.stdout.write(`EXECUTED-AUTONOMY (live, real generated pair): countedMissions=${ex.countedMissions}/${ex.totalPairs} denominator=${ex.denominator} numerator=${ex.numerator} executedAutonomyPercent=${ex.executedAutonomyPercent}` +
    (ex.excluded && ex.excluded.length ? ` excluded=${JSON.stringify(ex.excluded)}` : "") +
    (ex.notMeasurable && ex.notMeasurable.length ? ` notMeasurable=${JSON.stringify(ex.notMeasurable)}` : "") +
    (ex.categories ? ` categories=${JSON.stringify(ex.categories)}` : "") + `\n`);
  try { require("fs").writeFileSync(path.resolve(__dirname, "../runtime/generated/executed-autonomy-benchmark.json"), JSON.stringify(ex, null, 2)); } catch { /* generated dir optional */ }

  process.exit(s.antiInflationOk ? 0 : 1); // fail-closed if the measurability oracle caught inflation
}

module.exports = { classifyPlan, oracleCheck, aggregate, provenance, rowFor, runLive, objectivesOf, MISSION_SET, BENCHMARK_VERSION, executedOracle, executedRow, executedBenchmark, executedLiveFromGenerated };
export {};
