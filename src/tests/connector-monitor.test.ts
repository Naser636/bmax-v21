import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { monitorConnectors } from "@/core/connector-monitor";

async function main() {
  const result = await monitorConnectors([
    new ApiConnector(),
    new WebConnector(),
  ]);

  console.assert(result[0] === "UP");
  console.assert(result[1] === "UP");

  console.log("Connector Monitor OK");
}

void main();
