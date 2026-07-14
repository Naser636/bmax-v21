import { ProjectContext } from "./project-context";
import { BusinessContext } from "./business-context";
import { CapabilityRegistry } from "./capability-registry";

export class ContextEngine {

  private readonly context = new ProjectContext();
  private readonly business = new BusinessContext();
  private readonly registry = new CapabilityRegistry();

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
    const capabilities = this.registry.build();

    return {
      project,
      business,
      capabilities
    };
  }

}
