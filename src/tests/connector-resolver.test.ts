import { resolveConnector } from "@/core/connector-resolver";

const connector = resolveConnector({
  name: "web",
  type: "WEB",
  enabled: true,
  timeout: 5000,
});

console.assert(connector !== undefined);

console.log("Connector Resolver OK");
