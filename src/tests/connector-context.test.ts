import { ApiConnector } from "@/core/api-connector";
import { ConnectorContext } from "@/core/connector-context";

const context: ConnectorContext = {
  name: "api",
  connector: new ApiConnector(),
  state: "INIT",
};

console.assert(context.name === "api");

console.log("Connector Context OK");
