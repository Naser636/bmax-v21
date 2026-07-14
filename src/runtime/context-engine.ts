import { ProjectContext } from "./project-context";

export class ContextEngine {

  private readonly context = new ProjectContext();

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
    return this.context.generate();
  }

}
