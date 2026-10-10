#!/usr/bin/env node

/*
 * Checkpoint Engine — persistent, resumable pipeline state.
 *
 * WHY THIS EXISTS
 * The pipeline orchestrator (runtime/bin/odg-run.js) used to loop over every stage from the start on
 * each invocation. A network drop, a killed provider, a VPS reboot or a Ctrl+C therefore lost all
 * in-flight progress: the next run began again at stage 0. This engine gives the Runtime a single,
 * durable checkpoint so an interrupted mission RESUMES at the first stage that has not yet completed,
 * never from the beginning.
 *
 * WHAT A CHECKPOINT CONTAINS (the fields the mission requires)
 *   mission        — the mission being executed
 *   step           — the current stage {index,name}
 *   stages         — every stage with its per-stage status (PENDING/RUNNING/DONE/FAILED)
 *   completed      — names of stages already proven DONE (the resume boundary)
 *   context        — mission-plan summary (mode, priority, objectives, requiresEngineering)
 *   patch          — current patch-plan summary (planned patches, real edits)
 *   modifiedFiles  — working-tree paths changed since the run started (git porcelain)
 *   rollback       — the pre-run git HEAD + whether the tree was dirty at start (rollback anchor)
 *   progress       — "k/n" completed
 *   status         — RUNNING | INTERRUPTED | FAILED | COMPLETE
 *
 * The file lives under runtime/generated/ (git-ignored runtime state, not a tracked deliverable) so
 * it never pollutes the working tree the Validation Engine inspects.
 *
 * Idempotent + safe: every read/write is guarded; a missing or corrupt checkpoint degrades to a
 * fresh start rather than crashing the pipeline.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const GENERATED_DIR = "runtime/generated";
const CHECKPOINT_PATH = path.join(GENERATED_DIR, "pipeline-checkpoint.json");

function readJsonSafe(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return null;
    }
}

function git(args) {
    try {
        // stderr ignored: a missing/foreign git dir is a benign "no rollback anchor" case, not an
        // error to surface — the engine degrades to null rather than spamming the pipeline log.
        return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
        return null;
    }
}

// Working-tree paths currently changed vs HEAD (added/modified/deleted/untracked), best-effort.
function changedFiles() {
    const porcelain = git(["status", "--porcelain"]);
    if (porcelain == null) return [];
    return porcelain
        .split(/\r?\n/)
        .map((l) => l.slice(3).trim())
        .filter(Boolean);
}

// Compact, non-secret projections of the current plan/patch artifacts — enough to understand the
// checkpoint at a glance without duplicating the whole file.
function contextSummary() {
    const plan = readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json"));
    if (!plan) return null;
    return {
        mode: plan.mode,
        priority: plan.priority,
        objectives: Array.isArray(plan.objectives) ? plan.objectives.length : 0,
        requiresEngineering: plan.requiresEngineering === true,
        authorizedPaths: Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [],
    };
}

function patchSummary() {
    const patch = readJsonSafe(path.join(GENERATED_DIR, "patch-plan.json"));
    if (!patch || !Array.isArray(patch.patches)) return null;
    const real = patch.patches.filter((p) => Array.isArray(p.edits) && p.edits.length > 0);
    return {
        plannedPatches: patch.patches.length,
        realPatches: real.length,
        targets: real.flatMap((p) => p.edits.map((e) => e.target)),
    };
}

function persist(cp) {
    cp.updatedAt = new Date().toISOString();
    cp.progress = `${cp.completed.length}/${cp.stages.length}`;
    cp.modifiedFiles = changedFiles();
    cp.context = contextSummary();
    cp.patch = patchSummary();
    fs.mkdirSync(GENERATED_DIR, { recursive: true });
    fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
    return cp;
}

/*
 * begin(mission, stageNames) — open (or resume) a checkpoint for `mission`.
 *
 * Returns { cp, resumeIndex }:
 *   - Fresh run (no checkpoint, different mission, or a COMPLETE/FAILED one): resumeIndex = 0 and a new
 *     checkpoint is written with the pre-run HEAD captured as the rollback anchor.
 *   - Interrupted run for the SAME mission with the SAME stage list: resumeIndex points at the first
 *     stage not yet DONE, so the orchestrator skips the proven-DONE prefix.
 */
function begin(mission, stageNames) {
    const existing = readJsonSafe(CHECKPOINT_PATH);

    const resumable =
        existing &&
        existing.mission === mission &&
        existing.status !== "COMPLETE" &&
        // RC-2: a FAILED checkpoint is NOT resumable. Resuming would trust the DONE prefix of a run
        // that already failed, skipping stages whose real effect was never (re-)proven. Treat FAILED
        // like COMPLETE here so begin() falls through to a clean fresh start (resumeIndex 0).
        existing.status !== "FAILED" &&
        Array.isArray(existing.stages) &&
        existing.stages.length === stageNames.length &&
        existing.stages.every((s, i) => s.name === stageNames[i]);

    if (resumable) {
        const resumeIndex = existing.stages.findIndex((s) => s.status !== "DONE");
        existing.status = "RUNNING";
        existing.resumedFromIndex = resumeIndex < 0 ? existing.stages.length : resumeIndex;
        return { cp: persist(existing), resumeIndex: existing.resumedFromIndex };
    }

    const cp = {
        mission,
        status: "RUNNING",
        rollback: {
            head: git(["rev-parse", "HEAD"]),
            dirtyAtStart: (git(["status", "--porcelain"]) || "") !== "",
        },
        stages: stageNames.map((name, index) => ({ index, name, status: "PENDING" })),
        step: { index: 0, name: stageNames[0] },
        completed: [],
        startedAt: new Date().toISOString(),
    };
    return { cp: persist(cp), resumeIndex: 0 };
}

function stageRunning(cp, index) {
    cp.stages[index].status = "RUNNING";
    cp.step = { index, name: cp.stages[index].name };
    return persist(cp);
}

function stageDone(cp, index) {
    cp.stages[index].status = "DONE";
    const name = cp.stages[index].name;
    if (!cp.completed.includes(name)) cp.completed.push(name);
    return persist(cp);
}

function stageFailed(cp, index, error) {
    cp.stages[index].status = "FAILED";
    cp.status = "FAILED";
    cp.error = error ? String(error) : "stage failed";
    return persist(cp);
}

// Persist an INTERRUPTED checkpoint on a signal (SIGINT/SIGTERM) or an uncaught crash. The RUNNING
// stage stays non-DONE, so the next run resumes exactly there.
function interrupt(cp, reason) {
    if (!cp) return;
    cp.status = "INTERRUPTED";
    cp.interruptReason = reason || "unknown";
    persist(cp);
}

function complete(cp) {
    for (const s of cp.stages) if (s.status !== "DONE") s.status = "DONE";
    cp.status = "COMPLETE";
    cp.completed = cp.stages.map((s) => s.name);
    cp.completedAt = new Date().toISOString();
    return persist(cp);
}

module.exports = {
    CHECKPOINT_PATH,
    begin,
    stageRunning,
    stageDone,
    stageFailed,
    interrupt,
    complete,
    load: () => readJsonSafe(CHECKPOINT_PATH),
};
