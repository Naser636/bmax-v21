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

// -----------------------------------------------------------------------------------------------
// Deterministic mission decomposition.
//
// A single natural-language goal may describe SEVERAL independent actions ("remove the unused
// import and format the file"). The Mission Loader / Decision Engine / Patch Engine already iterate
// over objectives[], so the synthesizer is the only piece that has to notice the plurality and emit
// one ordered objective per action. This is done WITHOUT any AI: purely by fixed, ordered string
// rules, so an identical goal always decomposes to an identical objective list (DETERMINISM_FIRST).
//
// Safety / backward compatibility: decomposition is only ACCEPTED when the goal carries a clear
// structural signal of multiple independent actions. When that signal is absent — the common case —
// the goal is kept verbatim as exactly one objective, byte-identical to the historical behaviour.
// -----------------------------------------------------------------------------------------------

// Imperative action verbs that mark the start of an independent engineering/runtime action. Used as
// the guard for the weakest split (conjunction/comma): a clause is only treated as its own action
// when it BEGINS with one of these, so "quick and dirty fix" or "the loader, engine and patch"
// (a single action over a list of objects) are never over-split.
const ACTION_VERBS = [
    "add", "remove", "delete", "drop", "fix", "repair", "refactor", "implement",
    "create", "build", "wire", "generate", "migrate", "enable", "disable",
    "integrate", "update", "upgrade", "write", "rename", "move", "extract",
    "introduce", "replace", "document", "test", "validate", "verify", "configure",
    "install", "setup", "register", "expose", "support", "scaffold", "connect",
    "split", "merge", "clean", "cleanup", "optimize", "harden", "audit",
    "format", "lint", "run", "check", "ensure", "emit", "record", "log",
    "print", "load", "parse", "normalize", "compute", "resolve", "apply",
    "bump", "deprecate", "restore", "rollback", "archive", "publish", "deploy",
];

// Strip a leading list marker ("- ", "* ", "• ", "1. ", "2) ", "(3) ") from a line.
function stripListMarker(line) {
    return String(line).replace(/^\s*(?:[-*•]|\(\d+\)|\d+[.)])\s+/, "");
}

// Does a clause begin with an imperative action verb?
function startsWithActionVerb(clause) {
    const first = String(clause).trim().toLowerCase().split(/\s+/)[0] || "";
    return ACTION_VERBS.includes(first.replace(/[^a-z]/g, ""));
}

// Inline enumerated list on ONE line: "1. do X 2. do Y 3. do Z" / "1) X 2) Y" / "(1) X (2) Y".
// Requires at least two markers so a lone "v2. do X" or a version like "1.2.3" (no whitespace after
// the dot ⇒ no marker) is never mistaken for a list.
function splitEnumerated(line) {
    const markerRe = /(?:^|\s)(?:\(\d+\)|\d+[.)])\s+/g;
    const markerCount = (line.match(markerRe) || []).length;
    if (markerCount < 2) return [];
    return line.split(markerRe).map((s) => s.trim()).filter(Boolean);
}

// Weakest split: independent imperative clauses joined by conjunctions/commas/"then"/";". Accepted
// ONLY when EVERY resulting clause independently begins with an action verb — otherwise the "split"
// is discarded and the goal stays a single objective (no over-splitting of a single action).
function splitConjunctions(line) {
    const clauses = line
        .split(/\s*(?:,\s*and\s+|,\s*then\s+|,\s+|\s+and\s+|\s+then\s+|\s*;\s*)/i)
        .map((s) => s.trim())
        .filter(Boolean);
    if (clauses.length < 2) return [];
    return clauses.every(startsWithActionVerb) ? clauses : [];
}

/*
 * Decompose a goal into an ordered list of independent action strings. Ordered rules, strongest
 * structural signal first; the first rule that yields >= 2 fragments wins. When none does, the goal
 * is returned verbatim as a single-element list (current behaviour preserved exactly).
 */
