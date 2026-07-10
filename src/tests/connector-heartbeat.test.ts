import { ApiConnector } from "@/core/api-connector";
import { heartbeatConnector } from "@/core/connector-heartbeat";

async function main() {
  console.assert(
    await heartbeatConnector(new ApiConnector())
  );

  console.log("Connector Heartbeat OK");
}

void main();
