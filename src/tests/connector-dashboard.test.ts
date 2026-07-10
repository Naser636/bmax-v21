import { buildConnectorDashboard } from "@/core/connector-dashboard";

const dashboard = buildConnectorDashboard([
  {
    connector: "api",
    timestamp: Date.now(),
    status: "UP",
  },
]);

console.assert(dashboard.total === 1);
console.assert(dashboard.online === 1);

console.log("Connector Dashboard OK");
