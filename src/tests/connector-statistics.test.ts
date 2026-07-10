import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { getConnectorStatistics } from "@/core/connector-statistics";

async function main() {
  const stats = await getConnectorStatistics([
    new ApiConnector(),
    new WebConnector(),
  ]);

  console.assert(stats.total === 2);
  console.assert(stats.healthy === 2);
  console.assert(stats.unhealthy === 0);

  console.log("Connector Statistics OK");
}

void main();
