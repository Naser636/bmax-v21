/*
 * Patch Engine — TypeScript canonical (Lot η2 migration; strict-typed in η2-T). Faithful port of the
 * historical runtime/core/patch-engine.js; behaviour (reads runtime/generated/decision.json, writes
 * runtime/generated/patch-plan.json, all transport-only passthroughs, the console lines) is byte-identical.
 * Deterministic: no wall-clock stamp — identical mission ⇒ identical patch-plan.json. The legacy .js is
 * untouched and remains the production default; reached ONLY via the ODG_STAGE_BASE opt-in. Types verified
 * under tsconfig.runtime-leaves-strict.json (strict: true, noEmit) — NO ts-nocheck.
 */
import * as fs from "fs";

interface Edit {
  target: string;
  content?: string;
  diff?: string;
}
interface Objective {
  id: string;
  goal?: string;
  done_when?: unknown;
  patch?: unknown;
  actionContract?: unknown;
  git_branch_integration?: unknown;
  authoredBy?: string;
}
interface Decision {
  mission: string;
  mode?: unknown;
  priority?: unknown;
  requiresEngineering?: unknown;
  authorizedPaths?: unknown;
  actions: string[];
  objectives: Objective[];
  research_acquisition?: unknown;
}
interface PlannedPatch {
  id: number;
  action: string;
  objectiveId: string;
  goal?: string;
  done_when: unknown;
  priority: unknown;
  status: string;
  edits?: Edit[];
  research_acquisition?: unknown;
  actionContract?: unknown;
  git_branch_integration?: unknown;
  authoredBy?: string;
}

function readJsonSafe(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const decision = readJsonSafe("runtime/generated/decision.json") as Decision | null;
if (!decision || !Array.isArray(decision.objectives)) {
  console.error("STOP: decision.json missing or malformed — Decision Engine must run first.");
  process.exit(1);
}
// Past the guard, `decision` is a non-null Decision.
const d: Decision = decision;

const objectivesById = new Map<string, Objective>(d.objectives.map((o: Objective) => [o.id, o]));

/*
 * Normalize an objective's optional `patch` payload into a list of concrete edits.
 * Pure and order-preserving ⇒ deterministic: identical objectives yield identical edits.
 */
function normalizeEdits(objective: Objective | null): Edit[] {
  if (!objective || !objective.patch) return [];
  const raw: unknown[] = Array.isArray(objective.patch) ? objective.patch : [objective.patch];
  const edits: Edit[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const rec = e as { target?: unknown; path?: unknown; file?: unknown; content?: unknown; diff?: unknown };
    const target =
      typeof rec.target === "string" ? rec.target :
      typeof rec.path === "string" ? rec.path :
      typeof rec.file === "string" ? rec.file : null;
    if (!target) continue;
    if (typeof rec.content === "string") {
      edits.push({ target, content: rec.content });
    } else if (typeof rec.diff === "string") {
      edits.push({ target, diff: rec.diff });
    }
  }
  return edits;
}

const patches: PlannedPatch[] = d.actions.map((action: string, index: number) => {
  const objective = objectivesById.get(action) || null;
  const edits = normalizeEdits(objective);
  const patch: PlannedPatch = {
    id: index + 1,
    action,
    objectiveId: action,
    goal: objective ? objective.goal : "",
    done_when: objective ? objective.done_when : [],
    priority: d.priority,
    status: edits.length ? "READY_TO_APPLY" : "PLANNED",
  };
  if (edits.length) patch.edits = edits;
  if (d.research_acquisition && typeof d.research_acquisition === "object") {
    patch.research_acquisition = d.research_acquisition;
  }
  if (objective && objective.actionContract && typeof objective.actionContract === "object") {
    patch.actionContract = objective.actionContract;
  }
  if (objective && objective.git_branch_integration && typeof objective.git_branch_integration === "object") {
    patch.git_branch_integration = objective.git_branch_integration;
  }
  if (objective && typeof objective.authoredBy === "string" && objective.authoredBy) {
    patch.authoredBy = objective.authoredBy;
  }
  return patch;
});

const patch = {
  mission: d.mission,
  mode: d.mode,
  status: "READY",
  priority: d.priority,
  requiresEngineering: d.requiresEngineering === true,
  authorizedPaths: Array.isArray(d.authorizedPaths) ? d.authorizedPaths : [],
  actions: d.actions,
  summary: {
    objectives: d.objectives.length,
    plannedPatches: patches.length,
  },
  patches,
};

fs.mkdirSync("runtime/generated", { recursive: true });
fs.writeFileSync(
  "runtime/generated/patch-plan.json",
  JSON.stringify(patch, null, 2),
);

console.log("======================================");
console.log("PATCH ENGINE v4 (mission-driven)");
console.log("======================================");
console.log("Mission  :", patch.mission);
console.log("Priority :", patch.priority);
console.log("Patches  :", patch.patches.length);
for (const p of patch.patches) console.log(` - #${p.id} ${p.objectiveId}`);
console.log("======================================");
