import { IntegrationContext } from "@/core/integration-context";
import { IntegrationPipeline } from "@/core/integration-pipeline";

export class IntegrationOrchestrator {
  constructor(private readonly pipeline: IntegrationPipeline) {}

  run(context: IntegrationContext) {
    return this.pipeline.execute(context);
  }
}
