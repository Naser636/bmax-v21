import { ConnectorConfig } from "@/core/connector-config";

const config: ConnectorConfig = {
  name: "api",
  type: "API",
  enabled: true,
  timeout: 5000,
};

console.assert(config.enabled);
console.log("Connector Config OK");
