export interface RuntimeSystem {
  constitution: string;
  roadmap: string;
  policies: string;
  standards: string;
}

export class SystemLoader {
  load(): RuntimeSystem {
    return {
      constitution: "runtime/system/CONSTITUTION.md",
      roadmap: "runtime/system/ROADMAP.md",
      policies: "runtime/system/POLICIES.md",
      standards: "runtime/system/STANDARDS.md"
    };
  }
}
