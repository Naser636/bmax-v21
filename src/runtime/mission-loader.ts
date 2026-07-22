import fs from "node:fs";

export interface RuntimeMission {
  id: string;
  name: string;
  projectContext: unknown;
  brain: {
    loaded: boolean;
    objectives: string[];
    nextObjective: string | null;
  };
}

export class MissionLoader {
  constructor(
    private readonly projectContextPath =
      "runtime/generated/project-context.snapshot",
    private readonly brainPath =
      "runtime/brain/MASTER_PLAN.md"
  ) {}

  load(id: string, name: string): RuntimeMission {

    const projectContext = this.readProjectContext();

    let brain = {
      loaded: false,
      objectives: [] as string[],
      nextObjective: null as string | null
    };

    if (fs.existsSync(this.brainPath)) {

      const objectives = fs
        .readFileSync(this.brainPath, "utf8")
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => /^\d+\./.test(l));

      brain = {
        loaded: true,
        objectives,
        nextObjective: objectives[0] ?? null
      };

    }

    return {
      id,
      name,
      projectContext,
      brain
    };
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
