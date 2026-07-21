#!/usr/bin/env node

/*
 * Decision Engine — mission-driven.
 *
 * The decision is now derived from the loaded mission's OWN objectives (mission-plan.json), not from
 * a static, mission-independent list of repo-scan actions. Different missions therefore produce
 * different decisions (one action per objective, in contract order). The old hardcoded
 * PROCESS_TODOS / PROCESS_FIXMES / IMPLEMENT_MISSING_CAPABILITIES generation is removed; repo
 * metrics from knowledge.json are kept only as optional, non-driving context.
 *
 * Deterministic: output is a pure function of the mission plan (no wall-clock stamp).
 */

const fs = require("fs");

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

const plan = readJsonSafe("runtime/generated/mission-plan.json");
if (!plan || !Array.isArray(plan.objectives) || plan.objectives.length === 0) {
    console.error("STOP: mission-plan.json missing or has no objectives — Mission Loader must run first.");
    process.exit(1);
}

// Optional, non-driving repository context (best-effort).
const knowledge = readJsonSafe("runtime/generated/knowledge.json");
const metrics = knowledge && knowledge.project ? knowledge.project : null;

// One action per mission objective, in contract order. This is what makes execution mission-scoped.
const actions = plan.objectives.map((o) => o.id);

const result = {
    mission: plan.mission,
    mode: plan.mode,
    status: "READY",
    priority: plan.priority || "NORMAL",
    requiresEngineering: plan.requiresEngineering === true,
    authorizedPaths: Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [],
    actions,
    objectives: plan.objectives,
    metrics, // context only; does not influence actions
};

fs.mkdirSync("runtime/generated", { recursive: true });
fs.writeFileSync(
    "runtime/generated/decision.json",
    JSON.stringify(result, null, 2)
);

console.log("======================================");
console.log("DECISION ENGINE v4 (mission-driven)");
console.log("======================================");
console.log("Mission  :", result.mission);
console.log("Mode     :", result.mode);
console.log("Priority :", result.priority);
console.log("Actions  :", result.actions.length, "(one per objective)");
for (const a of result.actions) console.log(" -", a);
console.log("======================================");
