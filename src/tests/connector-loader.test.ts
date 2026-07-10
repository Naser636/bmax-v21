import { loadConnector } from "@/core/connector-loader";

const connector = loadConnector({
  name: "api",
  type: "API",
  enabled: true,
  timeout: 5000,
});

console.assert(connector !== undefined);

console.log("Connector Loader OK");