function decompose(goal) {
    const raw = String(goal || "");
    const trimmed = raw.trim();
    if (!trimmed) return [];

    // 1. Explicit multi-line / bulleted / numbered list — the strongest signal.
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
        const items = lines.map(stripListMarker).map((s) => s.trim()).filter(Boolean);
        if (items.length >= 2) return items;
    }

    // From here the goal is a single line.
    const enumerated = splitEnumerated(trimmed);
    if (enumerated.length >= 2) return enumerated;

    const conjunctions = splitConjunctions(trimmed);
    if (conjunctions.length >= 2) return conjunctions;

    // 4. No multi-action signal ⇒ one objective, verbatim (backward compatible).
    return [trimmed];
}

// Build a single objective. done_when / patch are shared inputs; the id is deterministic.
function makeObjective(id, goal, doneWhen, patch) {
    const objective = { id, goal, done_when: doneWhen };
    if (patch && typeof patch === "object") objective.patch = patch;
    return objective;
}

// Build a Mission-Loader-schema contract from an explicit spec. authorizedPaths drives engineering
// mode (the Loader sets requiresEngineering when authorized_paths is non-empty).
//
// Objectives: the mission's goal is decomposed into independent actions (see decompose). Multiple
// actions ⇒ multiple ordered objectives; otherwise exactly one — preserving the historical shape.
// An explicit `spec.goals` array is honoured verbatim as the actions, and an explicit `spec.patch`
// pins the mission to a SINGLE concrete objective (the patch belongs to one action, so a goal that
// also happens to read as multiple actions is not split when a patch is attached).
function toContract(spec) {
    const id = spec.id || slug(spec.goal, "SYNTH_MISSION");
    const authorizedPaths = Array.isArray(spec.authorizedPaths) ? spec.authorizedPaths : [];
    const hasPatch = !!(spec.patch && typeof spec.patch === "object");
    // Only require "Patch applied." when a patch is actually attached. A no-patch objective (e.g. an
    // audit/analysis) must not fabricate a patch requirement for an action that will never run. An
    // explicit spec.doneWhen is always honoured verbatim.
    const doneWhen = Array.isArray(spec.doneWhen) && spec.doneWhen.length
        ? spec.doneWhen
        : hasPatch
            ? ["Patch applied.", "Validation successful."]
            : ["Validation successful."];

    // Resolve the ordered action list. An explicit goals[] wins; else decompose the goal; a patch
    // (single concrete edit) forces exactly one action to keep the payload with its objective.
    let actions;
    if (Array.isArray(spec.goals) && spec.goals.length) {
        actions = spec.goals.map((g) => String(g == null ? "" : g).trim()).filter(Boolean);
    } else {
        actions = decompose(spec.goal);
    }
    if (actions.length === 0) actions = [spec.goal || ""];
    if (hasPatch && actions.length > 1) actions = [spec.goal || ""];
    // Single-objective decomposition ⇒ keep the goal verbatim (untrimmed), so a contract with no
    // multi-action signal is byte-identical to the historical single-objective output.
    if (actions.length === 1 && !(Array.isArray(spec.goals) && spec.goals.length)) {
        actions = [spec.goal || ""];
    }

    const baseId = slug(id, "OBJ");
    const objectives = actions.map((goal, i) => {
        // Objective ids stay deterministic and the first honours an explicit objectiveId so a
        // single-objective contract is byte-identical to the historical output.
        const objId = i === 0 && spec.objectiveId ? spec.objectiveId : `${baseId}_${i + 1}`;
        // The concrete patch (single-objective path only) rides on the sole objective.
        return makeObjective(objId, goal, doneWhen, hasPatch ? spec.patch : undefined);
    });

    return {
        mission: id,
        priority: spec.priority || "NORMAL",
        mode: spec.mode || "SEQUENTIAL",
        requires_engineering: authorizedPaths.length > 0,
        authorized_paths: authorizedPaths,
        description: spec.description || spec.goal || "",
        objectives,
        definition_of_done: doneWhen,
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

module.exports = { toContract, fromRequest, isValidContract, slug, decompose };
