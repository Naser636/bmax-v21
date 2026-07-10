import { ApiConnector } from "@/core/api-connector";
import { getConnectorHealth } from "@/core/connector-health-service";

async function main() {
  const status = await getConnectorHealth(new ApiConnector());

  console.assert(status === "UP");

  console.log("Connector Health Service OK");
}

void main();
