import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { runConnectorPipeline } from "@/core/connector-pipeline";

async function main() {
  const ok = await runConnectorPipeline([
    new ApiConnector(),
    new WebConnector(),
  ]);

  console.assert(ok);

  console.log("Connector Pipeline OK");
}

void main();
