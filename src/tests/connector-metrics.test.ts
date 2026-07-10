import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { collectConnectorMetrics } from "@/core/connector-metrics";

async function main() {
  const metrics = await collectConnectorMetrics([
    new ApiConnector(),
    new WebConnector(),
  ]);

  console.assert(metrics.total === 2);
  console.assert(metrics.healthy === 2);

  console.log("Connector Metrics OK");
}

void main();
