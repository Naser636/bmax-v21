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

    const projectContext = JSON.parse(
      fs.readFileSync(this.projectContextPath, "utf8")
    );

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
}
