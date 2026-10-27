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
import * as crypto from "crypto";
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

const excellenceGate = require("./excellence-gate");   // AXE 1: gate a RESUME (protected recovery action), opt-in

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

function begin(mission: string, stageNames: string[], opts?: any): { cp: Checkpoint; resumeIndex: number; recoveryBlocked?: boolean; recoveryReason?: string; recoveryAudit?: any } {
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
    // AXE 1 — OPT-IN recovery gate on the RESUME decision (a protected action). Only engaged when the caller supplies
    // opts.recovery; otherwise begin() keeps EXACT legacy behaviour (backward-compatible). On refusal (tampered/
    // contradictory recovery evidence or a prohibited claim) the resume is DENIED and the existing checkpoint is
    // NEITHER resumed NOR overwritten — no unauthorized resume, no silent data loss. Reviewer-unavailable / offline =
    // advisory (resume proceeds). Reuses excellence-gate (requireExcellence + provenance + audit-log).
    if (opts && opts.recovery) {
      const rec = opts.recovery;
      const g = excellenceGate.gateRecovery({ action: { id: mission, kind: "checkpoint-resume", claims: rec.claims }, evidence: rec.evidence, contradictory: rec.contradictory, registry: rec.registry || [], now: rec.now || "", reviewer: rec.reviewer });
      if (!g.proceed) {
        return { cp: existing, resumeIndex: -1, recoveryBlocked: true, recoveryReason: g.evidenceReason && g.evidenceReason !== "no evidence supplied (advisory)" ? g.evidenceReason : g.excellence.reason, recoveryAudit: g.chain };
      }
      const ri = existing.stages.findIndex((s: Stage) => s.status !== "DONE");
      existing.status = "RUNNING";
      existing.resumedFromIndex = ri < 0 ? existing.stages.length : ri;
      return { cp: persist(existing), resumeIndex: existing.resumedFromIndex, recoveryBlocked: false, recoveryAudit: g.chain };
    }
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

// -------------------------------------------------------------------------------------------------
// WI-2 — Baseline-relative dirty-tree evaluation. Faithful port of the runtime/core/checkpoint-engine.js
// WI-2 block; behaviour is byte-equivalent (the cross-runtime parity gate depends on JS/TS parity, and
// checkpoint-engine.test.js runs under tsx and resolves THIS .ts twin — the WI-2 functions must exist on
// both runtimes or the Validation Engine cannot distinguish out-of-scope changes from pre-existing dirt).
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

type DirtyMap = Record<string, string>;
interface DirtyClassification {
  preExisting: string[];
  missionTouched: string[];
  inScope: string[];
  unexpected: string[];
}

// porcelain line → working-tree path ("XY path"; rename "XY old -> new" ⇒ new).
function parsePorcelainPaths(text: string | null | undefined): string[] {
  return String(text == null ? "" : text)
    .split(/\r?\n/)
    .map((l) => l.slice(3).trim())
    .map((p) => (p.includes(" -> ") ? (p.split(" -> ").pop() as string) : p))
    .filter(Boolean);
}

// Content hash of a working-tree path, or the sentinel "ABSENT" for a deleted/missing file. Deterministic.
function hashPath(p: string): string {
  try {
    return "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return "ABSENT";
  }
}

// Snapshot the current dirty tree as { path: contentHash }. Pure-of-clock; reads git + files only.
function snapshotDirty(): DirtyMap {
  const porcelain = git(["status", "--porcelain"]);
  const out: DirtyMap = {};
  if (porcelain == null) return out;
  for (const p of parsePorcelainPaths(porcelain)) out[p] = hashPath(p);
  return out;
}

// Normalize authorized_paths globs to directory/file prefixes (mirrors the pipeline's own scope match).
function normalizeScope(authorizedPaths: unknown): string[] {
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
function classifyDirty(
  { current, baseline, authorizedPaths }:
    { current?: DirtyMap; baseline?: DirtyMap; authorizedPaths?: unknown }
): DirtyClassification {
  const cur: DirtyMap = current && typeof current === "object" ? current : {};
  const base: DirtyMap = baseline && typeof baseline === "object" ? baseline : {};
  const scope = normalizeScope(authorizedPaths);
  const inScopeOf = (f: string) => scope.some((pre) => f === pre || f.startsWith(pre + "/"));
  const preExisting: string[] = [];
  const missionTouched: string[] = [];
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
function verdictOf(classification: DirtyClassification): string {
  if (classification.unexpected.length > 0) return "OUTSIDE";
  if (classification.inScope.length > 0) return "PENDING_COMMIT";
  return "CLEAN";
}

// IO entrypoints the shell pipeline calls (via `node -e`). writeBaseline at [1/5]; postGateVerdict at [5/5].
function writeBaseline(baselineFile: string): { generatedAt: string; paths: DirtyMap } {
  const snapshot = { generatedAt: new Date().toISOString(), paths: snapshotDirty() };
  fs.mkdirSync(path.dirname(baselineFile), { recursive: true });
  fs.writeFileSync(baselineFile, JSON.stringify(snapshot, null, 2));
  return snapshot;
}

// A missing baseline file ⇒ {} baseline ⇒ byte-identical to the pre-WI-2 behaviour (no subtraction): the
// FINALIZE_*/CLOSEOUT_* path, which never captures a baseline, keeps its strict end-clean semantics.
function postGateVerdict(
  { baselineFile, authorizedPaths }: { baselineFile?: string; authorizedPaths?: unknown }
): DirtyClassification & { verdict: string } {
  const snap = baselineFile ? (readJsonSafe(baselineFile) as { paths?: DirtyMap } | null) : null;
  const baseline: DirtyMap = snap && snap.paths && typeof snap.paths === "object" ? snap.paths : {};
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
