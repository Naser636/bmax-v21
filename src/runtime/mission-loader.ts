import fs from "node:fs";
import { MissionIntent, MissionExecutionMode } from "./mission-intent";

export interface ObjectiveSpec {
  id: string;
  goal: string;
  doneWhen: string[];
  // A4-strict (Phase 1): OPTIONAL declarative dependencies — ids of other objectives in the
  // same contract that must precede this one. Empty when the contract declares none.
  dependsOn: string[];
  // Campaign 04 (Path B authoring): OPTIONAL explicit proof binding — the NAME of a probe/evidence
  // already registered in capability-probes that authoritatively verifies this objective's expected
  // outcome. TRANSPORT ONLY here: carried VERBATIM, never interpreted, never evaluated, and never
  // turned into a verdict by the loader; done_when is NOT used as a binding. null when the objective
  // declares no proof (= no semantic proof declared). Consumption as a gate is NOT authorized yet.
  proof: string | null;
}

// S2 (Campaign 03): the mission's governance, carried VERBATIM from its contract into the plan.
// Transport only — no interpretation and no enforcement here. Existing readers (mission-cli,
// autonomy-runtime-adapter, provider-activation, runtime/core) keep reading the contract directly.
export interface MissionPolicies {
  policies: string[];
  permissions: unknown | null;
  authorizedPaths: string[];
  executionPolicy: unknown | null;
}

// S3 (Campaign 03 — Semantic Mission Compiler): the mission's CONTRACT outcome fields,
// carried VERBATIM from its contract into the plan. Transport only — no interpretation and
// no enforcement here (DoD/completion are NOT gated; verify is NOT merged into step
// verificationRequirements). A single verify entry binds a CAPABILITY to the EVIDENCE that
// proves it, exactly as the contract declares.
export interface VerifyRequirement {
  capability: string;
  evidence: string;
}
export interface MissionContract {
  definitionOfDone: string[];
  completion: string[];
  verify: VerifyRequirement[];
}

export interface RuntimeMission {
  id: string;
  name: string;
  projectContext: unknown;
  // S1: the mission's INTENT, derived from its own contract (not a static stub).
  intent: MissionIntent;
  // S2: the mission's governance, carried verbatim from its contract.
  policies: MissionPolicies;
  // S3: the mission's CONTRACT outcome fields (DoD/completion/verify), carried verbatim.
  contract: MissionContract;
  brain: {
    loaded: boolean;
    objectives: string[];
    objectiveSpecs: ObjectiveSpec[];
    nextObjective: string | null;
  };
}

export class MissionLoader {
  constructor(
    private readonly projectContextPath =
      "runtime/generated/project-context.snapshot",
    private readonly brainPath =
      "runtime/brain/MASTER_PLAN.md",
    private readonly missionsDir =
      "runtime/missions"
  ) {}

  load(id: string, name: string): RuntimeMission {

    const projectContext = this.readProjectContext();

    // ROOT CAUSE #1: objectives are a function of the REQUESTED mission, resolved by id:
    //   (1) the mission's own contract runtime/missions/<id>.json,
    //   (2) a deterministic per-mission fallback derived purely from id/name,
    //   (3) the legacy global MASTER_PLAN.md ONLY as a last resort.
    const objectiveSpecs = this.resolveObjectives(id, name);
    const objectives = objectiveSpecs.map(s => s.goal);

    const brain = {
      loaded: objectiveSpecs.length > 0,
      objectives,
      objectiveSpecs,
      nextObjective: objectives[0] ?? null
    };

    return {
      id,
      name,
      projectContext,
      intent: this.deriveIntent(id),
      policies: this.readPolicies(id),
      contract: this.readContract(id),
      brain
    };
  }

