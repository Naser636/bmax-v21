import { ProjectContext } from "./project-context";
import { RuntimeState } from "./runtime-state";

export class ContextEngine {

  private readonly context = new ProjectContext();
  private readonly state = new RuntimeState();

  discover() {
    const project = this.context.generate();
    this.state.initialize(project);
    return project;
  }

  analyze() {
    return this.discover();
  }

  validate() {
    return this.discover();
  }

  build() {
    return this.discover();
  }

}
