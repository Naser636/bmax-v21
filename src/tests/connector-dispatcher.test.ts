import { ApiConnector } from "@/core/api-connector";
import { dispatchConnector } from "@/core/connector-dispatcher";

async function main() {
  console.assert(await dispatchConnector(new ApiConnector()));

  console.log("Connector Dispatcher OK");
}

void main();
