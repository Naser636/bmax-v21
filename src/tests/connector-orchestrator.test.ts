import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { runConnectorOrchestrator } from "@/core/connector-orchestrator";

async function main() {
  const ok = await runConnectorOrchestrator([
    new ApiConnector(),
    new WebConnector(),
  ]);

  console.assert(ok);

  console.log("Connector Orchestrator OK");
}

void main();
