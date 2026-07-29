#!/usr/bin/env node

/*
 * Mission Context Builder — contract test.
 *
 * Asserts the CONTRACT of the single official MissionContext source, not its implementation. Uses
 * injected plan/runtime loaders so the test is fast, deterministic and touches no real filesystem:
 *
 *   1. Single official source     → every MissionContext is stamped source === "MissionContextBuilder".
 *   2. Mission dimension          → objectives/mode/priority/nextObjective come straight from the
 *                                    Mission Loader's plan (public plan shape is preserved verbatim).
 *   3. Repository dimension       → RuntimeContext.project is projected and marked complete.
 *   4. RuntimeContext is complete  → files/directories are surfaced; runtimeComplete === true.
 *   5. cache-only mode never scans → an absent RuntimeContext yields runtime=null without spawning.
 *   6. Guard                       → an empty mission name is rejected.
 */

"use strict";

const assert = require("assert");
const { buildMissionContext, SOURCE } = require("./mission-context-builder");

let passed = 0;
function ok(name, cond) {
    assert.ok(cond, name);
    console.log("  ok -", name);
    passed += 1;
}

// --- Fixtures: exactly the shapes the real loaders emit ------------------------------------------
const PLAN = {
    mission: "MISSION_CONTEXT_BUILDER",
    source: "runtime/missions/MISSION_CONTEXT_BUILDER.json",
    priority: "CRITICAL",
    mode: "ENGINEERING",
    requiresEngineering: true,
    authorizedPaths: ["runtime/**"],
    objectives: [
        { id: "OBJ-001", goal: "Créer MissionContextBuilder.", done_when: ["MissionContextBuilder existe."] },
        { id: "OBJ-002", goal: "Construire RuntimeContext.", done_when: ["Le dépôt est analysé."] },
    ],
    nextObjective: "OBJ-001",
    definitionOfDone: [],
    completion: [],
    status: "READY_FOR_EXECUTION",
};

const RUNTIME = {
    version: "1.0.0",
    project: { root: "/repo", files: 2997, directories: 281, errors: [] },
};

// 1 + 2 + 3 + 4 — full build from injected official sources
const ctx = buildMissionContext("MISSION_CONTEXT_BUILDER", {
    loadPlan: () => PLAN,
    loadRuntime: () => RUNTIME,
});

ok("stamped as the single official source", ctx.source === SOURCE);
ok("carries the mission name", ctx.mission === "MISSION_CONTEXT_BUILDER");
ok("mission dimension: objectives preserved from plan", ctx.objectives.length === 2 && ctx.objectives[0].id === "OBJ-001");
ok("mission dimension: mode/priority/next preserved", ctx.mode === "ENGINEERING" && ctx.priority === "CRITICAL" && ctx.nextObjective === "OBJ-001");
ok("mission dimension: authorized paths + contract pointer", ctx.authorizedPaths[0] === "runtime/**" && ctx.contract.path.endsWith("MISSION_CONTEXT_BUILDER.json"));
ok("repository dimension: RuntimeContext projected", ctx.runtime && ctx.runtime.files === 2997 && ctx.runtime.directories === 281);
ok("RuntimeContext is complete", ctx.runtimeComplete === true);
ok("working channels present", Array.isArray(ctx.results) && Array.isArray(ctx.logs) && Array.isArray(ctx.errors));

// 5 — cache-only never scans: missing RuntimeContext ⇒ runtime null, still a valid MissionContext
const partial = buildMissionContext("MISSION_CONTEXT_BUILDER", {
    loadPlan: () => PLAN,
    loadRuntime: () => null,
});
ok("cache-only tolerates an unresolved RuntimeContext", partial.runtime === null && partial.runtimeComplete === false);
ok("mission dimension still intact without runtime", partial.objectives.length === 2 && partial.source === SOURCE);

// 6 — guard
let threw = false;
try {
    buildMissionContext("");
} catch (e) {
    threw = true;
}
ok("rejects an empty mission name", threw === true);

console.log(`\nMission Context Builder — ${passed} assertions passed.`);
