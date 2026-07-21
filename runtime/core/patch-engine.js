#!/usr/bin/env node

/*
 * Patch Engine — mission-driven, deterministic.
 *
 * Produces a REAL Patch Plan for the loaded mission: one planned patch per mission objective,
 * carrying that objective's id, goal and done_when clauses. The plan is derived from the mission's
 * own decision (decision.json) — not from a generic repo scan — so the Patch Plan of mission X
 * differs from the Patch Plan of mission Y.
 *
 * Deterministic: no wall-clock stamp. Identical mission ⇒ identical patch-plan.json.
 */

const fs = require("fs");

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

const decision = readJsonSafe("runtime/generated/decision.json");
if (!decision || !Array.isArray(decision.objectives)) {
    console.error("STOP: decision.json missing or malformed — Decision Engine must run first.");
    process.exit(1);
}

const objectivesById = new Map(decision.objectives.map((o) => [o.id, o]));

const patches = decision.actions.map((action, index) => {
    const objective = objectivesById.get(action) || null;
    return {
        id: index + 1,
        action,
        objectiveId: action,
        goal: objective ? objective.goal : "",
        done_when: objective ? objective.done_when : [],
        priority: decision.priority,
        status: "PLANNED",
    };
});

const patch = {
    mission: decision.mission,
    mode: decision.mode,
    status: "READY",
    priority: decision.priority,
    requiresEngineering: decision.requiresEngineering === true,
    authorizedPaths: Array.isArray(decision.authorizedPaths) ? decision.authorizedPaths : [],
    actions: decision.actions,
    summary: {
        objectives: decision.objectives.length,
        plannedPatches: patches.length,
    },
    patches,
};

fs.mkdirSync("runtime/generated", { recursive: true });
fs.writeFileSync(
    "runtime/generated/patch-plan.json",
    JSON.stringify(patch, null, 2)
);

console.log("======================================");
console.log("PATCH ENGINE v4 (mission-driven)");
console.log("======================================");
console.log("Mission  :", patch.mission);
console.log("Priority :", patch.priority);
console.log("Patches  :", patch.patches.length);
for (const p of patch.patches) console.log(` - #${p.id} ${p.objectiveId}`);
console.log("======================================");
