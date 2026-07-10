import { ApiConnector } from "@/core/api-connector";
import { ConnectorRuntime } from "@/core/connector-runtime";

const runtime = new ConnectorRuntime(
  new ApiConnector(),
  "api"
);

console.assert(runtime.name === "api");

console.log("Connector Runtime OK");
