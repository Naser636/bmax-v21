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
// V60 PHASE 1 — a proven ledger entry's `mission` only counts as a proven capability/mission when it is a
// genuine mission IDENTIFIER, not a parsing accident. The immutable append-only ledger holds entries whose
// `mission` was mis-captured from a CLI invocation (e.g. "--help", "--repair-mandate") or carries a free-text
// goal sentence (whitespace). Those are NOT capabilities and inflated the dashboard "Available capabilities".
// Filter at PROJECTION time (the ledger is NEVER mutated): a mission id has no leading "-" and no whitespace.
function isMissionIdentifier(m: any): boolean {
  return typeof m === "string" && m.length > 0 && !/^\s*-/.test(m) && !/\s/.test(m);
}

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

// A valid mission identifier: a token starting with a letter, then letters/digits/underscores only.
// Rejects CLI-flag captures ("--help", "--repair-mandate") and free-text sentences ("Register the new
// capabilities ...") that argv/NL ingestion can drop into runtime/missions/ — those are NOT real work
// and must never surface as an executable Next Mission. Valid ids including NL_* match unchanged.
const VALID_MISSION_ID = /^[A-Za-z][A-Za-z0-9_]*$/;

// A mission is RESERVED (human-gated) when it declares objectives and EVERY objective is
// governance-excluded via its explicit `authorization` declaration (eligible===false OR
// excluded===true) — e.g. a production-deployment contract whose objective is reserved for a
// separate human CTO authorization. The declaration already lives in the contract (not invented
// here), so this is a read of the SAME authorization signal CM-5 projects. A reserved mission is
// NON-executable for autonomous selection (it must not sit at the head of the queue and stall all
// unrelated work) but is PRESERVED and surfaced with a RESERVED disposition — visible, reversible
// (the human gate opens by a separate authorized action), never hidden or marked complete.
// Additive + field-gated: a contract with no excluded objectives is unaffected (parity-safe).
function reservedMission(raw: any): boolean {
  const objs = Array.isArray(raw && raw.objectives) ? raw.objectives : [];
  if (objs.length === 0) return false;
  return objs.every((o: any) => {
    const a = o && typeof o === "object" ? o.authorization : null;
    return !!a && (a.eligible === false || a.excluded === true);
  });
}

function reservedReason(raw: any): string {
  const objs = Array.isArray(raw && raw.objectives) ? raw.objectives : [];
  for (const o of objs) {
    const a = o && typeof o === "object" ? o.authorization : null;
    if (a && typeof a.reason === "string" && a.reason) return a.reason;
  }
  return "human-gated: all objectives are governance-excluded (reserved for a separate authorization)";
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
    entries.filter((e: any) => e && e.proven === true && isMissionIdentifier(e.mission)).map((e: any) => e.mission),
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
    // CM-3 governed deprecation: a contract may declare governedStatus:"DEPRECATED" (with a reason +
    // coveredBy) when its intent is proven covered by an existing mechanism. It is then NON-executable
    // (excluded from the forward queue/missing) but PRESERVED on disk and reported with a DEPRECATED
    // disposition — traceable, reversible (remove the field), never deleted. Additive + field-gated: a
    // contract without the field is byte-identical to before (parity-safe).
    const deprecated = raw.governedStatus === "DEPRECATED";
    const reserved = !deprecated && reservedMission(raw);
    const invalidId = !VALID_MISSION_ID.test(name);
    missions.push({
      mission: name,
      objectives: count,
      executable: count > 0 && !deprecated && !reserved && !invalidId,
      invalidId,
      deprecated,
      reserved,
      reservedReason: reserved ? reservedReason(raw) : null,
      deprecationReason: typeof raw.deprecationReason === "string" ? raw.deprecationReason : null,
      coveredBy: typeof raw.coveredBy === "string" ? raw.coveredBy : null,
      requiresEngineering: requiresEngineering(raw),
      priority: typeof raw.priority === "string" ? raw.priority : "NORMAL",
      proven: provenSet.has(name),
      first: firstObjective(raw, name),
      kind:
        typeof raw.evidencePackContractVersion === "string"
          ? "evidence-pack"
          : Array.isArray(raw.roadmaps) || raw.mode === "AUTONOMOUS_ORCHESTRATION"
            ? "orchestration-plan"
            : // A mission file whose NAME is not a valid mission identifier is an argv/NL capture
              // artifact ("--help", "--repair-mandate", a free-text sentence), NOT real work — it must
              // never surface as an executable Next Mission. Classify it as a non-mission so it is
              // SKIPPED (see incompleteContracts). Additive: valid ids (incl. NL_*) are unaffected.
              VALID_MISSION_ID.test(name)
              ? "mission"
              : "invalid-id",
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
      const disposition = m.deprecated ? "DEPRECATED" : m.reserved ? "RESERVED" : skipped ? "SKIPPED" : "NEEDS_CONTRACT";
      const reason = m.deprecated
        ? "governed-deprecated: " + (m.deprecationReason || "intent covered by an existing mechanism") + (m.coveredBy ? ` (covered by ${m.coveredBy})` : "")
        : m.reserved
          ? "reserved (human-gated): " + m.reservedReason
          : skipped
            ? m.kind === "evidence-pack"
              ? "file is an evidence pack, not a mission contract"
              : m.kind === "invalid-id"
                ? "not a valid mission identifier (CLI-flag / free-text capture artifact, not real work)"
                : "file is an orchestration plan, not a leaf mission contract"
            : "mission contract declares no objectives (Mission Loader guard)";
      return {
        mission: m.mission,
        objectives: m.deprecated || m.reserved ? m.objectives : 0,
        proven: m.proven,
        kind: m.deprecated ? "deprecated" : m.reserved ? "reserved" : m.kind,
        disposition,
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
  // A roadmap id RESOLVES when it maps to a recognized contract — executable, OR a legitimately
  // non-executable GOVERNED state: reserved (human-gated) or deprecated (intent covered). Only a
  // DANGLING reference (no contract) or a BROKEN one (NEEDS_CONTRACT / invalid-id) fails to resolve.
  // (A reserved roadmap mission is NOT a broken roadmap — it is valid work awaiting a human gate — so
  // it must not degrade brain health; that would be a false regression from the reserved-skip change.)
  const roadmapResolves =
    roadmapIds.length > 0 &&
    roadmapIds.every((id: string) => {
      const m = missions.find((x) => x.mission === id);
      return m && (m.executable || m.reserved || m.deprecated);
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
