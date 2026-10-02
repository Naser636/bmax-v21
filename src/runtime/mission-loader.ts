import fs from "node:fs";

export interface ObjectiveSpec {
  id: string;
  goal: string;
  doneWhen: string[];
}

export interface RuntimeMission {
  id: string;
  name: string;
  projectContext: unknown;
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
      brain
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
              : []
          };
        }
        return { id: `OBJECTIVE_${i + 1}`, goal: String(o), doneWhen: [] };
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
        doneWhen: [`Mission ${id} objectives are satisfied.`]
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
      .map((l, i) => ({ id: `OBJECTIVE_${i + 1}`, goal: l, doneWhen: [] }));
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
