#!/usr/bin/env node

/*
 * Mission Contract Factory — Roadmap → missing Mission Contracts.
 *
 * WHY THIS EXISTS
 * ---------------
 * The Runtime executes the ordered list of missions in runtime/governance/ROADMAP.json. The
 * autonomy work-list, though, is sourced from the runtime-model queue, which only surfaces mission
 * CONTRACTS that already exist on disk with objectives (runtime/core/runtime-model.js). A roadmap
 * entry that names a mission with NO contract file therefore never becomes a candidate: it is
 * silently skipped and the campaign can never reach it "from the roadmap alone".
 *
 * This module closes that gap. Given the roadmap it:
 *   1. reads the manifest;
 *   2. detects entries whose contract is absent (or present but declares no objectives);
 *   3. GENERATES a complete, Mission-Loader-conformant contract for each gap, filling every
 *      obligatory field (objective, priority, mode, authorized_paths when engineering, validation
 *      criteria, checkpoints, ledger descriptor);
 *   4. validates the generated contract with the SAME structural guard the Mission Loader enforces;
 *   5. writes it to runtime/missions/<id>.json (the location the Mission Loader consumes).
 *
 * It creates NO new runtime and NO new schema: the contract shape and the validator are reused from
 * runtime/core/mission-synthesizer.js, and the produced files are the exact contracts the existing
 * Mission Loader / pipeline / autonomy loop already run. Once the gaps are materialised the EXISTING
 * autonomy loop selects, executes and advances through them — and its ledger + checkpoint already
 * give campaign resume for free.
 *
 * Deterministic + idempotent: buildContract is a pure function of the roadmap entry (no wall-clock,
 * no randomness), and generateMissing skips any entry that already has an executable contract, so
 * re-running never churns the tree (DETERMINISM_FIRST).
 */

"use strict";

const fs = require("fs");
const path = require("path");

const synth = require("./mission-synthesizer");

const ROADMAP_REL = path.join("runtime", "governance", "ROADMAP.json");
const MISSIONS_REL = path.join("runtime", "missions");

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

/** The ordered roadmap entries that name a mission id (invalid entries are dropped). */
function readRoadmap(root) {
    const manifest = readJson(path.join(root, ROADMAP_REL));
    const missions = manifest && Array.isArray(manifest.missions) ? manifest.missions : [];
    return missions.filter((m) => m && typeof m.id === "string");
}

/** Where a roadmap entry's contract lives: the manifest's explicit path, else the convention. */
function contractPathFor(root, entry) {
    const rel =
        typeof entry.contract === "string" && entry.contract.trim()
            ? entry.contract
            : path.join(MISSIONS_REL, `${entry.id}.json`);
    return path.join(root, rel);
}

/*
 * A roadmap entry is "missing a contract" when no contract file exists, OR the file exists but
 * declares no objectives — the SAME executability guard the Mission Loader (runtime/core/
 * mission-loader.js) and the runtime-model queue enforce. Both cases would keep the mission out of
 * the autonomous work-list, so both are gaps this factory fills.
 */
function isContractMissing(root, entry) {
    const raw = readJson(contractPathFor(root, entry));
    if (raw === null) return true;
    return !(Array.isArray(raw.objectives) && raw.objectives.length > 0);
}

/*
 * Build a COMPLETE, Mission-Loader-conformant contract for a roadmap entry.
 *
 * The canonical base schema (mission / objectives / definition_of_done / mode / priority /
 * authorized_paths) comes from mission-synthesizer.toContract so there is ONE schema source; this
 * function only enriches it with the remaining obligatory fields the campaign needs:
 *   - authorized_paths + engineering flag (a safe runtime-scoped default when engineering and no
 *     explicit paths are declared on the roadmap entry);
 *   - validation criteria (definition_of_done / done_when);
 *   - checkpoints: the resumable milestones (the durable per-stage checkpoint stays owned by
 *     runtime/core/checkpoint-engine.js at run time — these are the declared boundaries);
 *   - ledger: the entry the Mission Ledger should record on release (the append stays owned by
 *     runtime/core/mission-ledger.js — this is the intended entry, never a write).
 *
 * Pure: a deterministic function of `entry` only.
 */
function buildContract(entry) {
    const engineering = entry.requiresEngineering === true || entry.requires_engineering === true;

    // Honour explicit authorized paths from the roadmap entry; otherwise use a safe runtime-scoped
    // default when the mission is engineering, or none for a read-only mission.
    const explicitPaths = Array.isArray(entry.authorized_paths)
        ? entry.authorized_paths
        : Array.isArray(entry.authorizedPaths)
            ? entry.authorizedPaths
            : null;
    const authorizedPaths = explicitPaths || (engineering ? ["runtime/**"] : []);

    const goal = String(entry.title || entry.goal || entry.id);
    const doneWhen = [
        `Objective "${goal}" satisfied.`,
        "Validation Engine reports success.",
        engineering ? "Authorized patch applied." : "Read-only evidence produced.",
    ];

    const base = synth.toContract({
        id: entry.id,
        goal,
        priority: entry.priority || "NORMAL",
        mode: entry.mode || (engineering ? "ENGINEERING" : "SEQUENTIAL"),
        authorizedPaths,
        doneWhen,
        description:
            entry.description ||
            `Auto-generated contract for roadmap mission ${entry.id} (${goal}).`,
    });

    const objectiveId = base.objectives[0].id;

    return {
        ...base,
        // authorizedPaths alias some engineering contracts/consumers read alongside authorized_paths.
        authorizedPaths,
        status: "AUTHORIZED",
        completion: ["Release Manager decision is RELEASE."],
        checkpoints: [
            { id: `${objectiveId}__PLANNED`, when: "mission-plan.json generated" },
            { id: `${objectiveId}__VALIDATED`, when: "Validation Engine reports success" },
            { id: `${objectiveId}__RELEASED`, when: "mission ledger entry proven" },
        ],
        ledger: { mission: entry.id, capability: entry.id, status: "PENDING", proven: false },
        source: "mission-contract-factory",
        generatedBy: "mission-contract-factory",
    };
}

/*
 * Read the roadmap, generate every missing contract, validate it, and (by default) write it to the
 * conventional mission-contract location. Returns a report:
 *   { roadmap: [...ids], generated: [{mission, path}], skipped: [...ids], invalid: [...ids] }
 * `skipped` are entries that already have an executable contract; `invalid` are entries whose
 * generated contract failed the structural validator (should never happen for a well-formed entry —
 * surfaced rather than written so a bad contract can never reach the loader). Pass {write:false} to
 * detect/generate without touching the tree (used by tests and dry-runs).
 */
function generateMissing(root = process.cwd(), options = {}) {
    const write = options.write !== false;
    const roadmap = readRoadmap(root);
    const report = { roadmap: roadmap.map((e) => e.id), generated: [], skipped: [], invalid: [] };

    for (const entry of roadmap) {
        if (!isContractMissing(root, entry)) {
            report.skipped.push(entry.id);
            continue;
        }
        const contract = buildContract(entry);
        if (!synth.isValidContract(contract)) {
            report.invalid.push(entry.id);
            continue;
        }
        const target = contractPathFor(root, entry);
        if (write) {
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, JSON.stringify(contract, null, 2) + "\n");
        }
        report.generated.push({ mission: entry.id, path: path.relative(root, target) });
    }

    return report;
}

module.exports = {
    readRoadmap,
    contractPathFor,
    isContractMissing,
    buildContract,
    generateMissing,
};
