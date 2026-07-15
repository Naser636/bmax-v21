import * as fs from "node:fs";

export interface RuntimeSystem {
  constitution: string;
  roadmap: string;
  policies: string;
  standards: string;
}

function loadOrFallback(path: string): string {
  return fs.existsSync(path)
    ? fs.readFileSync(path, "utf8")
    : path;
}

export class SystemLoader {
  load(): RuntimeSystem {
    return {
      constitution: loadOrFallback("runtime/system/CONSTITUTION.md"),
      roadmap: loadOrFallback("runtime/system/ROADMAP.md"),
      policies: loadOrFallback("runtime/system/POLICIES.md"),
      standards: loadOrFallback("runtime/system/STANDARDS.md")
    };
  }
}
