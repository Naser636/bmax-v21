import { IntegrationContext } from "@/core/integration-context";
import { IntegrationResult } from "@/core/integration-result";

export interface IntegrationPipeline {
  execute(context: IntegrationContext): Promise<IntegrationResult>;
}
