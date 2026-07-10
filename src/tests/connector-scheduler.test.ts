import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { runConnectorScheduler } from "@/core/connector-scheduler";

async function main() {
  const result = await runConnectorScheduler([
    new ApiConnector(),
    new WebConnector(),
  ]);

  console.assert(result.length === 2);
  console.assert(result.every(Boolean));

  console.log("Connector Scheduler OK");
}

void main();
