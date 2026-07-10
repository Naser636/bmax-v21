import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import {
  startConnectors,
  stopConnectors,
} from "@/core/connector-lifecycle";

async function main() {
  const connectors = [
    new ApiConnector(),
    new WebConnector(),
  ];

  console.assert((await startConnectors(connectors)).every(Boolean));

  await stopConnectors(connectors);

  console.log("Connector Lifecycle OK");
}

void main();
