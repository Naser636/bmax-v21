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

// -------------------------------------------------------------------------------------------------
// WI-2 — Baseline-relative dirty-tree evaluation.
//
// The pipeline pre-flight used to hard-STOP on ANY dirty tracked file, and the post-run governance gate
// classified EVERY dirty path against the mission's authorized_paths. Both were BASELINE-BLIND: a repo
// already dirty with the operator's PRE-EXISTING work (which the mission never touched) blocked the
// mission, and pre-existing out-of-scope dirt forced a false "unexpected change" STOP. This captures a
// verifiable BASELINE at mission start and charges the mission with ONLY the changes it actually made.
//
// INVARIANT (CTO): pre-existing dirt is NEVER a licence to modify it. The baseline records a CONTENT
// HASH per path, so a pre-existing file that the mission FURTHER modifies (hash changes) counts as
// mission-touched and, if outside authorized scope, is surfaced as UNEXPECTED exactly like a brand-new
// out-of-scope change. Protection is not weakened; attribution is made honest.
const crypto = require("crypto");

// porcelain line → working-tree path ("XY path"; rename "XY old -> new" ⇒ new).
function parsePorcelainPaths(text) {
    return String(text == null ? "" : text)
        .split(/\r?\n/)
        .map((l) => l.slice(3).trim())
        .map((p) => (p.includes(" -> ") ? p.split(" -> ").pop() : p))
        .filter(Boolean);
}

// Content hash of a working-tree path, or the sentinel "ABSENT" for a deleted/missing file. Deterministic.
function hashPath(p) {
    try {
        return "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    } catch {
        return "ABSENT";
    }
}

// Snapshot the current dirty tree as { path: contentHash }. Pure-of-clock; reads git + files only.
function snapshotDirty() {
    const porcelain = git(["status", "--porcelain"]);
    const out = {};
    if (porcelain == null) return out;
    for (const p of parsePorcelainPaths(porcelain)) out[p] = hashPath(p);
    return out;
}

// Normalize authorized_paths globs to directory/file prefixes (mirrors the pipeline's own scope match).
function normalizeScope(authorizedPaths) {
    return (Array.isArray(authorizedPaths) ? authorizedPaths : [])
        .map((x) => String(x).replace(/[*].*$/, "").replace(/\/+$/, ""))
        .filter(Boolean);
}

// PURE classifier (no IO): split the current dirty set against the baseline + authorized scope.
//   preExisting : dirty now AND present+identical in the baseline ⇒ the operator's preserved work.
//   missionTouched: new path OR content differs from the baseline ⇒ produced by THIS mission.
//   inScope     : missionTouched paths that fall inside authorized scope ⇒ the proven deliverable.
//   unexpected  : missionTouched paths OUTSIDE scope ⇒ a real out-of-scope change (fail-closed).
// `current` / `baseline` are { path: hash } maps. Deterministic; no clock/network.
function classifyDirty({ current, baseline, authorizedPaths }) {
    const cur = current && typeof current === "object" ? current : {};
    const base = baseline && typeof baseline === "object" ? baseline : {};
    const scope = normalizeScope(authorizedPaths);
    const inScopeOf = (f) => scope.some((pre) => f === pre || f.startsWith(pre + "/"));
    const preExisting = [];
    const missionTouched = [];
    for (const p of Object.keys(cur)) {
        if (Object.prototype.hasOwnProperty.call(base, p) && base[p] === cur[p]) preExisting.push(p);
        else missionTouched.push(p);
    }
    const inScope = missionTouched.filter(inScopeOf);
    const unexpected = missionTouched.filter((f) => !inScopeOf(f));
    return { preExisting, missionTouched, inScope, unexpected };
}

// Map a classification to the pipeline's post-gate verdict. CLEAN ⇒ the mission produced nothing dirty
// (all remaining dirt is preserved pre-existing work) ⇒ SUCCESS. PENDING_COMMIT ⇒ an in-scope deliverable
// awaits the human commit gate (exit 20). OUTSIDE ⇒ a mission-produced out-of-scope change ⇒ hard STOP.
function verdictOf(classification) {
    if (classification.unexpected.length > 0) return "OUTSIDE";
    if (classification.inScope.length > 0) return "PENDING_COMMIT";
    return "CLEAN";
}

// IO entrypoints the shell pipeline calls (via `node -e`). writeBaseline at [1/5]; postGateVerdict at [5/5].
function writeBaseline(baselineFile) {
    const snapshot = { generatedAt: new Date().toISOString(), paths: snapshotDirty() };
    fs.mkdirSync(path.dirname(baselineFile), { recursive: true });
    fs.writeFileSync(baselineFile, JSON.stringify(snapshot, null, 2));
    return snapshot;
}

// A missing baseline file ⇒ {} baseline ⇒ byte-identical to the pre-WI-2 behaviour (no subtraction): the
// FINALIZE_*/CLOSEOUT_* path, which never captures a baseline, keeps its strict end-clean semantics.
function postGateVerdict({ baselineFile, authorizedPaths }) {
    const snap = baselineFile ? readJsonSafe(baselineFile) : null;
    const baseline = (snap && snap.paths && typeof snap.paths === "object") ? snap.paths : {};
    const current = snapshotDirty();
    const classification = classifyDirty({ current, baseline, authorizedPaths });
    return { verdict: verdictOf(classification), ...classification };
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
    // WI-2 baseline-relative evaluation (shared by the pipeline pre-flight + post-run governance gate).
    parsePorcelainPaths,
    classifyDirty,
    verdictOf,
    snapshotDirty,
    writeBaseline,
    postGateVerdict,
};
