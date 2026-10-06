#!/usr/bin/env node

/*
 * Mission Context Builder — the single, OFFICIAL source of a mission's context.
 *
 * MISSION_CONTEXT_BUILDER deliverable. Before this module every stage assembled the mission's
 * context ad-hoc: the mission side lived in runtime/generated/mission-plan.json (Mission Loader)
 * and the repository side lived in runtime/generated/runtime-context.json (Project Context Engine,
 * read through runtime-context-loader). No engine held ONE coherent view of "the context of this
 * mission", so any consumer (Capability Registry, Policy Engine, Engineering Brief Generator) had
 * to re-derive it, risking drift.
 *
 * MissionContextBuilder composes those two EXISTING official sources into a single MissionContext.
 * It deliberately does NOT re-scan the repository or re-parse the contract itself — it REUSES the
 * Mission Loader's mission-plan.json and the runtime-context-loader's RuntimeContext, so "no engine
 * rebuilds its own context" (OBJ-002) holds and no public contract changes (OBJ-003).
 *
 * Deterministic: given the same mission-plan and RuntimeContext, buildMissionContext() is a pure
 * function (no wall-clock stamp), so an identical mission yields an identical MissionContext.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const assembler = require("./expert-profile-assembler"); // durable profile → §303 Expert Instance (read-only)

const VERSION = "1.0.0";
const SOURCE = "MissionContextBuilder";

/**
 * Load the mission plan — the Mission Loader's OFFICIAL output. Prefer the already-generated
 * mission-plan.json (the single mission source); regenerate it via the Mission Loader only if it is
 * absent or belongs to a different mission. Never re-parses the contract independently.
 */
function loadMissionPlan(cwd, mission) {
    const planPath = path.join(cwd, "runtime", "generated", "mission-plan.json");

    if (fs.existsSync(planPath)) {
        const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
        if (!mission || plan.mission === mission) {
            return plan;
        }
    }

    const loader = path.join(cwd, "runtime", "core", "mission-loader.js");
    const r = spawnSync("node", [loader, mission], { cwd, encoding: "utf8" });
    if (r.status !== 0 || !fs.existsSync(planPath)) {
        throw new Error(`MissionContextBuilder: unable to load mission plan for "${mission}".`);
    }
    return JSON.parse(fs.readFileSync(planPath, "utf8"));
}

/**
 * Load the RuntimeContext — the repository analysis — through the EXISTING single source
 * (runtime-context-loader). `mode` controls how aggressive we are:
 *   - "full"       : ensure a complete RuntimeContext (loadRuntimeContext generates it if missing).
 *   - "cache-only" : attach the cached RuntimeContext if present, otherwise leave it unresolved.
 *                    Used by lightweight callers (e.g. the Mission Loader integration) that must
 *                    stay fast and must never spawn a repository scan.
 */
function loadRuntime(cwd, mission, mode) {
    if (mode === "cache-only") {
        const cache = path.join(cwd, "runtime", "generated", "runtime-context.json");
        if (!fs.existsSync(cache)) {
            return null;
        }
        return JSON.parse(fs.readFileSync(cache, "utf8"));
    }

    // "full": defer to the one official loader so the repository is analysed exactly once.
    const { loadRuntimeContext } = require("./runtime-context-loader");
    return loadRuntimeContext(mission);
}

/**
 * Build the single official MissionContext for a mission.
 *
 * @param {string} mission                Mission name.
 * @param {object} [opts]
 * @param {string} [opts.cwd]             Repository root (default: process.cwd()).
 * @param {"full"|"cache-only"} [opts.runtime]  RuntimeContext acquisition mode (default "full").
 * @param {boolean} [opts.write]          Write runtime/generated/mission-context.json (default false).
 * @param {function} [opts.loadPlan]      Injectable plan loader (mission) => plan. For tests.
 * @param {function} [opts.loadRuntime]   Injectable runtime loader (mission) => RuntimeContext. For tests.
 * @returns {object} MissionContext
 */
