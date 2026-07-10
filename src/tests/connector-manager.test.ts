import { ConnectorManager } from "@/core/connector-manager";
import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";

async function main() {
  const manager = new ConnectorManager();

  manager.register(new ApiConnector());
  manager.register(new WebConnector());

  console.assert((await manager.connectAll()).every(Boolean));
  console.assert((await manager.healthAll()).every(Boolean));

  await manager.disconnectAll();

  console.log("Connector Manager OK");
}

void main();
