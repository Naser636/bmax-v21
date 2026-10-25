/*
 * ODG EXECUTION-EVIDENCE PILOT v1 — JavaScript port (byte-equivalent core to the canonical .ts).
 * See the .ts header for rationale. Generates REAL execution evidence for several read-only / no-provider
 * missions via the existing pipeline (runtime/bin/odg-run.js), snapshots+restores+VERIFIES the generated
 * directory, and measures executed autonomy via the existing oracle-gated executedBenchmark. Invents no
 * evidence; a RECORDED status is never a successful execution.
 */
"use strict";
const path = require("path");
const bench = require(path.resolve(__dirname, "odg-live-autonomy-benchmark.js"));

const PILOT_VERSION = "1.0";

const SAFE_MISSION_SET = Object.freeze([
  "M0000",
  "M0001",
  "M0002",
  "AUDIT_THE_RUNTIME_STATE",
  "AUDIT_RUNTIME_STATE_MACHINE",
  "RUNTIME_SELF_AUDIT",
]);

const isObj = (o) => o && typeof o === "object";

function defaultRunner(mission, opts) {
  const o = isObj(opts) ? opts : {};
  const fs = o.fs || require("fs");
  const spawnSync = o.spawnSync || require("child_process").spawnSync;
  const ROOT = o.root || path.resolve(__dirname, "..");
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch { return null; } };
  const r = spawnSync("node", [path.join(ROOT, "runtime/bin/odg-run.js"), mission], { cwd: ROOT, encoding: "utf8", timeout: o.timeoutMs || 240000 });
  return { mission, exit: r.status, plan: read("runtime/generated/mission-plan.json"), execution: read("runtime/generated/patch-execution.json") };
}

function snapshotGenerated(opts) {
  const o = isObj(opts) ? opts : {};
  const spawnSync = o.spawnSync || require("child_process").spawnSync;
  const crypto = require("crypto");
  const ROOT = o.root || path.resolve(__dirname, "..");
  const tgz = o.tgz || path.join(require("os").tmpdir(), `odg-gen-snapshot-${process.pid}.tgz`);
  spawnSync("tar", ["-czf", tgz, "-C", ROOT, "runtime/generated"], { encoding: "utf8" });
  const list = spawnSync("tar", ["-tzf", tgz], { encoding: "utf8" }).stdout || "";
  const digest = crypto.createHash("md5").update(list.split("\n").sort().join("\n")).digest("hex");
  return { tgz, digest };
}
function restoreGenerated(snap, opts) {
  const o = isObj(opts) ? opts : {};
  const spawnSync = o.spawnSync || require("child_process").spawnSync;
  const crypto = require("crypto");
  const ROOT = o.root || path.resolve(__dirname, "..");
  spawnSync("rm", ["-rf", path.join(ROOT, "runtime/generated")], { encoding: "utf8" });
  spawnSync("tar", ["-xzf", snap.tgz, "-C", ROOT], { encoding: "utf8" });
  const list = spawnSync("tar", ["-tzf", snap.tgz], { encoding: "utf8" }).stdout || "";
  const digest = crypto.createHash("md5").update(list.split("\n").sort().join("\n")).digest("hex");
  return { verified: digest === snap.digest, digest };
}

function tally(runs, benchmarkReport) {
  const rows = Array.isArray(runs) ? runs : [];
  const attempted = rows.length;
  const runFailedBlocked = rows.filter((r) => r.exit !== 0 || !r.plan || !r.execution).map((r) => r.mission);
  const ex = benchmarkReport || {};
  const excludedByOracle = (ex.excluded || []).map((e) => e.mission);
  const notMeasurable = ex.notMeasurable || [];
  return {
    attempted,
    runFailedBlocked,
    measurableMissions: ex.countedMissions || 0,
    notMeasurableMissions: notMeasurable,
    excludedByOracle,
    objectiveDenominator: ex.denominator || 0,
    objectiveNumeratorVerified: ex.numerator || 0,
    executedAutonomyPercentObjectives: typeof ex.executedAutonomyPercent === "number" || ex.executedAutonomyPercent === null ? ex.executedAutonomyPercent : null,
    categories: ex.categories || {},
  };
}

function runPilot(missions, opts) {
  const o = isObj(opts) ? opts : {};
  const runner = o.runner || defaultRunner;
  const snapshot = o.snapshot || snapshotGenerated;
  const restore = o.restore || restoreGenerated;
  const snap = snapshot(o);
  const runs = [];
  let restoreResult = { verified: true, skipped: true };
  try {
    for (const m of missions) runs.push(runner(m, o));
  } finally {
    if (!o.noRestore) restoreResult = restore(snap, o);
  }
  const pairs = runs
    .filter((r) => r.exit === 0 && r.plan && r.execution)
    .map((r) => ({ mission: r.mission, plan: r.plan, execution: r.execution }));
  const benchmarkReport = bench.executedBenchmark(pairs, o);
  return {
    pilotVersion: PILOT_VERSION,
    missionSet: missions,
    restoreVerified: restoreResult.verified === true,
    runs: runs.map((r) => ({ mission: r.mission, exit: r.exit, hasPlan: !!r.plan, hasExecution: !!r.execution })),
    benchmark: benchmarkReport,
    tally: tally(runs, benchmarkReport),
  };
}

if (require.main === module) {
  const report = runPilot(SAFE_MISSION_SET, {});
  try { require("fs").writeFileSync(path.resolve(__dirname, "../runtime/generated/execution-evidence-pilot.json"), JSON.stringify(report, null, 2)); } catch { /* optional */ }
  const t = report.tally;
  process.stdout.write(`odg-execution-evidence-pilot v${report.pilotVersion} (restoreVerified=${report.restoreVerified})\n`);
  for (const r of report.runs) process.stdout.write(`  ${r.mission}: exit=${r.exit} hasPlan=${r.hasPlan} hasExecution=${r.hasExecution}\n`);
  process.stdout.write(`TALLY: attempted=${t.attempted} runFailedBlocked=${JSON.stringify(t.runFailedBlocked)} measurableMissions=${t.measurableMissions} notMeasurable=${JSON.stringify(t.notMeasurableMissions)} excludedByOracle=${JSON.stringify(t.excludedByOracle)}\n`);
  process.stdout.write(`EXECUTED-AUTONOMY (objectives): verified ${t.objectiveNumeratorVerified}/${t.objectiveDenominator} = ${t.executedAutonomyPercentObjectives}% · categories=${JSON.stringify(t.categories)}\n`);
  process.exit(report.restoreVerified ? 0 : 1);
}

module.exports = { runPilot, tally, defaultRunner, snapshotGenerated, restoreGenerated, SAFE_MISSION_SET, PILOT_VERSION };
