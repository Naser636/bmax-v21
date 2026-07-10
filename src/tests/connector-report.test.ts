import { createConnectorReport } from "@/core/connector-report";

const report = createConnectorReport([
  {
    connector: "api",
    timestamp: Date.now(),
    status: "UP",
  },
]);

console.assert(report.total === 1);
console.assert(report.up === 1);

console.log("Connector Report OK");
