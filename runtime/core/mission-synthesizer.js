#!/usr/bin/env node

/*
 * P5 — Local Mission Synthesizer.
 *
 * Turns a natural-language request (or an unfinished ledger item) into a real Mission-Loader
 * contract — objectives[], authorized_paths, definition_of_done — WITHOUT any AI. It reuses the
 * exact schema the existing Mission Loader consumes (see runtime/core/mission-loader.js) and the P4
 * Decision Rules to pick the local capability/fixers a request implies. This is the first half of
 * "parler naturellement à ODG": request → mission contract.
 *
 * Pure: `toContract`/`fromRequest` return plain objects; persisting is a separate opt-in step.
 */

"use strict";

const rules = require("./decision-rules");

function slug(text, fallback) {
    const s = String(text || "").toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    return s || fallback;
}

// Build a Mission-Loader-schema contract from an explicit spec. authorizedPaths drives engineering
// mode (the Loader sets requiresEngineering when authorized_paths is non-empty).
function toContract(spec) {
    const id = spec.id || slug(spec.goal, "SYNTH_MISSION");
    const authorizedPaths = Array.isArray(spec.authorizedPaths) ? spec.authorizedPaths : [];
    const objective = {
        id: spec.objectiveId || `${slug(id, "OBJ")}_1`,
        goal: spec.goal || "",
        done_when: Array.isArray(spec.doneWhen) && spec.doneWhen.length
            ? spec.doneWhen
            : ["Patch applied.", "Validation successful."],
    };
    if (spec.patch && typeof spec.patch === "object") objective.patch = spec.patch;
    return {
        mission: id,
        priority: spec.priority || "NORMAL",
        mode: spec.mode || "SEQUENTIAL",
        requires_engineering: authorizedPaths.length > 0,
        authorized_paths: authorizedPaths,
        description: spec.description || spec.goal || "",
        objectives: [objective],
        definition_of_done: objective.done_when,
        source: "mission-synthesizer",
    };
}

// Naive NL → spec: keep the raw request as the goal, and consult the P4 rules to attach the local
// capability/fixers it implies (so the router/decision layers can resolve it locally first).
function fromRequest(text, extra) {
    const template = rules.match(text);
    const spec = {
        id: slug(text, "REQUEST_MISSION"),
        goal: String(text || ""),
        ...(extra || {}),
    };
    const contract = toContract(spec);
    contract.resolvedCapability = template ? template.capability : null;
    contract.resolvedFixers = template ? template.fixers : null;
    return contract;
}

// Minimal structural validator — the same invariants the Mission Loader enforces.
function isValidContract(c) {
    return !!(
        c &&
        typeof c.mission === "string" &&
        Array.isArray(c.objectives) &&
        c.objectives.length > 0 &&
        typeof c.objectives[0].id === "string" &&
        typeof c.objectives[0].goal === "string"
    );
}

module.exports = { toContract, fromRequest, isValidContract, slug };
