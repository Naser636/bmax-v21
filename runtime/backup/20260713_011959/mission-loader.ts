import fs from "node:fs";

export interface RuntimeMission {
  id: string;
  name: string;
  projectContext: unknown;
}

export class MissionLoader {
  constructor(
    private readonly projectContextPath =
      "runtime/generated/project-context.json"
  ) {}

  load(id: string, name: string): RuntimeMission {
    const projectContext = JSON.parse(
      fs.readFileSync(this.projectContextPath, "utf8")
    );

    return {
      id,
      name,
      projectContext
    };
  }
}
