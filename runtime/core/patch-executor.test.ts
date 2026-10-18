#!/usr/bin/env node
// @ts-nocheck — L5 bulk test migration (runtime/core): runs under tsx unchanged; suppresses tsc
// typechecking (NOT strict typing) — recorded migration debt (type later). See ODG_PROJECT_STATE.md.

/*
 * Patch Executor — RC-3 behavioural test (capability-resolution MISS made explicit).
 *
 * Black-box: runs the REAL patch-executor.js (and validation-engine.js / self-diagnostic.js) as
 * subprocesses in throwaway cwds, so no real tree is touched and no logic is duplicated. Proves the
 * minimal RC-3 change on main's TWO-case fallback:
 *   - WRITE-SCOPE unresolved objective ⇒ status STAYS "RECORDED" + an explicit non-empty reason;
 *   - READ-ONLY unresolved objective   ⇒ RECORDED, byte-identical shape (no reason);
 *   - case (a) BLOCKED/CAPABILITY_UNAVAILABLE + `needs` is UNCHANGED (no reason, not RECORDED);
 *   - a patch that resolves/applies (edits) never takes the fallback (no RC-3 reason) — normal path;
 *   - the existing Validation Engine STILL blocks the engineering RECORDED via noRecordedNoOp, and
 *     self-diagnostic (RC-4) STILL raises recorded-noop (gates not weakened, status not renamed).
 * Deterministic. No network / provider / autonomy flows.
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

// 1. WRITE-SCOPE objective, no executor + no edits ⇒ RECORDED + explicit reason (case b, write-scope).
{
  const dir = tmpWith({ "patch-plan.json": { mission: "RC3_ENG", authorizedPaths: ["runtime/core"], patches: [{ action: "MISSION_OBJECTIVE_STEP", objectiveId: "DO_WORK_1" }] } });
  const r = runExecutor(dir);
  ok("executor exits 0 (fallback is not a crash)", r.status === 0);
  const entry = readExec(dir).executed.find((x) => x.objectiveId === "DO_WORK_1");
  ok("write-scope fallback keeps status RECORDED (gates keep firing)", !!entry && entry.status === "RECORDED");
  ok("write-scope fallback carries an explicit non-empty reason", typeof entry.reason === "string" && entry.reason.length > 0);
  ok("no success fabricated (not EXECUTED/APPLIED/DONE)", entry.status !== "EXECUTED" && entry.status !== "APPLIED" && entry.status !== "DONE");
  fs.rmSync(dir, { recursive: true, force: true });
}

// 2. READ-ONLY objective (no authorized paths) ⇒ RECORDED, byte-identical shape (no reason).
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

// 3. case (a): a DECLARED capability requirement ⇒ BLOCKED + needs, UNCHANGED (no RC-3 reason).
{
  const dir = tmpWith({ "patch-plan.json": { mission: "RC3_CAP", authorizedPaths: ["runtime/core"], patches: [{ action: "MISSION_OBJECTIVE_STEP", objectiveId: "NEEDS_CAP_1", requiresCapability: true }] } });
  const r = runExecutor(dir);
  ok("executor exits 0", r.status === 0);
  const entry = readExec(dir).executed.find((x) => x.objectiveId === "NEEDS_CAP_1");
  ok("declared-capability miss ⇒ status BLOCKED (not RECORDED)", !!entry && entry.status === "BLOCKED");
  ok("case (a) carries decision CAPABILITY_UNAVAILABLE", entry.decision === "CAPABILITY_UNAVAILABLE");
  ok("case (a) uses `needs`, NOT `reason` (needs/reason not unified)", typeof entry.needs === "string" && !("reason" in entry));
  fs.rmSync(dir, { recursive: true, force: true });
}

// 4. NORMAL path unchanged: a patch carrying `edits` takes the EDITS branch (never the capability-miss
//    fallback), so it NEVER receives the RC-3 reason — regardless of whether the edit admits/applies.
{
  const diff = "--- /dev/null\n+++ b/runtime/core/rc3_fixture.txt\n@@ -0,0 +1 @@\n+hello\n";
  const dir = tmpWith({ "patch-plan.json": { mission: "RC3_EDIT", authorizedPaths: ["runtime/core"], patches: [{ action: "APPLY_EDIT", objectiveId: "EDIT_1", edits: [{ path: "runtime/core/rc3_fixture.txt", diff }] }] } });
  const r = runExecutor(dir);
  ok("executor exits 0 on an edits patch", r.status === 0);
  const executed = readExec(dir).executed;
  const tookFallbackReason = executed.some((e) => typeof e.reason === "string" && /no capability executor resolved/.test(e.reason));
  ok("an edits patch never takes the capability-miss fallback (no RC-3 reason anywhere)", tookFallbackReason === false);
  fs.rmSync(dir, { recursive: true, force: true });
}

// 5. Gate intact: Validation Engine STILL blocks the engineering RECORDED via noRecordedNoOp.
{
  const dir = tmpWith({
    "mission-plan.json": { mission: "RC3_ENG", requiresEngineering: true, authorizedPaths: ["runtime/core"], objectives: [{ id: "DO_WORK_1" }] },
    "patch-plan.json": { mission: "RC3_ENG", authorizedPaths: ["runtime/core"], patches: [{ action: "MISSION_OBJECTIVE_STEP", objectiveId: "DO_WORK_1" }] },
  });
  runExecutor(dir);
  const v = spawnSync(process.execPath, [VALIDATION], { cwd: dir, encoding: "utf8" });
  ok("validation BLOCKS the engineering RECORDED (exit non-zero)", v.status !== 0);
  const report = JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", "mission-report.json"), "utf8"));
  ok("validation verdict is BLOCKED / validated=false", report.status === "BLOCKED" && report.validated === false);
  ok("the firing gate is noRecordedNoOp (RECORDED status still caught, reason ignored)", report.checks.noRecordedNoOp === false);
  fs.rmSync(dir, { recursive: true, force: true });
}

console.log(`\nPatch Executor — ${passed} assertions passed.`);
