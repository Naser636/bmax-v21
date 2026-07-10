import { collectConnectorTelemetry } from "@/core/connector-telemetry";

const telemetry = collectConnectorTelemetry([
  {
    connector: "api",
    timestamp: Date.now(),
    status: "UP",
  },
]);

console.assert(telemetry.events === 1);
console.assert(telemetry.lastEvent !== null);

console.log("Connector Telemetry OK");