  /**
   * S3: carry the mission's CONTRACT outcome fields from its contract VERBATIM (transport
   * only; no interpretation, no enforcement). Tolerant: a missing/malformed contract yields
   * safe empty defaults. definitionOfDone accepts either `definition_of_done` or
   * `definitionOfDone` (as the existing readers do). verify keeps only well-formed
   * {capability, evidence} string pairs, preserved as declared. Pure (contract read; no
   * Date/randomness).
   */
  private readContract(id: string): MissionContract {
    let contract: {
      definition_of_done?: unknown;
      definitionOfDone?: unknown;
      completion?: unknown;
      verify?: unknown;
    } = {};
    try {
      contract = JSON.parse(fs.readFileSync(`${this.missionsDir}/${id}.json`, "utf8"));
    } catch {
      contract = {};
    }

    const asStrings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === "string") : [];

    const rawDoD = contract.definition_of_done ?? contract.definitionOfDone;
    const definitionOfDone = asStrings(rawDoD);
    const completion = asStrings(contract.completion);

    const verify: VerifyRequirement[] = Array.isArray(contract.verify)
      ? contract.verify
          .filter(
            (v: unknown): v is { capability: string; evidence: string } =>
              !!v &&
              typeof v === "object" &&
              typeof (v as any).capability === "string" &&
              typeof (v as any).evidence === "string"
          )
          .map(v => ({ capability: v.capability, evidence: v.evidence }))
      : [];

