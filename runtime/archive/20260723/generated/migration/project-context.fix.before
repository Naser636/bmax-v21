import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

export class ProjectContext {

  generate(output = "runtime/generated/project-context.json") {

    const files = execSync(
      'find . -maxdepth 2 \\( -name package.json -o -name tsconfig.json -o -name "*.md" -o -name "*.json" \\) | sort',
      { encoding: "utf8" }
    ).trim().split("\n");

    const context = {
      generatedAt: new Date().toISOString(),
      gitCommit: execSync("git rev-parse --short HEAD",{encoding:"utf8"}).trim(),
      branch: execSync("git branch --show-current",{encoding:"utf8"}).trim(),
      files
    };

    writeFileSync(output, JSON.stringify(context,null,2));
    return context;
  }

}
