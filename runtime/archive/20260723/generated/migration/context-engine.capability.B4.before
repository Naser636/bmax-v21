import { ProjectContext } from "./project-context";
import { BusinessContext } from "./business-context";

export class ContextEngine {

  private readonly context = new ProjectContext();
  private readonly business = new BusinessContext();

  discover() {
    return this.context.generate();
  }

  analyze() {
    return this.context.generate();
  }

  validate() {
    return this.context.generate();
  }

  build() {
    const project = this.context.generate();
    const business = this.business.build(project);
    return { project, business };
  }

}
