import { canUseConnector } from "@/core/connector-policy";

console.assert(
  canUseConnector({
    name: "api",
    type: "API",
    enabled: true,
    timeout: 5000,
  })
);

console.log("Connector Policy OK");
