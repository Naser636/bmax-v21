#!/usr/bin/env node

/* External Research — authorization TRANSPORT test (end-to-end, network-independent).
 *
 * Proves the research_acquisition block flows verbatim through the real pipeline stages:
 *   mission JSON → mission-loader → mission-plan.json → decision-engine → decision.json
 *   → patch-engine → patch-plan.json (onto the patch the capability executor reads).
 * Runs each stage as its real subprocess in a throwaway cwd. No network. Also proves a mission
 * WITHOUT the block is byte-for-byte unaffected (no stray key). */

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { spawnSync } = require("child_process");

let passed = 0;
function ok(name, cond) { assert.ok(cond, name); console.log("  ok -", name); passed += 1; }

const LOADER = path.resolve(__dirname, "mission-loader.js");
const DECISION = path.resolve(__dirname, "decision-engine.js");
const PATCH = path.resolve(__dirname, "patch-engine.js");

function runStage(script, args, dir) {
    const res = spawnSync(process.execPath, [script, ...args], { cwd: dir, encoding: "utf8" });
    if (res.status !== 0) {
        throw new Error(`stage ${path.basename(script)} failed (status=${res.status}): ${res.stderr || res.stdout}`);
    }
    return res;
}

function withPipeline(contract, fn) {
    const prev = process.cwd();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "er-transport-"));
    try {
        fs.mkdirSync(path.join(dir, "runtime", "missions"), { recursive: true });
        fs.mkdirSync(path.join(dir, "runtime", "generated"), { recursive: true });
        fs.writeFileSync(path.join(dir, "runtime", "missions", `${contract.mission}.json`), JSON.stringify(contract, null, 2));
        runStage(LOADER, [contract.mission], dir);
        runStage(DECISION, [], dir);
        runStage(PATCH, [], dir);
        const read = (p) => JSON.parse(fs.readFileSync(path.join(dir, "runtime", "generated", p), "utf8"));
        fn({ plan: read("mission-plan.json"), decision: read("decision.json"), patchPlan: read("patch-plan.json") });
    } finally {
        process.chdir(prev);
    }
}

// 1. A research mission transports research_acquisition all the way onto the patch.
withPipeline({
    mission: "TRANSPORT_FIXTURE_RESEARCH",
    mode: "ENGINEERING",
    requires_engineering: true,
    authorized_paths: ["runtime/core/capability-executors.js"],
    objectives: [{ id: "EXTERNAL_RESEARCH_1", goal: "Add governed external research executor", done_when: ["x"] }],
    research_acquisition: { authorized: false, execute: false, source_allowlist: ["https://a.test"] },
}, ({ plan, decision, patchPlan }) => {
    ok("mission-loader carried research_acquisition into mission-plan.json", plan.research_acquisition && plan.research_acquisition.authorized === false);
    ok("decision-engine carried research_acquisition into decision.json", decision.research_acquisition && Array.isArray(decision.research_acquisition.source_allowlist));
    const p = patchPlan.patches.find((x) => x.objectiveId === "EXTERNAL_RESEARCH_1");
    ok("patch-engine carried research_acquisition onto the EXTERNAL_RESEARCH_ patch", p && p.research_acquisition && p.research_acquisition.authorized === false);
    ok("transported allowlist is intact on the patch", p.research_acquisition.source_allowlist[0] === "https://a.test");
});

// 2. A mission WITHOUT the block is unaffected (no stray research_acquisition key anywhere).
withPipeline({
    mission: "TRANSPORT_FIXTURE_PLAIN",
    mode: "ENGINEERING",
    requires_engineering: true,
    authorized_paths: ["runtime/core/x.js"],
    objectives: [{ id: "PLAIN_1", goal: "Do a plain thing", done_when: ["x"] }],
}, ({ plan, decision, patchPlan }) => {
    ok("plan has no research_acquisition key", !("research_acquisition" in plan));
    ok("decision has no research_acquisition key", !("research_acquisition" in decision));
    ok("patch has no research_acquisition key (backward compatible)", patchPlan.patches.every((p) => !("research_acquisition" in p)));
});

console.log(`\nExternal Research Transport — ${passed} assertions passed.`);
