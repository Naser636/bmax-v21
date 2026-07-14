import { ProjectContext } from "./project-context";
import { BusinessContext } from "./business-context";
import { CapabilityRegistry } from "./capability-registry";
import { ExecutionPlannerContext } from "./execution-planner-context";

export class ContextEngine {

  private readonly context = new ProjectContext();
  private readonly business = new BusinessContext();
  private readonly registry = new CapabilityRegistry();
  private readonly planner = new ExecutionPlannerContext();

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
    const planner = this.planner.build();

    const runtime = {
      generatedAt: new Date().toISOString(),
      project,
      business,
      capabilities,
      planner
    };

    return runtime;
  }

}
