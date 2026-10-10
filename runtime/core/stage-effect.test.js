#!/usr/bin/env node

/*
 * Stage Effect Gate (RC-1) — behavioural test.
 *
 * Asserts the CONTRACT: a declared stage is DONE-eligible only when its output artifact exists and is
 * non-empty; an undeclared stage is always DONE-eligible (historical exit-0 => DONE preserved). Runs
 * against a throwaway generated dir — no real tree touched. Deterministic.
 */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const { STAGE_OUTPUTS, stageEffectOk } = require("./stage-effect");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

console.log("Stage Effect Gate — RC-1");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stage-effect-"));

// 1. Declared stage WITH a non-empty artifact ⇒ effect OK (DONE-eligible).
fs.writeFileSync(path.join(dir, "patch-execution.json"), JSON.stringify({ executed: [] }));
ok("declared stage with a non-empty artifact ⇒ effect present", stageEffectOk("Patch Executor", dir) === true);

// 2. Declared stage with an ABSENT artifact ⇒ effect MISSING (would HALT, never DONE).
ok("declared stage with no artifact ⇒ effect missing", stageEffectOk("Validation Engine", dir) === false);

// 3. Declared stage with an EMPTY (size 0) artifact ⇒ effect MISSING.
fs.writeFileSync(path.join(dir, "mission-report.json"), "");
ok("declared stage with an empty artifact ⇒ effect missing", stageEffectOk("Validation Engine", dir) === false);
// ... and once it is non-empty, it is present.
fs.writeFileSync(path.join(dir, "mission-report.json"), JSON.stringify({ status: "SUCCESS" }));
ok("declared stage becomes present when the artifact is non-empty", stageEffectOk("Validation Engine", dir) === true);

// 4. UNDECLARED stage (conditional / non-blocking) ⇒ always DONE-eligible (behaviour preserved).
ok("undeclared stage (Fleet Bridge) is unconstrained", stageEffectOk("Fleet Bridge", dir) === true);
ok("undeclared stage (Final Report) is unconstrained", stageEffectOk("Final Report", dir) === true);
ok("undeclared stage (ProjectContext Engine) is unconstrained", stageEffectOk("ProjectContext Engine", dir) === true);

// 5. The critical no-op stage and the governance stages are declared.
ok("Patch Executor is a declared (gated) stage", STAGE_OUTPUTS["Patch Executor"] === "patch-execution.json");
ok("Validation Engine is a declared (gated) stage", STAGE_OUTPUTS["Validation Engine"] === "mission-report.json");
ok("Mission Ledger is a declared (gated) stage", STAGE_OUTPUTS["Mission Ledger"] === "mission-ledger.json");

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\nStage Effect Gate — ${passed} assertions passed.`);
