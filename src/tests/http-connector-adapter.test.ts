import { createHttpClient } from "@/core/http-client-factory";
import { HttpConnectorAdapter } from "@/core/http-connector-adapter";

const adapter = new HttpConnectorAdapter(
  createHttpClient()
);

console.assert(adapter.client !== undefined);

console.log("HTTP Connector Adapter OK");
