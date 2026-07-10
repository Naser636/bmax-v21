import { createConnectorSnapshot } from "@/core/connector-snapshot";

const snapshot = createConnectorSnapshot([
  {
    connector: "api",
    timestamp: Date.now(),
    status: "UP",
  },
]);

console.assert(snapshot.length === 1);

console.log("Connector Snapshot OK");
