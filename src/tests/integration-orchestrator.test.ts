import { IntegrationOrchestrator } from "@/core/integration-orchestrator";
import { IntegrationPipeline } from "@/core/integration-pipeline";

const pipeline: IntegrationPipeline = {
  async execute() {
    return {
      healthy: true,
      results: [],
    };
  },
};

const orchestrator = new IntegrationOrchestrator(pipeline);

console.assert(typeof orchestrator.run === "function");

console.log("Integration Orchestrator OK");
