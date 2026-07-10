import { ApiConnector } from "@/core/api-connector";
import { ConnectorRuntime } from "@/core/connector-runtime";
import {
  registerRuntime,
  getRuntime,
} from "@/core/connector-registry-runtime";

registerRuntime(
  "api",
  new ConnectorRuntime(new ApiConnector(), "api")
);

console.assert(getRuntime("api") !== undefined);

console.log("Connector Registry Runtime OK");
