#!/usr/bin/env node
/**
 * Runtime Model — the single deterministic source of truth for Runtime state.
 *
 * WHY THIS EXISTS
 * ---------------
 * Before this module the Dashboard read four artefacts that no component produced coherently:
 *   - runtime/generated/runtime-state.json  was EMPTY   → Pipeline / Brain rendered UNKNOWN.
 *   - runtime/generated/runtime-mission-queue.json  was absent → Next Mission fell back to the
 *     hard-coded "SYSTEM_READY" in runtime-status.json.
 *   - capability-registry.json was written PER MISSION by capability-registry.js from the last
 *     mission's execution-plan objectives, so it advertised (e.g.) "SELF_ENGINEERING_RUNTIME_KERNEL_1"
 *     as a "missing capability" — an incoherent, mission-scoped view masquerading as global state.
 *
 * This module computes ONE coherent model from the artefacts that already exist on disk. It performs
 * NO writes and NO timestamps (DETERMINISM_FIRST): the same repo state always yields the same model.
 * The writer (runtime/bin/odg-state.js) is the only place side effects and `generatedAt` live.
 *
 * A mission is EXECUTABLE iff its contract (runtime/missions/<NAME>.json) declares at least one
 * objective — the SAME guard the Mission Loader and the autonomy adapter enforce. The Dashboard and
 * the mission queue only ever surface executable missions, so a contract with no objectives (or no
 * contract at all) can never be proposed as a runnable "Next Mission".
 */
"use strict";

const fs = require("fs");
const path = require("path");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** First objective of a raw contract, normalised to {id, goal} (handles string and object shapes). */
function firstObjective(raw, mission) {
  const objs = Array.isArray(raw && raw.objectives) ? raw.objectives : [];
  if (objs.length === 0) return null;
  const o = objs[0];
  if (typeof o === "string") return { id: `${mission}_1`, goal: o };
  return {
    id: typeof o.id === "string" ? o.id : `${mission}_1`,
    goal: typeof o.goal === "string" ? o.goal : "",
  };
}

function objectiveCount(raw) {
  return Array.isArray(raw && raw.objectives) ? raw.objectives.length : 0;
}

function requiresEngineering(raw) {
  return raw ? raw.requires_engineering === true || raw.requiresEngineering === true : false;
}

/**
 * Compute the coherent Runtime model from on-disk artefacts.
 * @param {string} root repository root (defaults to process.cwd()).
 * @returns a pure, timestamp-free model.
 */
