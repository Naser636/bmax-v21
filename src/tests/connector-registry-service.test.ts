import { registerConnector, getConnector, getConnectorNames } from "@/core/connector-registry-service";
import { ApiConnector } from "@/core/api-connector";

registerConnector("api", new ApiConnector());

console.assert(getConnector("api") !== undefined);
console.assert(getConnectorNames().includes("api"));

console.log("Connector Registry Service OK");
