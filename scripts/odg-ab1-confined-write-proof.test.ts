/*
 * odg-ab1-confined-write-proof.test.ts — DURABLE, CI-safe reproduction of AB-1: a REAL executed-with-proof
 * confined write (distinct from the §AA.6 hermetic FIXTURE). It drives the GENUINE governed
 * "ODG Synthetic Deliverable" capability-executor (NO action-gate bypass; full confinement enforced) to
 * write ONE real file strictly inside a disposable temp sandbox, re-reads it from disk, verifies it with an
 * INDEPENDENT oracle (sha256 recompute + confinement + ODG authorship), and measures executed-autonomy via
 * the REAL buildAutonomyRate. CI-safe isolation: the capability resolves runtime/generated + confinement
 * RELATIVE TO process.cwd() (GENERATED_DIR = "runtime/generated"), so the test runs it under an mkdtemp cwd
 * — the repo's runtime/generated is never touched. The sandbox is removed and cwd restored in finally.
 * No provider, no network, no spend, no repo write.
 */
"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// Require the REAL modules with the repo cwd BEFORE chdir, so module-load resolves normally.
const ROOT = path.resolve(__dirname, "..");
const capExec = require(path.join(ROOT, "runtime/core/capability-executors.js"));
const bench = require(path.join(ROOT, "scripts/odg-live-autonomy-benchmark.js"));

let passed = 0;
function ok(name: string, cond: any) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const origCwd = process.cwd();
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "odg-ab1-"));
try {
  // Isolated sandbox cwd with its own runtime/generated + a dedicated confined scope dir.
  fs.mkdirSync(path.join(sandbox, "runtime/generated"), { recursive: true });
  const SCOPE_REL = "confined-ab1";
  fs.mkdirSync(path.join(sandbox, SCOPE_REL), { recursive: true });
  fs.writeFileSync(path.join(sandbox, "runtime/generated/patch-plan.json"),
    JSON.stringify({ mission: "AB1_PROOF", authorizedPaths: [SCOPE_REL], allowProtectedGovernance: false }));

  process.chdir(sandbox); // the capability reads/writes/ confines relative to cwd

  // 1. Resolve + run the REAL governed capability (confinement enforced internally).
  const executor = capExec.resolve({ objectiveId: "ODG_WRITE_AB1" });
  ok("resolves the real ODG Synthetic Deliverable capability", executor && executor.capability === "ODG Synthetic Deliverable");
  const run = executor.run({ objectiveId: "ODG_WRITE_AB1" });
  ok("run returns an evidence path + target summary", !!run.evidence && !!(run.summary && run.summary.target));

  // 2. INDEPENDENT ORACLE (re-read from disk; do not trust the executor's own return alone).
  const targetAbs = path.join(sandbox, SCOPE_REL, "odg-synthetic-manifest.txt");
  const evidence = JSON.parse(fs.readFileSync(path.join(sandbox, "runtime/generated/odg-synthetic-deliverable.json"), "utf8"));
  const fileExists = fs.existsSync(targetAbs);
  const diskContent = fileExists ? fs.readFileSync(targetAbs) : Buffer.from("");
  const diskSha = crypto.createHash("sha256").update(diskContent).digest("hex");
  const insideScope = fs.realpathSync(path.dirname(targetAbs)).startsWith(fs.realpathSync(path.join(sandbox, SCOPE_REL)));
  const EVIDENCED = fileExists && insideScope && evidence.sha256 === diskSha && evidence.authoredBy === "ODG_CAPABILITY" && diskContent.length > 0;
  ok("real file written on disk, non-empty", fileExists && diskContent.length > 0);
  ok("file confined inside the authorized scope dir", insideScope);
  ok("disk sha256 == capability evidence sha256 (independent)", evidence.sha256 === diskSha);
  ok("evidence authoredBy ODG_CAPABILITY", evidence.authoredBy === "ODG_CAPABILITY");
  ok("INDEPENDENT VERDICT = EVIDENCED", EVIDENCED === true);

  process.chdir(origCwd); // measurement is pure; restore cwd before it

  // 3. Measure via the REAL executed-autonomy benchmark. Execution record reflects the REAL run.
  const plan = { mission: "AB1_PROOF", objectives: [{ id: "ODG_WRITE_AB1", goal: "confined write", authorization: { eligible: true, authorized: true } }] };
  const execReal = { mission: "AB1_PROOF", executed: [{ objectiveId: "ODG_WRITE_AB1", status: "EXECUTED", authoredBy: evidence.authoredBy, appliedBy: "ODG_EXECUTOR" }] };
  const execRecorded = { mission: "AB1_PROOF", executed: [{ objectiveId: "ODG_WRITE_AB1", status: "RECORDED" }] };
  const attribution = EVIDENCED ? { objectives: [{ objectiveId: "ODG_WRITE_AB1", verdict: "EVIDENCED" }] } : { objectives: [] };

  const before = bench.executedBenchmark([{ mission: "AB1_PROOF", plan, execution: execRecorded }], {});
  const after = bench.executedBenchmark([{ mission: "AB1_PROOF", plan, execution: execReal }], { attribution });
  const control = bench.executedBenchmark([{ mission: "AB1_PROOF", plan, execution: execReal }], {}); // no EVIDENCED
  ok("BEFORE (RECORDED) numerator 0 / 0%", before.numerator === 0 && before.executedAutonomyPercent === 0);
  ok("AFTER (EXECUTED+EVIDENCED) numerator 1/1 = 100%", after.numerator === 1 && after.denominator === 1 && after.executedAutonomyPercent === 100);
  ok("AFTER classified ODG_EXECUTED_VERIFIED, oracle-clean", after.categories.ODG_EXECUTED_VERIFIED === 1 && after.countedMissions === 1);
  ok("CONTROL (EXECUTED, no EVIDENCED) numerator stays 0", control.numerator === 0 && control.categories.ODG_EXECUTED_UNVERIFIED === 1);
} finally {
  try { process.chdir(origCwd); } catch { /* best effort */ }
  fs.rmSync(sandbox, { recursive: true, force: true });
  ok("sandbox removed (cleanup verified)", !fs.existsSync(sandbox));
}

console.log(`\nAB-1 CONFINED-WRITE PROOF — ${passed} assertions passed.`);
export {};
