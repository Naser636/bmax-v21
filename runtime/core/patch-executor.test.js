#!/usr/bin/env node

/*
 * Patch Executor — RC-3 behavioural test (capability-resolution MISS made explicit).
 *
 * Black-box: runs the REAL patch-executor.js (and validation-engine.js) as subprocesses in throwaway
 * cwds, so no real tree is touched and no logic is duplicated. Proves:
 *   - a WRITE-SCOPE objective with no executor + no edits ⇒ status STAYS "RECORDED" + an explicit reason
 *     (no success fabricated, no new capability);
 *   - a READ-ONLY objective ⇒ RECORDED with the exact same shape as before (no reason);
 *   - the existing Validation Engine STILL blocks the engineering RECORDED via noRecordedNoOp (the gate
 *     is not weakened — the status was deliberately NOT renamed).
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PATCH_EXECUTOR = path.join(REPO, "runtime", "core", "patch-executor.js");
const VALIDATION = path.join(REPO, "runtime", "core", "validation-engine.js");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

function tmpWith(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "patch-exec-"));
  fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
  for (const [name, obj] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, "runtime", "generated", name), typeof obj === "string" ? obj : JSON.stringify(obj));
  }
  return dir;
}
const runExecutor = (dir) => spawnSync(process.execPath, [PATCH_EXECUTOR], { cwd: dir, encoding: "utf8" });
const readExec = (dir) => JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "patch-execution.json"), "utf8"));

console.log("Patch Executor — RC-3 fallback (capability-resolution miss made explicit)");

// 1. Engineering (write-scope) objective, no executor + no edits ⇒ RECORDED + explicit reason.
{
  const dir = tmpWith({ "patch-plan.json": { mission: "RC3_ENG", authorizedPaths: ["runtime/core"], patches: [{ action: "MISSION_OBJECTIVE_STEP", objectiveId: "DO_WORK_1" }] } });
  const r = runExecutor(dir);
  ok("executor exits 0 (fallback is not a crash)", r.status === 0);
  const entry = readExec(dir).executed.find((x) => x.objectiveId === "DO_WORK_1");
  ok("fallback keeps status RECORDED (gates keep firing)", !!entry && entry.status === "RECORDED");
  ok("engineering fallback carries an explicit non-empty reason", typeof entry.reason === "string" && entry.reason.length > 0);
  ok("no success fabricated (not EXECUTED/APPLIED/DONE)", entry.status !== "EXECUTED" && entry.status !== "APPLIED" && entry.status !== "DONE");
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2. Read-only objective (no authorized paths) ⇒ RECORDED, byte-identical shape (no reason).
{
  const dir = tmpWith({ "patch-plan.json": { mission: "RC3_RO", authorizedPaths: [], patches: [{ action: "MISSION_OBJECTIVE_STEP", objectiveId: "PLAN_1" }] } });
  const r = runExecutor(dir);
  ok("executor exits 0", r.status === 0);
  const entry = readExec(dir).executed.find((x) => x.objectiveId === "PLAN_1");
  ok("read-only fallback stays RECORDED", !!entry && entry.status === "RECORDED");
  ok("read-only fallback adds NO reason (behaviour unchanged)", !("reason" in entry));
  ok("read-only fallback keys unchanged {action,objectiveId,status}", JSON.stringify(Object.keys(entry).sort()) === JSON.stringify(["action", "objectiveId", "status"]));
  fs.rmSync(dir, { recursive: true, force: true });
}

// 3. The existing Validation Engine STILL blocks the engineering RECORDED (gate not weakened).
{
  const dir = tmpWith({
    "mission-plan.json": { mission: "RC3_ENG", requiresEngineering: true, authorizedPaths: ["runtime/core"], objectives: [{ id: "DO_WORK_1" }] },
    "patch-plan.json": { mission: "RC3_ENG", authorizedPaths: ["runtime/core"], patches: [{ action: "MISSION_OBJECTIVE_STEP", objectiveId: "DO_WORK_1" }] },
  });
  runExecutor(dir); // produce patch-execution.json via the real executor
  const v = spawnSync(process.execPath, [VALIDATION], { cwd: dir, encoding: "utf8" });
  ok("validation BLOCKS the engineering RECORDED (exit non-zero)", v.status !== 0);
  const report = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "mission-report.json"), "utf8"));
  ok("validation verdict is BLOCKED", report.status === "BLOCKED" && report.validated === false);
  ok("the firing gate is noRecordedNoOp (RECORDED status still caught)", report.checks.noRecordedNoOp === false);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nPatch Executor — ${passed} assertions passed.`);
