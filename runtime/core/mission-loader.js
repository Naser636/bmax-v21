#!/usr/bin/env node

/*
 * Mission Loader — mission-driven.
 *
 * Loads the REAL mission contract from runtime/missions/<MISSION>.json and projects it into
 * runtime/generated/mission-plan.json for the downstream stages. It NO LONGER emits the generic
 * MASTER_PLAN capability list for every mission (the "generic replay" blockage): the objectives,
 * definition_of_done, completion, mode, priority and authorized paths all come from the mission's
 * own contract.
 *
 * When no contract exists the pipeline STOPS with an explicit, human-actionable blocker instead of
 * fabricating a generic "READY_FOR_EXECUTION" plan — so a mission can no longer be silently faked.
 *
 * Deterministic: the output is a pure function of the contract file (no wall-clock stamp), so an
 * identical mission produces an identical mission-plan.json (DETERMINISM_FIRST / reproducible).
 */

const fs = require("fs");
const path = require("path");

const mission = process.argv[2];

if (!mission) {
    console.error("STOP: Missing mission name");
    process.exit(1);
}

const CONTRACT_PATH = path.join("runtime", "missions", `${mission}.json`);

if (!fs.existsSync(CONTRACT_PATH)) {
    console.error("======================================");
    console.error("MISSION LOADER");
    console.error("======================================");
    console.error(`BLOCKED: no mission contract for "${mission}".`);
    console.error(`Expected a real mission definition at: ${CONTRACT_PATH}`);
    console.error("The Runtime no longer replays a generic pipeline for undefined missions.");
    console.error("Author the mission contract (or add it to the roadmap manifest) and re-run.");
    console.error("======================================");
    process.exit(1);
}

let spec;
try {
    spec = JSON.parse(fs.readFileSync(CONTRACT_PATH, "utf8"));
} catch (err) {
    console.error(`STOP: mission contract ${CONTRACT_PATH} is not valid JSON: ${err.message}`);
    process.exit(1);
}

// --- Normalize the contract's objectives into a single, stable shape -------
// A mission objective is either a plain string (goal only) or an object
// { id?, goal?, done_when? }. Both existing shapes in runtime/missions/*.json are supported.
function slug(value, fallback) {
    const s = String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    return s || fallback;
}

function asStrings(value) {
    return Array.isArray(value) ? value.filter((s) => typeof s === "string") : [];
}

const rawObjectives = Array.isArray(spec.objectives) ? spec.objectives : [];
const objectives = rawObjectives.map((o, i) => {
    if (typeof o === "string") {
        return { id: `${slug(mission, "OBJ")}_${i + 1}`, goal: o, done_when: [] };
    }
    const normalized = {
        id: typeof o.id === "string" ? o.id : `${slug(mission, "OBJ")}_${i + 1}`,
        goal: typeof o.goal === "string" ? o.goal : "",
        done_when: asStrings(o.done_when),
    };
    // Optional concrete edit payload for engineering objectives. Preserved verbatim so the
    // Patch Engine can turn a symbolic objective into a real, file-modifying patch. Absent on
    // legacy/read-only objectives, which stay symbolic (backward compatible).
    if (o.patch && typeof o.patch === "object") {
        normalized.patch = o.patch;
    }
    return normalized;
});

if (objectives.length === 0) {
    console.error(`STOP: mission contract ${CONTRACT_PATH} declares no objectives.`);
    process.exit(1);
}

const authorizedPaths = asStrings(spec.authorized_paths ?? spec.authorizedPaths);
const requiresEngineering =
    spec.requires_engineering === true ||
    spec.requiresEngineering === true ||
    authorizedPaths.length > 0;

const plan = {
    mission,
    source: CONTRACT_PATH,
    priority: typeof spec.priority === "string" ? spec.priority : "NORMAL",
    mode: typeof spec.mode === "string" ? spec.mode : "SEQUENTIAL",
    requiresEngineering,
    authorizedPaths,
    objectives,
    nextObjective: objectives[0].id,
    definitionOfDone: asStrings(spec.definition_of_done),
    completion: asStrings(spec.completion),
    status: "READY_FOR_EXECUTION",
};

// Optional machine-checkable capability probes (spec.verify). Each entry is
// { capability, evidence } where `evidence` names a probe the Validation Engine knows how to run
// against real generated artifacts. Absent on legacy missions ⇒ the Validation Engine adds no extra
// gate, so behaviour is unchanged. Present ⇒ the mission's Definition of Done becomes genuinely
// verified rather than merely asserted.
if (Array.isArray(spec.verify)) {
    plan.verify = spec.verify
        .filter((v) => v && typeof v === "object" && typeof v.evidence === "string")
        .map((v) => ({ capability: String(v.capability || v.evidence), evidence: v.evidence }));
}

fs.mkdirSync("runtime/generated", { recursive: true });
fs.writeFileSync(
    "runtime/generated/mission-plan.json",
    JSON.stringify(plan, null, 2)
);

console.log("======================================");
console.log("MISSION LOADER");
console.log("======================================");
console.log("Mission    :", mission);
console.log("Contract   :", CONTRACT_PATH);
console.log("Mode       :", plan.mode);
console.log("Objectives :", objectives.length);
console.log("Next       :", plan.nextObjective);
console.log("Engineering:", requiresEngineering ? "YES (authorized paths)" : "no (read-only/local)");
console.log("Status     :", plan.status);
console.log("Output     : runtime/generated/mission-plan.json");
console.log("======================================");