function buildMissionContext(mission, opts = {}) {
    if (typeof mission !== "string" || mission.trim() === "") {
        throw new Error("MissionContextBuilder: a mission name is required.");
    }

    const cwd = opts.cwd || process.cwd();
    const runtimeMode = opts.runtime || "full";

    const plan = opts.loadPlan ? opts.loadPlan(mission) : loadMissionPlan(cwd, mission);
    const runtime = opts.loadRuntime
        ? opts.loadRuntime(mission)
        : loadRuntime(cwd, mission, runtimeMode);

    const project = runtime && runtime.project ? runtime.project : null;
    const runtimeComplete = Boolean(
        project &&
        typeof project.files === "number" &&
        typeof project.directories === "number"
    );

    // §304→§303: a declarative, mission-scoped Expert Instance attached to the one official
    // MissionContext. READ-ONLY metadata — nothing in the runtime currently reads MissionContext,
    // so this field is inert (it introduces no enforcement and changes no Resolver/Allocator/
    // Executor/Verification semantics). Profile selection reuses the EXISTING mission signal:
    // an explicitly declared plan.expertProfile ("ECONOMIC"/"ENGINEERING") if present, else
    // requiresEngineering ⇒ ENGINEERING (the default software-executor profile). No authority is
    // invented: the runtime carries no authority verb-array, so authority is the empty set and
    // authority_scope stays [] (§307 — authority is never self-granted from the profile).
    let expertInstance = null;
    try {
        const declared = typeof plan.expertProfile === "string" ? plan.expertProfile.toUpperCase() : null;
        const profileId = declared === "ECONOMIC" ? "economic" : "engineering";
        const profile = assembler.loadProfile(`runtime/profiles/${profileId}.json`);
        const objectives = Array.isArray(plan.objectives) ? plan.objectives : [];
        expertInstance = assembler.compileInstance(profile, {
            mission_id: mission,
            objective_id: plan.nextObjective || (objectives[0] && objectives[0].id) || null,
            authority: [],
            expected_output: Array.isArray(plan.definitionOfDone) ? plan.definitionOfDone : [],
        });
    } catch (e) {
        expertInstance = null;
    }

    const context = {
        version: VERSION,
        source: SOURCE,
        mission,

        // --- Mission dimension (from the Mission Loader's official plan) ---------------------
        mode: plan.mode || "SEQUENTIAL",
        priority: plan.priority || "NORMAL",
        requiresEngineering: plan.requiresEngineering === true,
        authorizedPaths: Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [],
        objectives: Array.isArray(plan.objectives) ? plan.objectives : [],
        nextObjective: plan.nextObjective || null,
        definitionOfDone: Array.isArray(plan.definitionOfDone) ? plan.definitionOfDone : [],
        completion: Array.isArray(plan.completion) ? plan.completion : [],
        expertInstance,
        contract: {
            path: plan.source || null,
            status: plan.status || null,
        },

        // --- Repository dimension (from the one RuntimeContext source) -----------------------
        runtime: project
            ? {
                  root: project.root || null,
                  files: project.files,
                  directories: project.directories,
                  version: runtime.version || null,
              }
            : null,
        runtimeComplete,

        // --- Working channels every consumer can rely on -------------------------------------
        results: [],
        logs: [],
        errors: [],
    };

    if (opts.write) {
        const out = path.join(cwd, "runtime", "generated", "mission-context.json");
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, JSON.stringify(context, null, 2));
    }

    return context;
}

module.exports = { buildMissionContext, VERSION, SOURCE };

// ---------------------------------------------------------------------------------------------
// CLI: `node runtime/core/mission-context-builder.js <MISSION>` — emit the official MissionContext.
// ---------------------------------------------------------------------------------------------
if (require.main === module) {
    const mission = process.argv[2];
    if (!mission) {
        console.error("STOP: Missing mission name");
        process.exit(1);
    }

    let context;
    try {
        context = buildMissionContext(mission, { write: true });
    } catch (err) {
        console.error("======================================");
        console.error("MISSION CONTEXT BUILDER");
        console.error("======================================");
        console.error("BLOCKED:", err.message);
        console.error("======================================");
        process.exit(1);
    }

    console.log("======================================");
    console.log("MISSION CONTEXT BUILDER");
    console.log("======================================");
    console.log("Mission    :", context.mission);
    console.log("Source     :", context.source, "v" + context.version);
    console.log("Objectives :", context.objectives.length);
    console.log("Next       :", context.nextObjective || "-");
    console.log("Mode       :", context.mode);
    console.log("Runtime    :", context.runtimeComplete
        ? `${context.runtime.files} files / ${context.runtime.directories} dirs`
        : "not resolved");
    console.log("Output     : runtime/generated/mission-context.json");
    console.log("======================================");
}
