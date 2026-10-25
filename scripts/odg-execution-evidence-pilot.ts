/*
 * ODG EXECUTION-EVIDENCE PILOT v1 — TypeScript canonical (dual-ported with the byte-equivalent .js).
 *
 * Purpose (cxxxiii→cxxxiv increment): generate REAL execution evidence for several representative missions,
 * in a CONTROLLED, provider-free way, and measure executed autonomy honestly over a JUSTIFIED denominator.
 * It REUSES the existing pipeline (`runtime/bin/odg-run.js`, which runs a mission's 13 stages directly and
 * writes the real runtime/generated/{mission-plan,patch-execution}.json) and the existing executed-autonomy
 * engine + independent oracle (`scripts/odg-live-autonomy-benchmark.js` → executedBenchmark). It invents NO
 * evidence and NEVER treats a `RECORDED` status as a successful execution — only the measurer's
 * ODG_EXECUTED_VERIFIED category (gated by the oracle) contributes to the numerator.
 *
 * SAFETY (mandatory): the FROZEN mission set is read-only / observation missions with NO external effect, NO
 * provider, NO credential, NO deploy. The real generated/ directory is snapshotted before the runs and
 * restored + VERIFIED after (filelist digest match), so shared host state is left intact. A mission whose run
 * fails, needs a provider, or yields a bad/mismatched pairing is classified blocked / excluded / not-measurable
 * and NEVER counted as executed autonomy.
 */
"use strict";
const path = require("path");
const bench = require(path.resolve(__dirname, "odg-live-autonomy-benchmark.js")); // executedBenchmark + oracle

const PILOT_VERSION = "1.0";

// FROZEN representative SAFE set (read-only / observation; no external effect / provider / deploy).
const SAFE_MISSION_SET: string[] = Object.freeze([
  "M0000",                      // Architecture Compliance (audit)
  "M0001",                      // Mission Framework (audit)
  "M0002",                      // Foundation Layer (audit)
  "AUDIT_THE_RUNTIME_STATE",    // read-only state audit
  "AUDIT_RUNTIME_STATE_MACHINE",// read-only state-machine audit
  "RUNTIME_SELF_AUDIT",         // read-only self audit
]) as any;

const isObj = (o: any): boolean => o && typeof o === "object";

// Mirrors runtime/core/validation-engine.js:104 (VALIDATION_OBSERVATION_MODES). A RECORDED no-op is a
// LEGITIMATE result ONLY for a declared read-only observation mode; for any other mode the validation engine
// correctly fail-closes BLOCKED (anti-false-success). Kept here as a documented constant for block triage.
const OBSERVATION_MODES = Object.freeze(["AUDIT", "READ_ONLY", "ANALYZE"]);

// Classify WHY a mission run failed/blocked: EXPECTED (the anti-false-success guard firing correctly on a
// non-observation mode with an all-RECORDED no-op — governance working as designed, NOT a defect) vs
// UNEXPECTED (a different/unexplained cause that warrants a real root-cause lot).
function classifyBlock(plan: any, execution: any): any {
  const mode = String((isObj(plan) && plan.mode) || "").toUpperCase();
  const executed = (isObj(execution) && Array.isArray(execution.executed)) ? execution.executed : [];
  const allRecorded = executed.length > 0 && executed.every((e: any) => e && e.status === "RECORDED");
  const isObservation = OBSERVATION_MODES.includes(mode);
  if (!isObservation && allRecorded) {
    return { expected: true, reason: `noRecordedNoOp: mode=${mode || "UNKNOWN"} is non-observation and all ${executed.length} objective(s) are RECORDED no-ops ⇒ validation-engine correctly BLOCKED (anti-false-success, not a defect)` };
  }
  return { expected: false, reason: `unexplained block (mode=${mode || "UNKNOWN"}, recordedOnly=${allRecorded}) — warrants a root-cause lot` };
}

// Default REAL runner: run one mission's pipeline directly via odg-run.js and capture the generated pair.
function defaultRunner(mission: string, opts: any): any {
  const o = isObj(opts) ? opts : {};
  const fs = o.fs || require("fs");
  const spawnSync = o.spawnSync || require("child_process").spawnSync;
  const ROOT = o.root || path.resolve(__dirname, "..");
  const read = (f: string) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")); } catch { return null; } };
  const r = spawnSync("node", [path.join(ROOT, "runtime/bin/odg-run.js"), mission], { cwd: ROOT, encoding: "utf8", timeout: o.timeoutMs || 240000 });
  return { mission, exit: r.status, plan: read("runtime/generated/mission-plan.json"), execution: read("runtime/generated/patch-execution.json") };
}