    return { definitionOfDone, completion, verify };
  }

  /**
   * S2: carry the mission's governance from its contract VERBATIM (transport only; no
   * interpretation, no enforcement). Tolerant: a missing/malformed contract yields safe empty
   * defaults. authorizedPaths accepts either `authorized_paths` or `authorizedPaths` (as the
   * existing readers do). Pure (contract read; no Date/randomness).
   */
  private readPolicies(id: string): MissionPolicies {
    let contract: {
      policies?: unknown;
      permissions?: unknown;
      authorized_paths?: unknown;
      authorizedPaths?: unknown;
      executionPolicy?: unknown;
    } = {};
    try {
      contract = JSON.parse(fs.readFileSync(`${this.missionsDir}/${id}.json`, "utf8"));
    } catch {
      contract = {};
    }

    const policies = Array.isArray(contract.policies)
      ? contract.policies.filter((p: unknown): p is string => typeof p === "string")
      : [];

    const rawPaths = contract.authorized_paths ?? contract.authorizedPaths;
    const authorizedPaths = Array.isArray(rawPaths)
      ? rawPaths.filter((p: unknown): p is string => typeof p === "string")
      : [];

    const permissions =
      contract.permissions !== undefined ? contract.permissions : null;
    const executionPolicy =
      contract.executionPolicy !== undefined ? contract.executionPolicy : null;

    return { policies, permissions, authorizedPaths, executionPolicy };
  }

  /**
   * S1: derive the mission INTENT from its own contract (runtime/missions/<id>.json).
   * EXACT mapping only (no synonyms): `mode` is honoured only when it already matches a
   * MissionExecutionMode, otherwise UNKNOWN — the raw contract mode is preserved in `type`
   * so no fidelity is lost. priority/objective come from the contract, with safe defaults.
   * Pure (contract read + mapping; no Date/randomness). createMissionIntent is NOT touched.
   */
  private deriveIntent(id: string): MissionIntent {
    let contract: { mode?: unknown; priority?: unknown; description?: unknown } = {};
    try {
      contract = JSON.parse(fs.readFileSync(`${this.missionsDir}/${id}.json`, "utf8"));
    } catch {
      contract = {};
    }

    const ENUM_MODES: MissionExecutionMode[] =
      ["ANALYZE", "PLAN", "IMPLEMENT", "VALIDATE", "LEARN"];
    const rawMode = typeof contract.mode === "string" ? contract.mode : "";
    const mode: MissionExecutionMode =
      (ENUM_MODES as string[]).includes(rawMode)
        ? (rawMode as MissionExecutionMode)
        : "UNKNOWN";

    const priority =
      typeof contract.priority === "string" && contract.priority
        ? contract.priority
        : "NORMAL";

    const description =
      typeof contract.description === "string" && contract.description
        ? contract.description.split(/\r?\n/)[0].trim()
        : "";

    return {
      mission: id,
      type: rawMode || "GENERIC",
      objective: description || "Generic mission",
      priority,
      mode
    };
  }

  private resolveObjectives(id: string, name: string): ObjectiveSpec[] {
    const fromContract = this.readContractObjectives(id);
    if (fromContract.length > 0) {
      return fromContract;
    }

    const derived = this.deriveObjectives(id, name);
    if (derived.length > 0) {
      return derived;
    }

    return this.readGlobalObjectives();
  }

  /**
   * (1) Per-mission contract: runtime/missions/<id>.json. Normalizes BOTH objective
   * shapes seen in the contracts: object[] ({ id, goal, done_when }) and string[].
   * Read-only and tolerant: a missing/malformed contract yields [] (fall through).
   */
  private readContractObjectives(id: string): ObjectiveSpec[] {
    if (!id) return [];
    let spec: { objectives?: unknown };
    try {
      spec = JSON.parse(fs.readFileSync(`${this.missionsDir}/${id}.json`, "utf8"));
    } catch {
      return [];
    }
    const raw = Array.isArray(spec.objectives) ? spec.objectives : [];
    return raw
      .map((o: any, i: number): ObjectiveSpec => {
        if (o && typeof o === "object" && !Array.isArray(o)) {
          return {
            id: typeof o.id === "string" && o.id ? o.id : `OBJECTIVE_${i + 1}`,
            goal:
              typeof o.goal === "string" && o.goal
                ? o.goal
                : typeof o.id === "string" && o.id
                ? o.id
                : `Objective ${i + 1}`,
            doneWhen: Array.isArray(o.done_when)
              ? o.done_when.filter((d: unknown): d is string => typeof d === "string")
              : [],
            dependsOn: Array.isArray(o.dependsOn)
              ? o.dependsOn.filter((d: unknown): d is string => typeof d === "string")
              : [],
            // Campaign 04: carry the OPTIONAL proof binding verbatim (an opaque probe name).
            // Absent / non-string / empty ⇒ null. No lookup, no evaluation, no verdict here.
            proof: typeof o.proof === "string" && o.proof ? o.proof : null
          };
        }
        return { id: `OBJECTIVE_${i + 1}`, goal: String(o), doneWhen: [], dependsOn: [], proof: null };
      })
      .filter(s => s.goal.length > 0);
  }

  /**
   * (2) Deterministic per-mission fallback (PURE function of id/name) so two different
   * contract-less missions still yield DIFFERENT objectives while the same mission is
   * stable (A1 control + C3 determinism). No Date/randomness.
   */
  private deriveObjectives(id: string, name: string): ObjectiveSpec[] {
    const key = (id || name || "").trim();
    if (!key) return [];
    const label = (name && name.trim()) || id;
    return [
      {
        id: "OBJECTIVE_1",
        goal: `Fulfil mission ${id}: ${label}`,
        doneWhen: [`Mission ${id} objectives are satisfied.`],
        dependsOn: [],
        proof: null
      }
    ];
  }

  /** (3) Last-resort legacy global source (MASTER_PLAN.md). */
  private readGlobalObjectives(): ObjectiveSpec[] {
    if (!fs.existsSync(this.brainPath)) return [];
    return fs
      .readFileSync(this.brainPath, "utf8")
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => /^\d+\./.test(l))
      .map((l, i) => ({ id: `OBJECTIVE_${i + 1}`, goal: l, doneWhen: [], dependsOn: [], proof: null }));
  }

  /**
   * Read the project-context snapshot defensively. The snapshot is meant to be JSON
   * (see ProjectContext.generate), but a legacy/stale snapshot may be a plain text
   * listing. Rather than crash the whole Runtime — which would make local mission
   * execution impossible — fall back to the raw content or null so a mission can still
   * be planned and executed by src/runtime.
   */
  private readProjectContext(): unknown {
    let raw: string;
    try {
      raw = fs.readFileSync(this.projectContextPath, "utf8");
    } catch {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
}
