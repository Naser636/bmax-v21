import { ApiConnector } from "@/core/api-connector";
import { WebConnector } from "@/core/web-connector";
import { ConnectorPool } from "@/core/connector-pool";

const pool = new ConnectorPool([
  new ApiConnector(),
  new WebConnector(),
]);

console.assert(pool.size() === 2);

console.log("Connector Pool OK");
