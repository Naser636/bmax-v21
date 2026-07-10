import { createHttpClient } from "@/core/http-client-factory";
import { HttpConnectorAdapter } from "@/core/http-connector-adapter";
import {
  registerHttpConnector,
  getHttpConnector,
} from "@/core/http-connector-registry";

registerHttpConnector(
  "default",
  new HttpConnectorAdapter(createHttpClient())
);

console.assert(getHttpConnector("default") !== undefined);

console.log("HTTP Connector Registry OK");
