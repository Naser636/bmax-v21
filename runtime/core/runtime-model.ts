#!/usr/bin/env node
/**
 * Runtime Model — the single deterministic source of truth for Runtime state
 * (TypeScript port; parity with runtime/core/runtime-model.js).
 *
 * Computes ONE coherent model from on-disk artefacts. NO writes, NO timestamps (DETERMINISM_FIRST):
 * the same repo state always yields the same model. Strict TS port: the single export
 * (computeRuntimeModel), its `root`-relative reads, every classification branch, the deterministic
 * queue ordering, the returned object's FIELD ORDER and the CLI are preserved EXACTLY. The historical
 * .js remains the behavioural reference.
 */
"use strict";

import * as fs from "fs";
import * as path from "path";

function readJson(file: string): any {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** First objective of a raw contract, normalised to {id, goal} (handles string and object shapes). */
function firstObjective(raw: any, mission: string): any {
  const objs = Array.isArray(raw && raw.objectives) ? raw.objectives : [];
  if (objs.length === 0) return null;
  const o = objs[0];
  if (typeof o === "string") return { id: `${mission}_1`, goal: o };
  return {
    id: typeof o.id === "string" ? o.id : `${mission}_1`,
    goal: typeof o.goal === "string" ? o.goal : "",
  };
}

function objectiveCount(raw: any): number {
  return Array.isArray(raw && raw.objectives) ? raw.objectives.length : 0;
}

function requiresEngineering(raw: any): boolean {
  return raw ? raw.requires_engineering === true || raw.requiresEngineering === true : false;
}

/**
 * Compute the coherent Runtime model from on-disk artefacts.
 * @param root repository root (defaults to process.cwd()). @returns a pure, timestamp-free model.
 */
function computeRuntimeModel(root: string = process.cwd()): any {
  const G = (rel: string) => path.join(root, "runtime", "generated", rel);
  const MISSIONS = path.join(root, "runtime", "missions");
  const PENDING = path.join(MISSIONS, "pending");

  // --- proven set from the immutable ledger (proven === true only) ---------------------------
  const ledger = readJson(G("mission-ledger.json")) || { entries: [] };
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const provenSet = new Set(
    entries.filter((e: any) => e && e.proven === true && typeof e.mission === "string").map((e: any) => e.mission),
  );
  const lastMission = entries.length > 0 ? entries[entries.length - 1].mission : null;

  // --- last-run validation verdict (RC-5) ----------------------------------------------------
  const report = readJson(G("mission-report.json"));
  const lastRun =
    report && typeof report.mission === "string"
      ? { mission: report.mission, status: typeof report.status === "string" ? report.status : null, validated: report.validated === true }
      : null;

  // --- classify every mission contract on disk -----------------------------------------------
  let files: string[] = [];
  try {
    files = fs.readdirSync(MISSIONS).filter((f) => f.endsWith(".json")).sort();
  } catch {
    files = [];
  }

  // Which incomplete contracts already have a repair nomination queued (pending/FIX_<NAME>.json).
  let pendingFixes = new Set<string>();
  try {
    pendingFixes = new Set(
      fs.readdirSync(PENDING).filter((f) => f.startsWith("FIX_") && f.endsWith(".json")),
    );
  } catch {
    pendingFixes = new Set<string>();
  }

  const missions: any[] = [];
  const broken: any[] = [];
  for (const file of files) {
    const name = file.replace(/\.json$/, "");
    const raw = readJson(path.join(MISSIONS, file));
    if (raw === null) {
      broken.push({ mission: name, reason: "contract is not valid JSON" });
      continue;
    }
    const count = objectiveCount(raw);
    missions.push({
      mission: name,
      objectives: count,
      executable: count > 0,
      requiresEngineering: requiresEngineering(raw),
      priority: typeof raw.priority === "string" ? raw.priority : "NORMAL",
      proven: provenSet.has(name),
      first: firstObjective(raw, name),
      kind:
        typeof raw.evidencePackContractVersion === "string"
          ? "evidence-pack"
          : Array.isArray(raw.roadmaps) || raw.mode === "AUTONOMOUS_ORCHESTRATION"
            ? "orchestration-plan"
            : "mission",
    });
  }

  // --- roadmap manifest ordering -------------------------------------------------------------
  const roadmap = readJson(path.join(root, "runtime", "governance", "ROADMAP.json"));
  const roadmapIds = Array.isArray(roadmap && roadmap.missions)
    ? roadmap.missions.map((m: any) => m && m.id).filter((x: any) => typeof x === "string")
    : [];
  const roadmapOrder = new Map(roadmapIds.map((id: string, i: number) => [id, i]));

  // --- executable-but-unproven work-list (the real forward gap) ------------------------------
  const executableUnproven = missions.filter((m) => m.executable && !m.proven);
  executableUnproven.sort((a, b) => {
    const ra = roadmapOrder.has(a.mission) ? (roadmapOrder.get(a.mission) as number) : Number.MAX_SAFE_INTEGER;
    const rb = roadmapOrder.has(b.mission) ? (roadmapOrder.get(b.mission) as number) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return a.mission < b.mission ? -1 : a.mission > b.mission ? 1 : 0;
  });

  const queue = executableUnproven.map((m) => ({
    mission: m.mission,
    objective: m.first ? m.first.id : null,
    goal: m.first ? m.first.goal : null,
    requiresEngineering: m.requiresEngineering,
    priority: m.priority,
    status: "PENDING",
  }));

  // --- incomplete / blocked contracts (no objectives) — NEVER proposed as runnable ------------
  const incompleteContracts = missions
    .filter((m) => !m.executable)
    .map((m) => {
      const skipped = m.kind !== "mission";
      const reason = skipped
        ? m.kind === "evidence-pack"
          ? "file is an evidence pack, not a mission contract"
          : "file is an orchestration plan, not a leaf mission contract"
        : "mission contract declares no objectives (Mission Loader guard)";
      return {
        mission: m.mission,
        objectives: 0,
        proven: m.proven,
        kind: m.kind,
        disposition: skipped ? "SKIPPED" : "NEEDS_CONTRACT",
        reason,
        repairNominated: pendingFixes.has(`FIX_${m.mission}.json`),
      };
    });

  // --- capabilities (achieved) vs missing (executable forward work) --------------------------
  const capabilities = Array.from(provenSet).sort();
  const missingCapabilities = executableUnproven.map((m) => ({
    id: m.mission,
    goal: m.first ? m.first.goal : "",
    requiresEngineering: m.requiresEngineering,
  }));

  // --- outstanding gaps (queue is empty but work remains) ------------------------------------
  const outstanding = incompleteContracts
    .filter((c) => c.disposition === "NEEDS_CONTRACT" && !c.proven)
    .map((c) => ({ mission: c.mission, reason: c.reason, repairNominated: c.repairNominated }));
  const converged = queue.length === 0 && outstanding.length === 0;

  // --- pipeline health -----------------------------------------------------------------------
  const pipelineStages = readJson(G("runtime-pipeline.json"));
  const hasPipeline = Array.isArray(pipelineStages) && pipelineStages.length > 0;
  const verify = readJson(G("runtime-verify.json")) || {};
  const buildOk = verify.build === true;
  const tsOk = verify.typescript === true;
  let pipeline;
  if (!hasPipeline) pipeline = "UNKNOWN";
  else if (buildOk && tsOk) pipeline = "READY";
  else pipeline = "DEGRADED";

  // --- brain health --------------------------------------------------------------------------
  const masterPlanPresent = fs.existsSync(path.join(root, "runtime", "brain", "MASTER_PLAN.md"));
  const roadmapResolves =
    roadmapIds.length > 0 &&
    roadmapIds.every((id: string) => {
      const m = missions.find((x) => x.mission === id);
      return m && m.executable;
    });
  let brain;
  if (!masterPlanPresent) brain = "UNKNOWN";
  else if (roadmapResolves) brain = "READY";
  else brain = "DEGRADED";

  // --- foundation (the three seed missions) --------------------------------------------------
  const foundationMissions = ["M0000", "M0001", "M0002"];
  const foundation = foundationMissions.every((m) => provenSet.has(m)) ? "READY" : "DEGRADED";

  const nextMission =
    queue.length > 0
      ? queue[0].mission
      : outstanding.length > 0
        ? outstanding[0].mission
        : "SYSTEM_READY";
  const runtime = pipeline === "READY" && brain === "READY" ? "READY" : "DEGRADED";

  return {
    runtime,
    foundation,
    pipeline,
    brain,
    status: runtime,
    converged,
    lastMission,
    nextMission,
    lastRun,
    capabilities,
    missingCapabilities,
    outstanding,
    queue,
    scan: {
      totalMissions: missions.length,
      executable: missions.filter((m) => m.executable).length,
      proven: capabilities.length,
      executableUnproven: executableUnproven.map((m) => m.mission),
      incompleteContracts,
      brokenContracts: broken,
      roadmap: roadmapIds,
      roadmapResolves,
    },
    missions,
  };
}

module.exports = { computeRuntimeModel };

// Module-scope marker (adds NO export): forces TypeScript MODULE scope so internal helpers
// (readJson / firstObjective / objectiveCount / requiresEngineering) are MODULE-scoped, not global
// script scope (prevents cross-lot TS2393). The CommonJS API above is unchanged.
export {};

// CLI: print the model as JSON for inspection (read-only; writes nothing).
if (require.main === module) {
  const model = computeRuntimeModel(process.cwd());
  process.stdout.write(JSON.stringify(model, null, 2) + "\n");
}
