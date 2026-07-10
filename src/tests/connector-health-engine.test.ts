import { ApiConnector } from "@/core/api-connector";
import { checkConnectorHealth } from "@/core/connector-health-engine";

async function main() {
  const status = await checkConnectorHealth(new ApiConnector());

  console.assert(status === "UP");

  console.log("Connector Health Engine OK");
}

void main();
