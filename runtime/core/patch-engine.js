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

/*
 * Normalize an objective's optional `patch` payload into a list of concrete edits.
 *
 * This is what makes the Patch Plan REAL rather than symbolic: an edit carries a `target`
 * (the file to modify) plus exactly one payload — a full-file `content`, or a unified `diff`.
 * An objective may declare a single edit object or an array of them. Objectives with no patch
 * payload produce no edits and stay symbolic (PLANNED), exactly as before.
 *
 * Pure and order-preserving ⇒ deterministic: identical objectives yield identical edits.
 */
function normalizeEdits(objective) {
    if (!objective || !objective.patch) return [];
    const raw = Array.isArray(objective.patch) ? objective.patch : [objective.patch];
    const edits = [];
    for (const e of raw) {
        if (!e || typeof e !== "object") continue;
        const target =
            typeof e.target === "string" ? e.target :
            typeof e.path === "string" ? e.path :
            typeof e.file === "string" ? e.file : null;
        if (!target) continue;
        if (typeof e.content === "string") {
            edits.push({ target, content: e.content });
        } else if (typeof e.diff === "string") {
            edits.push({ target, diff: e.diff });
        }
    }
    return edits;
}

const patches = decision.actions.map((action, index) => {
    const objective = objectivesById.get(action) || null;
    const edits = normalizeEdits(objective);
    const patch = {
        id: index + 1,
        action,
        objectiveId: action,
        goal: objective ? objective.goal : "",
        done_when: objective ? objective.done_when : [],
        priority: decision.priority,
        status: edits.length ? "READY_TO_APPLY" : "PLANNED",
    };
    // Only real patches carry `edits`; symbolic patches keep their historical shape untouched.
    if (edits.length) patch.edits = edits;
    // Transport-only: carry the mission's research_acquisition authorization block onto each patch so
    // the self-gating capability executor (which runs before governance authorization) can read it
    // from its already-available patch payload. Absent ⇒ no key (other missions unaffected).
    if (decision.research_acquisition && typeof decision.research_acquisition === "object") {
        patch.research_acquisition = decision.research_acquisition;
    }
    return patch;
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