function computeRuntimeModel(root = process.cwd()) {
  const G = (rel) => path.join(root, "runtime", "generated", rel);
  const MISSIONS = path.join(root, "runtime", "missions");
  const PENDING = path.join(MISSIONS, "pending");

  // --- proven set from the immutable ledger (proven === true only) ---------------------------
  const ledger = readJson(G("mission-ledger.json")) || { entries: [] };
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const provenSet = new Set(
    entries.filter((e) => e && e.proven === true && typeof e.mission === "string").map((e) => e.mission),
  );
  const lastMission = entries.length > 0 ? entries[entries.length - 1].mission : null;

  // --- last-run validation verdict (RC-5) ----------------------------------------------------
  // The INDEPENDENT validation verdict (validation-engine writes mission-report.json). This is the
  // 'last execution' fact — DISTINCT from the durable 'proven/released' fact the ledger carries. It
  // is read-only and NEVER feeds provenSet / queue / nextMission (governance owns those); it is
  // surfaced so the Dashboard can annotate state with the real verdict instead of contradicting it.
  const report = readJson(G("mission-report.json"));
  const lastRun =
    report && typeof report.mission === "string"
      ? { mission: report.mission, status: typeof report.status === "string" ? report.status : null, validated: report.validated === true }
      : null;

  // --- classify every mission contract on disk -----------------------------------------------
  let files = [];
  try {
    files = fs.readdirSync(MISSIONS).filter((f) => f.endsWith(".json")).sort();
  } catch {
    files = [];
  }

  // Which incomplete contracts already have a repair nomination queued (pending/FIX_<NAME>.json).
  let pendingFixes = new Set();
  try {
    pendingFixes = new Set(
      fs.readdirSync(PENDING).filter((f) => f.startsWith("FIX_") && f.endsWith(".json")),
    );
  } catch {
    pendingFixes = new Set();
  }

  const missions = [];
  const broken = [];
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
      // Classify a NON-executable file so an incomplete "contract" that is really an evidence pack or
      // an orchestration plan is SKIPPED (never a blocking "author the contract" item), while a real
      // mission missing its objectives is flagged NEEDS_CONTRACT for repair.
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
    ? roadmap.missions.map((m) => m && m.id).filter((x) => typeof x === "string")
    : [];
  const roadmapOrder = new Map(roadmapIds.map((id, i) => [id, i]));

  // --- executable-but-unproven work-list (the real forward gap) ------------------------------
  const executableUnproven = missions.filter((m) => m.executable && !m.proven);
  // Order: roadmap order first (in manifest order), then remaining alphabetical — deterministic.
  executableUnproven.sort((a, b) => {
    const ra = roadmapOrder.has(a.mission) ? roadmapOrder.get(a.mission) : Number.MAX_SAFE_INTEGER;
    const rb = roadmapOrder.has(b.mission) ? roadmapOrder.get(b.mission) : Number.MAX_SAFE_INTEGER;
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
  // Disposition:
  //   - evidence-pack / orchestration-plan → SKIPPED (not an executable mission; wrong artifact kind
  //     for the missions dir), with a concrete reason. It can never be a runnable "Next Mission".
  //   - a real mission with no objectives → NEEDS_CONTRACT: a blocker for human/RootCauseEngine
  //     authoring (a repair nomination may already sit in runtime/missions/pending/FIX_<NAME>.json).
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
  // A real mission contract that declares no runnable objectives (disposition NEEDS_CONTRACT) is
  // work that will NEVER appear in the executable queue, yet it is unfinished. The mission mandate
  // is explicit: "Ne jamais conclure SYSTEM_READY uniquement parce que la Queue est vide." So the
  // headline must not claim convergence while any NEEDS_CONTRACT gap exists. (SKIPPED items — an
  // evidence pack or orchestration plan in the missions dir — are the wrong artifact kind, not
  // pending work, so they are excluded here.)
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
  const missionByName = new Set(missions.map((m) => m.mission));
  const roadmapResolves =
    roadmapIds.length > 0 &&
    roadmapIds.every((id) => {
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

  // Honest Next Mission: the runnable queue first; otherwise the first outstanding gap requiring a
  // contract/decision; only truly "SYSTEM_READY" when nothing runnable AND nothing outstanding.
  const nextMission =
    queue.length > 0
      ? queue[0].mission
      : outstanding.length > 0
        ? outstanding[0].mission
        : "SYSTEM_READY";
  // Core-runtime HEALTH (pipeline + brain) is deliberately separate from campaign CONVERGENCE: the
  // runtime can be healthy (READY) while gaps remain outstanding. `converged` is the honest
  // "nothing left to do" signal; `runtime` stays the load-bearing health headline (unchanged).
  const runtime = pipeline === "READY" && brain === "READY" ? "READY" : "DEGRADED";

  return {
    // headline state (runtime-state.json / runtime-status.json)
    runtime,
    foundation,
    pipeline,
    brain,
    status: runtime,
    converged,
    lastMission,
    nextMission,
    lastRun, // RC-5: last validation verdict (mission-report.json), read-only; never feeds the queue
    // registries
    capabilities,
    missingCapabilities,
    outstanding,
    // queue + scan detail
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
    // raw classification (consumers that want per-mission detail)
    missions,
  };
}

module.exports = { computeRuntimeModel };

// CLI: print the model as JSON for inspection (read-only; writes nothing).
if (require.main === module) {
  const model = computeRuntimeModel(process.cwd());
  process.stdout.write(JSON.stringify(model, null, 2) + "\n");
}