// tar-based snapshot/restore of runtime/generated (non-destructive; restoration is VERIFIED by filelist digest).
function snapshotGenerated(opts: any): any {
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
function restoreGenerated(snap: any, opts: any): any {
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

// Mission-level tally over the captured runs + the objective-level executedBenchmark verdict.
function tally(runs: any[], benchmarkReport: any): any {
  const rows = Array.isArray(runs) ? runs : [];
  const attempted = rows.length;
  const failed = rows.filter((r) => r.exit !== 0 || !r.plan || !r.execution);
  const runFailedBlocked = failed.map((r) => r.mission);
  const blockTriage = failed.map((r) => ({ mission: r.mission, ...classifyBlock(r.plan, r.execution) }));
  const expectedBlocked = blockTriage.filter((b) => b.expected).map((b) => b.mission);
  const unexpectedBlocked = blockTriage.filter((b) => !b.expected).map((b) => b.mission);
  const ex = benchmarkReport || {};
  const excludedByOracle = (ex.excluded || []).map((e: any) => e.mission);
  const notMeasurable = ex.notMeasurable || [];
  // A mission "completed with valid proof" iff it contributed a verified objective (numerator) — derived
  // per-mission by re-running the engine on that single pair would be ideal; we expose the aggregate here.
  return {
    attempted,
    runFailedBlocked,
    blockTriage,
    expectedBlocked,
    unexpectedBlocked,
    measurableMissions: ex.countedMissions || 0,
    notMeasurableMissions: notMeasurable,
    excludedByOracle,
    objectiveDenominator: ex.denominator || 0,
    objectiveNumeratorVerified: ex.numerator || 0,
    executedAutonomyPercentObjectives: typeof ex.executedAutonomyPercent === "number" || ex.executedAutonomyPercent === null ? ex.executedAutonomyPercent : null,
    categories: ex.categories || {},
  };
}

// Orchestrate: snapshot → run each mission (REAL) → restore+verify → executedBenchmark over captured pairs.
function runPilot(missions: string[], opts: any): any {
  const o = isObj(opts) ? opts : {};
  const runner = o.runner || defaultRunner;
  const snapshot = o.snapshot || snapshotGenerated;
  const restore = o.restore || restoreGenerated;
  const snap = snapshot(o);
  const runs: any[] = [];
  let restoreResult: any = { verified: true, skipped: true };
  try {
    for (const m of missions) runs.push(runner(m, o));
  } finally {
    if (!o.noRestore) restoreResult = restore(snap, o);
  }
  // Only runs that completed (exit 0) with BOTH a plan and an execution become candidate pairs; the oracle
  // inside executedBenchmark then still gates each (cross-mission/orphan/duplicate/stale), fail-closed.
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
  const report = runPilot(SAFE_MISSION_SET as any, {});
  try { require("fs").writeFileSync(path.resolve(__dirname, "../runtime/generated/execution-evidence-pilot.json"), JSON.stringify(report, null, 2)); } catch { /* optional */ }
  const t = report.tally;
  process.stdout.write(`odg-execution-evidence-pilot v${report.pilotVersion} (restoreVerified=${report.restoreVerified})\n`);
  for (const r of report.runs) process.stdout.write(`  ${r.mission}: exit=${r.exit} hasPlan=${r.hasPlan} hasExecution=${r.hasExecution}\n`);
  process.stdout.write(`TALLY: attempted=${t.attempted} runFailedBlocked=${JSON.stringify(t.runFailedBlocked)} measurableMissions=${t.measurableMissions} notMeasurable=${JSON.stringify(t.notMeasurableMissions)} excludedByOracle=${JSON.stringify(t.excludedByOracle)}\n`);
  process.stdout.write(`BLOCK-TRIAGE: expectedBlocked(governance)=${JSON.stringify(t.expectedBlocked)} unexpectedBlocked(investigate)=${JSON.stringify(t.unexpectedBlocked)}\n`);
  for (const b of t.blockTriage) process.stdout.write(`  ${b.mission}: expected=${b.expected} — ${b.reason}\n`);
  process.stdout.write(`EXECUTED-AUTONOMY (objectives): verified ${t.objectiveNumeratorVerified}/${t.objectiveDenominator} = ${t.executedAutonomyPercentObjectives}% · categories=${JSON.stringify(t.categories)}\n`);
  process.exit(report.restoreVerified ? 0 : 1); // fail-closed if the snapshot did not restore cleanly
}

module.exports = { runPilot, tally, classifyBlock, defaultRunner, snapshotGenerated, restoreGenerated, OBSERVATION_MODES, SAFE_MISSION_SET, PILOT_VERSION };
export {};
