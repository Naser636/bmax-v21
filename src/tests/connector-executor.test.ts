import { ApiConnector } from "@/core/api-connector";
import { executeConnector } from "@/core/connector-executor";

async function main() {
  console.assert(
    await executeConnector(new ApiConnector())
  );

  console.log("Connector Executor OK");
}

void main();
