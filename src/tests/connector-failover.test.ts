import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { getFirstAvailableConnector } from "@/core/connector-failover";

async function main() {
  const connector = await getFirstAvailableConnector([
    new ApiConnector(),
    new WebConnector(),
  ]);

  console.assert(connector !== undefined);

  console.log("Connector Failover OK");
}

void main();
