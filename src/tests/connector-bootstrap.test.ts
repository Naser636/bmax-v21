import { bootstrapConnectors } from "@/core/connector-bootstrap";

const connectors = bootstrapConnectors([
  { name: "api", type: "API", enabled: true, timeout: 5000 },
  { name: "web", type: "WEB", enabled: true, timeout: 5000 },
]);

console.assert(connectors.length === 2);

console.log("Connector Bootstrap OK");
