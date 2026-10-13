/*
 * Checkpoint Engine — persistent, resumable pipeline state. TypeScript canonical. Faithful port of the
 * historical runtime/core/checkpoint-engine.js; behaviour, the written runtime/generated/pipeline-checkpoint.json,
 * RC-2 FAILED-not-resumable semantics and every exported function are byte-identical. Strict-typed in
 * η-ORCH-T3 (no ts-nocheck suppression); verified under tsconfig.runtime-leaves-strict.json. The file stays a
 * CommonJS module — `module.exports = { ... }` and the exported names (CHECKPOINT_PATH, begin, stageRunning,
 * stageDone, stageFailed, interrupt, complete, load) are preserved so the raw require() consumers (odg-run,
 * decision-rules, mission-ledger, mission-contract-factory, local-test-gate, the TS adapter) are unchanged.
 * The legacy .js is an INDEPENDENT byte-equivalent implementation (NOT a shim re-exporting this module;
 * corrected per η1-A) and remains the production default.
 */

"use strict";

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

interface Stage {
  index: number;
  name: string;
  status: string;
}
interface RollbackAnchor {
  head: string | null;
  dirtyAtStart: boolean;
}
interface ContextSummary {
  mode: unknown;
  priority: unknown;
  objectives: number;
  requiresEngineering: boolean;
  authorizedPaths: unknown[];
}
interface PatchSummary {
  plannedPatches: number;
  realPatches: number;
  targets: unknown[];
}
/** The exact shape the engine builds/persists. Optional fields are added incrementally (persist + transitions). */
interface Checkpoint {
  mission: string;
  status: string;
  stages: Stage[];
  completed: string[];
  rollback?: RollbackAnchor;
  step?: { index: number; name: string };
  startedAt?: string;
  updatedAt?: string;
  progress?: string;
  modifiedFiles?: string[];
  context?: ContextSummary | null;
  patch?: PatchSummary | null;
  resumedFromIndex?: number;
  error?: string;
  interruptReason?: string;
  completedAt?: string;
}

const GENERATED_DIR = "runtime/generated";
const CHECKPOINT_PATH = path.join(GENERATED_DIR, "pipeline-checkpoint.json");

function readJsonSafe(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function git(args: string[]): string | null {
  try {
    // stderr ignored: a missing/foreign git dir is a benign "no rollback anchor" case.
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

// Working-tree paths currently changed vs HEAD (added/modified/deleted/untracked), best-effort.
function changedFiles(): string[] {
  const porcelain = git(["status", "--porcelain"]);
  if (porcelain == null) return [];
  return porcelain
    .split(/\r?\n/)
    .map((l) => l.slice(3).trim())
    .filter(Boolean);
}

function contextSummary(): ContextSummary | null {
  const plan = readJsonSafe(path.join(GENERATED_DIR, "mission-plan.json")) as
    | { mode?: unknown; priority?: unknown; objectives?: unknown; requiresEngineering?: unknown; authorizedPaths?: unknown }
    | null;
  if (!plan) return null;
  return {
    mode: plan.mode,
    priority: plan.priority,
    objectives: Array.isArray(plan.objectives) ? plan.objectives.length : 0,
    requiresEngineering: plan.requiresEngineering === true,
    authorizedPaths: Array.isArray(plan.authorizedPaths) ? plan.authorizedPaths : [],
  };
}

function patchSummary(): PatchSummary | null {
  const patch = readJsonSafe(path.join(GENERATED_DIR, "patch-plan.json")) as
    | { patches?: unknown }
    | null;
  if (!patch || !Array.isArray(patch.patches)) return null;
  const patches = patch.patches as Array<{ edits?: Array<{ target?: unknown }> }>;
  const real = patches.filter((p) => Array.isArray(p.edits) && p.edits.length > 0);
  return {
    plannedPatches: patches.length,
    realPatches: real.length,
    targets: real.flatMap((p) => (p.edits || []).map((e) => e.target)),
  };
}

function persist(cp: Checkpoint): Checkpoint {
  cp.updatedAt = new Date().toISOString();
  cp.progress = `${cp.completed.length}/${cp.stages.length}`;
  cp.modifiedFiles = changedFiles();
  cp.context = contextSummary();
  cp.patch = patchSummary();
  fs.mkdirSync(GENERATED_DIR, { recursive: true });
  fs.writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));
  return cp;
}

function begin(mission: string, stageNames: string[]): { cp: Checkpoint; resumeIndex: number } {
  const existing = readJsonSafe(CHECKPOINT_PATH) as Checkpoint | null;

  const resumable =
    existing &&
    existing.mission === mission &&
    existing.status !== "COMPLETE" &&
    // RC-2: a FAILED checkpoint is NOT resumable. Treat FAILED like COMPLETE so begin() falls through
    // to a clean fresh start (resumeIndex 0).
    existing.status !== "FAILED" &&
    Array.isArray(existing.stages) &&
    existing.stages.length === stageNames.length &&
    existing.stages.every((s: Stage, i: number) => s.name === stageNames[i]);

  if (resumable && existing) {
    const resumeIndex = existing.stages.findIndex((s: Stage) => s.status !== "DONE");
    existing.status = "RUNNING";
    existing.resumedFromIndex = resumeIndex < 0 ? existing.stages.length : resumeIndex;
    return { cp: persist(existing), resumeIndex: existing.resumedFromIndex };
  }

  const cp: Checkpoint = {
    mission,
    status: "RUNNING",
    rollback: {
      head: git(["rev-parse", "HEAD"]),
      dirtyAtStart: (git(["status", "--porcelain"]) || "") !== "",
    },
    stages: stageNames.map((name: string, index: number) => ({ index, name, status: "PENDING" })),
    step: { index: 0, name: stageNames[0] },
    completed: [],
    startedAt: new Date().toISOString(),
  };
  return { cp: persist(cp), resumeIndex: 0 };
}

function stageRunning(cp: Checkpoint, index: number): Checkpoint {
  cp.stages[index].status = "RUNNING";
  cp.step = { index, name: cp.stages[index].name };
  return persist(cp);
}

function stageDone(cp: Checkpoint, index: number): Checkpoint {
  cp.stages[index].status = "DONE";
  const name = cp.stages[index].name;
  if (!cp.completed.includes(name)) cp.completed.push(name);
  return persist(cp);
}

function stageFailed(cp: Checkpoint, index: number, error?: unknown): Checkpoint {
  cp.stages[index].status = "FAILED";
  cp.status = "FAILED";
  cp.error = error ? String(error) : "stage failed";
  return persist(cp);
}

function interrupt(cp: Checkpoint | null | undefined, reason?: string): void {
  if (!cp) return;
  cp.status = "INTERRUPTED";
  cp.interruptReason = reason || "unknown";
  persist(cp);
}

function complete(cp: Checkpoint): Checkpoint {
  for (const s of cp.stages) if (s.status !== "DONE") s.status = "DONE";
  cp.status = "COMPLETE";
  cp.completed = cp.stages.map((s: Stage) => s.name);
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
