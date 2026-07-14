export interface BusinessContextModel {
  generatedAt: string;
  domain: string;
  objectives: string[];
  projectBranch: string;
  projectCommit: string;
}

import { ProjectContext } from "./project-context";

export class BusinessContext {

  private context?: BusinessContextModel;

  build(project: ReturnType<ProjectContext["generate"]>): BusinessContextModel {

    this.context = {
      generatedAt: new Date().toISOString(),
      domain: "UNKNOWN",
      projectBranch: project.branch,
      projectCommit: project.gitCommit,
      objectives: []
    };

    return this.context;
  }

  current() {
    return this.context;
  }

}
